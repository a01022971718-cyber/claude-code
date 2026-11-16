// 镜头：自由环绕。单指拖动平移；双指捏合缩放、旋转、上下推改俯角；鼠标右键（或按住 Shift）拖动旋转，滚轮缩放；轻点触发 tap，双击聚焦。
// 手感相关的处理（都在这一个文件里）：
//  - 触摸预测：用浏览器给的预测点（getPredictedEvents）提前半步移动，减少“手指跑在画面前面”的感觉；预测距离有上限，避免过冲。
//  - 惯性：松手时用最近 100ms 的轨迹做最小二乘拟合求速度（比只看最后一下稳定），再按指数阻尼减速；旋转也有惯性。
//  - 双指手势判定：缩放随时生效；旋转要累计转过约 7° 才启动，俯角要两指一起推过 16px 且几乎没捏合才启动——捏合缩放时不会误转。
//  - 捏合中心缩放：两指中点（或鼠标所在点）下面的地面在缩放时保持不动，像地图应用一样。
//  - 边界回弹：拖出岛屿范围时阻力变大，松手后弹回。
//  - 防误触：拖动起步有死区（触屏 10px、鼠标 6px）；双指刚抬起的 300ms 内不算点击。
// 角度和距离都有目标值，镜头按指数平滑追过去。
import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const ROT_ENGAGE = 0.12, TILT_ENGAGE = 16, PRED_MAX = 24, PRED_K = 0.5;

export class CameraRig {
  constructor(dom, aspect) {
    this.cam = new THREE.PerspectiveCamera(30, aspect, 0.5, 400);
    this.focus = new THREE.Vector3();
    this.dist = 22; this.minDist = 3.5; this.maxDist = 60;
    this.pitch = THREE.MathUtils.degToRad(47); this.yaw = THREE.MathUtils.degToRad(-24);
    this.minPitch = THREE.MathUtils.degToRad(8); this.maxPitch = THREE.MathUtils.degToRad(82);
    this.free = false;              // true：允许旋转和改俯角（自由画布、高画质）
    this.target = { yaw: this.yaw, pitch: this.pitch, dist: this.dist };
    this.lookY = 0.4;
    this.bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
    this.locked = false; this.onTap = null; this.onMove = null; this.onDoubleTap = null;
    this.vel = new THREE.Vector2(); this.yawVel = 0; this.fly = null;
    this._ptrs = new Map(); this._drag = null; this._ray = new THREE.Raycaster(); this._v = new THREE.Vector3();
    this._trail = []; this._lastMulti = 0; this._lastTap = null;
    this.dom = dom;
    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._moveEv(e));
    dom.addEventListener('pointerup', (e) => this._up(e));
    dom.addEventListener('pointercancel', (e) => this._up(e, true));
    dom.addEventListener('wheel', (e) => { e.preventDefault(); if (!this.locked) this.zoom(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY); }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.apply();
  }
  apply() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.cam.position.set(this.focus.x + Math.sin(this.yaw) * cp * this.dist, sp * this.dist, this.focus.z + Math.cos(this.yaw) * cp * this.dist);
    this.cam.lookAt(this.focus.x, this.lookY, this.focus.z);
    this.cam.updateMatrixWorld();
  }
  /** 屏幕坐标 → y 平面上的世界点 */
  ground(cx, cy, y = 0, out = new THREE.Vector3()) {
    const r = this.dom.getBoundingClientRect();
    this._v.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5);
    this._ray.setFromCamera(this._v, this.cam);
    const o = this._ray.ray.origin, d = this._ray.ray.direction, t = (y - o.y) / d.y;
    return out.set(o.x + d.x * t, y, o.z + d.z * t);
  }
  ray(cx, cy) {
    const r = this.dom.getBoundingClientRect();
    this._v.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5);
    this._ray.setFromCamera(this._v, this.cam);
    return this._ray;
  }
  /** 世界点 → 屏幕像素坐标（相对画布） */
  project(x, y, z) {
    const v = this._v.set(x, y, z).project(this.cam), r = this.dom.getBoundingClientRect();
    return [(v.x * 0.5 + 0.5) * r.width, (-v.y * 0.5 + 0.5) * r.height, v.z < 1];
  }
  /** 缩放（乘法 = 对数尺度，远近手感一致）。给了屏幕点就以它为中心：那一点下面的地面不动 */
  zoom(f, cx, cy) {
    const T = this.target, before = T.dist;
    T.dist = THREE.MathUtils.clamp(T.dist * f, this.minDist, this.maxDist); this.fly = null;
    if (cx != null && this.free) {
      const g = this.ground(cx, cy, 0.4), k = 1 - T.dist / before;
      this.focus.x += (g.x - this.focus.x) * k; this.focus.z += (g.z - this.focus.z) * k;
    }
  }
  rotate(dyaw, dpitch) {
    if (!this.free) return;
    this.target.yaw += dyaw; this.target.pitch = THREE.MathUtils.clamp(this.target.pitch + dpitch, this.minPitch, this.maxPitch); this.fly = null;
  }
  /** 直接设定角度（不经过平滑） */
  setView({ yaw = this.target.yaw, pitch = this.target.pitch, dist = this.target.dist } = {}) {
    this.target.yaw = this.yaw = yaw; this.target.pitch = this.pitch = pitch; this.target.dist = this.dist = dist; this.yawVel = 0; this.apply();
  }
  clamp() {
    const b = this.bounds;
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, b.minX, b.maxX);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, b.minZ, b.maxZ);
  }
  /** 超出边界的部分：拖动时阻力加大（只走 35%） */
  _soft(dx, dz) {
    const b = this.bounds, f = this.focus;
    const ox = f.x < b.minX ? b.minX - f.x : f.x > b.maxX ? f.x - b.maxX : 0, oz = f.z < b.minZ ? b.minZ - f.z : f.z > b.maxZ ? f.z - b.maxZ : 0;
    const out = (o, d, lo, hi, v) => ((v <= lo && d < 0) || (v >= hi && d > 0) ? d * 0.35 / (1 + o) : d);
    return [out(ox, dx, b.minX, b.maxX, f.x), out(oz, dz, b.minZ, b.maxZ, f.z)];
  }
  /** 平滑飞到某点，返回 Promise */
  flyTo(x, z, dist = this.dist, sec = 1.4, view = null) {
    return new Promise((res) => { this.fly = { fx: this.focus.x, fz: this.focus.z, fd: this.dist, fy: this.yaw, fp: this.pitch, x, z, d: dist, y: view?.yaw ?? this.yaw, p: view?.pitch ?? this.pitch, t: 0, sec, res }; this.vel.set(0, 0); this.yawVel = 0; });
  }
  _down(e) {
    if (this.locked) return;
    this.dom.setPointerCapture?.(e.pointerId);
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.onInput?.();
    const orbit = this.free && (e.button === 2 || e.button === 1 || e.shiftKey);
    if (this._ptrs.size === 1) {
      this._drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, last: this.ground(e.clientX, e.clientY), orbit, px: e.clientX, py: e.clientY, slop: e.pointerType === 'mouse' ? 6 : 10 };
      this._trail = [];
    } else if (this._ptrs.size === 2) {
      const [a, b] = [...this._ptrs.values()];
      this._g2 = { pinch: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, rotAcc: 0, tiltAcc: 0, pinch0: Math.hypot(a.x - b.x, a.y - b.y), rot: false, tilt: false };
      if (this._drag) this._drag.moved = true;
    }
    this.vel.set(0, 0); this.yawVel = 0; this.fly = null;
  }
  _moveEv(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p) { this.onMove?.(e.clientX, e.clientY); return; }
    p.x = e.clientX; p.y = e.clientY;
    if (this.locked) return;
    if (this._ptrs.size === 2 && this._g2) {
      const G = this._g2, [a, b] = [...this._ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (G.pinch > 0 && d > 0) this.zoom(G.pinch / d, mx, my);
      if (this.free) {
        let da = ang - G.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); G.rotAcc += da; G.tiltAcc += my - G.midY;
        // 手势判定：转动、推俯角要先过门槛；过了以后整次手势都有效
        if (!G.rot && Math.abs(G.rotAcc) > ROT_ENGAGE) G.rot = true;
        if (!G.tilt && Math.abs(G.tiltAcc) > TILT_ENGAGE && Math.abs(d / G.pinch0 - 1) < 0.08 && !G.rot) G.tilt = true;
        if (G.rot) { this.rotate(-da, 0); this.yawVel = -da * 60; this._rotT = performance.now(); }
        if (G.tilt) this.rotate(0, (my - G.midY) * 0.006);
      }
      G.pinch = d; G.ang = ang; G.midX = mx; G.midY = my; return;
    }
    const dr = this._drag; if (!dr) return;
    if (!dr.moved && Math.hypot(e.clientX - dr.x0, e.clientY - dr.y0) > dr.slop) { dr.moved = true; dr.last = this.ground(e.clientX, e.clientY); dr.px = e.clientX; dr.py = e.clientY; }
    if (dr.moved && dr.orbit) { const dy = -(e.clientX - dr.px) * 0.006; this.rotate(dy, (e.clientY - dr.py) * 0.005); this.yawVel = dy * 60; this._rotT = performance.now(); dr.px = e.clientX; dr.py = e.clientY; return; }
    if (dr.moved) {
      // 触摸预测：往浏览器预测的位置多走一半（上限 24px），下一次真实事件会自然校正
      let x = e.clientX, y = e.clientY;
      const pred = e.getPredictedEvents?.();
      if (pred && pred.length) { const q = pred[pred.length - 1]; let px = (q.clientX - x) * PRED_K, py = (q.clientY - y) * PRED_K; const l = Math.hypot(px, py); if (l > PRED_MAX) { px *= PRED_MAX / l; py *= PRED_MAX / l; } x += px; y += py; }
      const g = this.ground(x, y); let dx = dr.last.x - g.x, dz = dr.last.z - g.z;
      [dx, dz] = this._soft(dx, dz);
      this.focus.x += dx; this.focus.z += dz; this.apply();
      dr.last = this.ground(x, y);
      const t = performance.now(); this._trail.push([t, this.focus.x, this.focus.z]); while (this._trail.length > 2 && t - this._trail[0][0] > 100) this._trail.shift();
    }
  }
  /** 最近 100ms 轨迹的最小二乘速度（世界单位/秒） */
  _fitVel() {
    const T = this._trail; if (T.length < 3) return [0, 0];
    const t0 = T[T.length - 1][0]; if (performance.now() - t0 > 60) return [0, 0];   // 停住以后才松手：不甩
    let st = 0, sx = 0, sz = 0, stt = 0, stx = 0, stz = 0; const n = T.length;
    for (const [t, x, z] of T) { const u = (t - t0) / 1000; st += u; sx += x; sz += z; stt += u * u; stx += u * x; stz += u * z; }
    const den = n * stt - st * st; if (Math.abs(den) < 1e-9) return [0, 0];
    return [(n * stx - st * sx) / den, (n * stz - st * sz) / den];
  }
  _up(e, cancel) {
    const had = this._ptrs.delete(e.pointerId);
    if (!had) return;
    const dr = this._drag, now = performance.now();
    if (this._ptrs.size === 0) {
      this._drag = null; this._g2 = null;
      if (now - (this._rotT || 0) > 60) this.yawVel = 0;   // 停住再松手：不继续转
      if (dr?.moved && !dr.orbit) { const [vx, vz] = this._fitVel(); this.vel.set(vx, vz).clampLength(0, 40); }
      const isTap = !cancel && dr && !dr.moved && !dr.orbit && now - dr.t0 < 600 && !this.locked && now - this._lastMulti > 300;
      if (isTap) {
        this.vel.set(0, 0);
        const L = this._lastTap;
        if (L && now - L.t < 320 && Math.hypot(L.x - e.clientX, L.y - e.clientY) < 30 && this.onDoubleTap?.(e.clientX, e.clientY)) this._lastTap = null;
        else { this._lastTap = { t: now, x: e.clientX, y: e.clientY }; this.onTap?.(e.clientX, e.clientY); }
      }
    } else if (this._ptrs.size === 1) {
      this._lastMulti = now; this._g2 = null;
      const [a] = [...this._ptrs.values()]; this._drag = { x0: a.x, y0: a.y, t0: 0, moved: true, last: this.ground(a.x, a.y), slop: 10 }; this._trail = [];
    }
  }
  update(dt) {
    if (this.fly) {
      const f = this.fly; f.t = Math.min(1, f.t + dt / f.sec); const k = ease(f.t);
      this.focus.x = f.fx + (f.x - f.fx) * k; this.focus.z = f.fz + (f.z - f.fz) * k; this.dist = f.fd + (f.d - f.fd) * k;
      this.yaw = f.fy + (f.y - f.fy) * k; this.pitch = f.fp + (f.p - f.fp) * k;
      this.target.dist = this.dist; this.target.yaw = this.yaw; this.target.pitch = this.pitch;
      if (f.t >= 1) { this.fly = null; f.res(); }
    } else if (!this._drag) {
      // 平移惯性 + 指数阻尼；超出边界时弹回（弹簧）
      if (this.vel.lengthSq() > 0.0004) { this.focus.x += this.vel.x * dt; this.focus.z += this.vel.y * dt; this.vel.multiplyScalar(Math.exp(-dt * 5)); }
      const b = this.bounds, cx = THREE.MathUtils.clamp(this.focus.x, b.minX, b.maxX), cz = THREE.MathUtils.clamp(this.focus.z, b.minZ, b.maxZ);
      if (cx !== this.focus.x || cz !== this.focus.z) { const k = 1 - Math.exp(-dt * 8); this.focus.x += (cx - this.focus.x) * k; this.focus.z += (cz - this.focus.z) * k; this.vel.multiplyScalar(0.8); }
      // 旋转惯性
      if (Math.abs(this.yawVel) > 0.01 && !this._ptrs.size) { this.target.yaw += this.yawVel * dt; this.yawVel *= Math.exp(-dt * 4); }
    }
    if (!this.fly) {
      const k = 1 - Math.exp(-dt * 9), T = this.target;
      this.dist += (T.dist - this.dist) * k; this.yaw += (T.yaw - this.yaw) * k; this.pitch += (T.pitch - this.pitch) * k;
    }
    this.apply();
  }
}
