// 镜头：自由环绕。
// 操作：
//  - 触屏：单指拖动平移；双指同向拖动 = 左右转、上下改俯角；双指张合 = 缩放（以两指中点为中心），张合时扭转 = 旋转，中点移动 = 平移。
//  - 鼠标：左键拖动平移；右键、中键或 Shift+左键拖动 = 旋转和改俯角；滚轮缩放（以鼠标所在点为中心）。
//  - 键盘：WASD / 方向键平移，Q/E 旋转，R/F 抬高/放低，+/- 缩放。
//  - 轻点触发 tap，双击聚焦；预设机位和自动环绕由界面调用 preset() / orbit。
// 镜头模型：
//  - 枢轴（镜头绕着转、对准的点）贴着焦点下方的地面或海面，平滑跟随；镜头高度 = 枢轴高度 + 距离 × sin(俯角)。
//  - 最近能拉到 1 个单位左右的特写；镜头不会钻进地面或海面（离表面至少 0.12）；近处自动缩小近裁剪面。
//  - 缩放联动俯角（设置里可关）：拉近时镜头慢慢放低成侧视，拉远时抬高成俯瞰；手动调过的俯角作为偏移保留。
//  - 视野（FOV）可选窄 / 标准 / 广，拉近时自动放宽一点。
//  - 拖动跟手：手指按住的那一点跟着手指走；镜头很平、手指指到天边时改按屏幕距离换算，不会一下甩出很远。
// 手感：触摸预测（有上限）、松手速度用最近 100ms 轨迹拟合、旋转惯性、边界阻力和回弹、拖动死区、双指抬起后 300ms 内不算点击。
// 角度和距离都有目标值，镜头按指数平滑追过去。
import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const PRED_MAX = 24, PRED_K = 0.5, CLASSIFY = 10, TWIST = 0.06;
const ss = THREE.MathUtils.smoothstep, clamp = THREE.MathUtils.clamp, deg = THREE.MathUtils.degToRad;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
/** 缩放联动俯角：距离 → 建议俯角（弧度）。1.3 单位约 11°，26 单位以上约 56°；实际按 60% 的幅度跟随 */
export const pitchCurve = (d) => 0.2 + 0.78 * ss(Math.log(d), Math.log(1.3), Math.log(26));
/** 视野档位（横屏的竖直视角，度；竖屏自动放宽） */
export const FOVS = { narrow: 24, std: 30, wide: 40 };

export class CameraRig {
  constructor(dom, aspect) {
    this.cam = new THREE.PerspectiveCamera(30, aspect, 0.3, 400);
    this.focus = new THREE.Vector3();
    this.dist = 22; this.minDist = 1.1; this.maxDist = 60;
    this.pitch = deg(47); this.yaw = deg(-24);
    this.minPitch = deg(3); this.maxPitch = deg(85);
    this.free = false;              // true：允许旋转和改俯角（自由画布、高画质）
    this.target = { yaw: this.yaw, pitch: this.pitch, dist: this.dist };
    this.lookY = 0.4;               // 枢轴高度
    this.heightAt = null;           // (x,z) => 地面高度（海上返回 null）；给了它，枢轴就贴着地面、镜头不钻地
    this.autoTilt = true; this.fovKey = 'std'; this.sens = 1; this.portrait = false;
    this.orbit = 0;                 // 自动环绕（弧度/秒）；任何操作都会让它停下
    this.bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
    this.locked = false; this.onTap = null; this.onMove = null; this.onDoubleTap = null; this.onFov = null;
    this.vel = new THREE.Vector2(); this.yawVel = 0; this.fly = null;
    this._ptrs = new Map(); this._drag = null; this._ray = new THREE.Raycaster(); this._v = new THREE.Vector3();
    this._ha = new THREE.Vector3(); this._hb = new THREE.Vector3(); this._hz = new THREE.Vector3();
    this._trail = []; this._lastMulti = 0; this._lastTap = null; this.keys = new Set();
    this.dom = dom;
    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._moveEv(e));
    dom.addEventListener('pointerup', (e) => this._up(e));
    dom.addEventListener('pointercancel', (e) => this._up(e, true));
    dom.addEventListener('wheel', (e) => { e.preventDefault(); if (!this.locked) { this.orbit = 0; this.zoom(Math.exp(e.deltaY * 0.0012), e.clientX, e.clientY); } }, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => this._key(e, true));
    addEventListener('keyup', (e) => this._key(e, false));
    addEventListener('blur', () => this.keys.clear());
    this.apply();
  }
  /** 镜头的世界位置：枢轴 + 球坐标；不低于脚下地面或海面 */
  apply() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), y0 = this.lookY;
    const x = this.focus.x + Math.sin(this.yaw) * cp * this.dist, z = this.focus.z + Math.cos(this.yaw) * cp * this.dist;
    let y = y0 + sp * this.dist;
    if (this.heightAt) { const floor = Math.max(this.heightAt(x, z) ?? 0, 0) + 0.12; if (y < floor) y = floor; }
    this.cam.position.set(x, y, z);
    this.cam.lookAt(this.focus.x, y0, this.focus.z);
    this.cam.updateMatrixWorld();
  }
  /** 视野：档位 + 拉近时放宽；近裁剪面跟着距离缩小（特写不被切掉） */
  updateFov(force = false) {
    let f = (FOVS[this.fovKey] || 30) + (1 - ss(this.dist, 1.5, 9)) * 10;
    if (this.portrait) f *= 1.45;
    const n = clamp(this.dist * 0.06, 0.06, 0.3);
    if (force || Math.abs(f - this.cam.fov) > 0.02 || Math.abs(n - this.cam.near) > 0.002) { this.cam.fov = f; this.cam.near = n; this.cam.updateProjectionMatrix(); this.onFov?.(); }
  }
  /** 屏幕坐标 → y 平面上的世界点 */
  ground(cx, cy, y = 0, out = new THREE.Vector3()) {
    const d = this.ray(cx, cy).ray.direction, o = this._ray.ray.origin, t = (y - o.y) / d.y;
    return out.set(o.x + d.x * t, y, o.z + d.z * t);
  }
  ray(cx, cy) {
    const r = this.dom.getBoundingClientRect();
    this._v.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5);
    this._ray.setFromCamera(this._v, this.cam);
    return this._ray;
  }
  /** 屏幕点射到枢轴高度的水平面；射线朝上、或交点远过 maxD 时返回 null */
  _hit(cx, cy, out, maxD = Infinity) {
    const ray = this.ray(cx, cy).ray, o = ray.origin, d = ray.direction;
    if (d.y > -0.03) return null;
    const t = (this.lookY - o.y) / d.y; if (t < 0 || t > maxD) return null;
    return out.set(o.x + d.x * t, this.lookY, o.z + d.z * t);
  }
  /** 世界点 → 屏幕像素坐标（相对画布） */
  project(x, y, z) {
    const v = this._v.set(x, y, z).project(this.cam), r = this.dom.getBoundingClientRect();
    return [(v.x * 0.5 + 0.5) * r.width, (-v.y * 0.5 + 0.5) * r.height, v.z < 1];
  }
  /** 平移：屏幕上从 (x0,y0) 拖到 (x1,y1)。能跟手就跟手；镜头很平、指到远处时按屏幕距离换算，
   *  跟手的位移最多是屏幕距离估算值的 1.8 倍（远处一小段手指移动不会把镜头甩出去好几个单位） */
  _pan(x0, y0, x1, y1) {
    const r = this.dom.getBoundingClientRect(), wpp = 2 * this.dist * Math.tan(this.cam.fov * Math.PI / 360) / r.height;
    const px = x1 - x0, py = y1 - y0, k = 1 / Math.max(Math.sin(this.pitch), 0.35), s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const ex = -c * px * wpp - s * py * wpp * k, ez = s * px * wpp - c * py * wpp * k;
    const lim = this.dist * 1.6 + 1, a = this._hit(x0, y0, this._ha, lim), b = a && this._hit(x1, y1, this._hb, lim);
    let dx = ex, dz = ez;
    if (a && b) {
      dx = a.x - b.x; dz = a.z - b.z;
      const L = Math.hypot(dx, dz), E = Math.hypot(ex, ez) * 1.8 + 1e-5; if (L > E) { dx *= E / L; dz *= E / L; }
    }
    [dx, dz] = this._soft(dx, dz);
    this.focus.x += dx; this.focus.z += dz;
  }
  /** 缩放（乘法 = 对数尺度，远近手感一致）。给了屏幕点就以它为中心：那一点下面的地面不动 */
  zoom(f, cx, cy) {
    const T = this.target, before = T.dist;
    T.dist = clamp(T.dist * f, this.minDist, this.maxDist); this.fly = null;
    if (this.free && this.autoTilt) T.pitch = clamp(T.pitch + (pitchCurve(T.dist) - pitchCurve(before)) * 0.6, this.minPitch, this.maxPitch);
    if (cx != null && this.free) {
      const g = this._hit(cx, cy, this._hz, this.dist * 3 + 2); if (!g) return;
      const k = 1 - T.dist / before; this.focus.x += (g.x - this.focus.x) * k; this.focus.z += (g.z - this.focus.z) * k;
    }
  }
  rotate(dyaw, dpitch) {
    if (!this.free) return;
    this.target.yaw += dyaw; this.target.pitch = clamp(this.target.pitch + dpitch, this.minPitch, this.maxPitch); this.fly = null;
  }
  /** 直接设定角度（不经过平滑） */
  setView({ yaw = this.target.yaw, pitch = this.target.pitch, dist = this.target.dist } = {}) {
    this.target.yaw = this.yaw = yaw; this.target.pitch = this.pitch = pitch; this.target.dist = this.dist = dist; this.yawVel = 0; this.apply();
  }
  clamp() {
    const b = this.bounds;
    this.focus.x = clamp(this.focus.x, b.minX, b.maxX);
    this.focus.z = clamp(this.focus.z, b.minZ, b.maxZ);
  }
  /** 超出边界的部分：拖动时阻力加大（只走 35%） */
  _soft(dx, dz) {
    const b = this.bounds, f = this.focus;
    const ox = f.x < b.minX ? b.minX - f.x : f.x > b.maxX ? f.x - b.maxX : 0, oz = f.z < b.minZ ? b.minZ - f.z : f.z > b.maxZ ? f.z - b.maxZ : 0;
    const out = (o, d, lo, hi, v) => ((v <= lo && d < 0) || (v >= hi && d > 0) ? d * 0.35 / (1 + o) : d);
    return [out(ox, dx, b.minX, b.maxX, f.x), out(oz, dz, b.minZ, b.maxZ, f.z)];
  }
  /** 平滑飞到某点，返回 Promise。转角走最近的方向，不会绕好几圈 */
  flyTo(x, z, dist = this.dist, sec = 1.4, view = null) {
    const y = view?.yaw != null ? this.yaw + wrap(view.yaw - this.yaw) : this.yaw;
    return new Promise((res) => { this.fly = { fx: this.focus.x, fz: this.focus.z, fd: this.dist, fy: this.yaw, fp: this.pitch, x, z, d: dist, y, p: view?.pitch ?? this.pitch, t: 0, sec, res }; this.vel.set(0, 0); this.yawVel = 0; });
  }
  /** 预设机位。home = { x, z, r }：岛的中心和半径 */
  preset(name, home) {
    const f = this.focus, yaw = this.target.yaw, h = home || { x: f.x, z: f.z, r: 6 };
    const P = {
      top: [h.x, h.z, clamp(h.r * 2.2 + 8, 12, this.maxDist), { yaw, pitch: 1.25 }],     // 俯瞰：整座岛
      three: [f.x, f.z, 13, { yaw, pitch: 0.62 }],                                       // 斜看：经典的 45° 视角
      eye: [f.x, f.z, 4.5, { yaw, pitch: 0.1 }],                                         // 平视：站在岛上看出去
      close: [f.x, f.z, 1.7, { yaw, pitch: 0.26 }],                                      // 特写：看清小动物和人
      reset: [h.x, h.z, 22, { yaw: -0.45, pitch: 0.62 }],                                // 复位
    }[name];
    if (!P) return null;
    this.orbit = 0;
    return this.flyTo(P[0], P[1], P[2], 1.0, P[3]);
  }
  _key(e, down) {
    if (e.target?.closest?.('input,textarea,select')) return;
    const k = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', '=', '+', '-', '_', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) return;
    if (down) { if (this.locked) return; this.keys.add(k); this.orbit = 0; this.fly = null; if (k.startsWith('arrow')) e.preventDefault(); } else this.keys.delete(k);
  }
  _keysTick(dt) {
    const K = this.keys; if (!K.size || this.locked) return;
    const has = (...k) => k.some((x) => K.has(x)), s = Math.sin(this.yaw), c = Math.cos(this.yaw), sp = (this.dist * 0.8 + 1) * dt;
    let mx = 0, mz = 0;
    if (has('w', 'arrowup')) { mx -= s; mz -= c; } if (has('s', 'arrowdown')) { mx += s; mz += c; }
    if (has('d', 'arrowright')) { mx += c; mz -= s; } if (has('a', 'arrowleft')) { mx -= c; mz += s; }
    if (mx || mz) { const [dx, dz] = this._soft(mx * sp, mz * sp); this.focus.x += dx; this.focus.z += dz; this.vel.set(0, 0); }
    if (has('q')) this.rotate(dt * 1.4 * this.sens, 0); if (has('e')) this.rotate(-dt * 1.4 * this.sens, 0);
    if (has('r')) this.rotate(0, dt * 0.8 * this.sens); if (has('f')) this.rotate(0, -dt * 0.8 * this.sens);
    if (has('=', '+')) this.zoom(Math.exp(-dt * 1.6)); if (has('-', '_')) this.zoom(Math.exp(dt * 1.6));
  }
  _down(e) {
    if (this.locked) return;
    this.dom.setPointerCapture?.(e.pointerId);
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.onInput?.(); this.orbit = 0;
    const orbit = this.free && (e.button === 2 || e.button === 1 || e.shiftKey);
    if (this._ptrs.size === 1) {
      this._drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, orbit, px: e.clientX, py: e.clientY, slop: e.pointerType === 'mouse' ? 6 : 10 };
      this._trail = [];
    } else if (this._ptrs.size === 2) {
      const [a, b] = [...this._ptrs.values()];
      this._g2 = { a0: { x: a.x, y: a.y }, b0: { x: b.x, y: b.y }, pinch: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, mode: this.free ? null : 'pinch', twist: 0, twisting: false };
      if (this._drag) this._drag.moved = true;
    }
    this.vel.set(0, 0); this.yawVel = 0; this.fly = null;
  }
  _moveEv(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p) { this.onMove?.(e.clientX, e.clientY); return; }
    p.x = e.clientX; p.y = e.clientY;
    if (this.locked) return;
    if (this._ptrs.size === 2 && this._g2) { this._two(); return; }
    const dr = this._drag; if (!dr) return;
    if (!dr.moved && Math.hypot(e.clientX - dr.x0, e.clientY - dr.y0) > dr.slop) { dr.moved = true; dr.px = e.clientX; dr.py = e.clientY; }
    if (!dr.moved) return;
    if (dr.orbit) { const dy = -(e.clientX - dr.px) * 0.006 * this.sens; this.rotate(dy, (e.clientY - dr.py) * 0.005 * this.sens); this.yawVel = dy * 60; this._rotT = performance.now(); dr.px = e.clientX; dr.py = e.clientY; return; }
    // 触摸预测：往浏览器预测的位置多走一半（上限 24px），下一次真实事件会自然校正
    let x = e.clientX, y = e.clientY;
    const pred = e.getPredictedEvents?.();
    if (pred && pred.length) { const q = pred[pred.length - 1]; let px = (q.clientX - x) * PRED_K, py = (q.clientY - y) * PRED_K; const l = Math.hypot(px, py); if (l > PRED_MAX) { px *= PRED_MAX / l; py *= PRED_MAX / l; } x += px; y += py; }
    this._pan(dr.px, dr.py, x, y); this.apply();
    dr.px = x; dr.py = y;
    const t = performance.now(); this._trail.push([t, this.focus.x, this.focus.z]); while (this._trail.length > 2 && t - this._trail[0][0] > 100) this._trail.shift();
  }
  /** 双指：先看头 10px 两指怎么动——同向 = 转视角（左右转、上下改俯角），反向或一指不动 = 张合缩放（可同时扭转、平移） */
  _two() {
    const G = this._g2, [a, b] = [...this._ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (!G.mode) {
      const ax = a.x - G.a0.x, ay = a.y - G.a0.y, bx = b.x - G.b0.x, by = b.y - G.b0.y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      // 两根手指的事件是一根一根到的：等两指都动了再看方向；只有一指在动（另一指按住不动）就是缩放
      if (la > CLASSIFY * 0.6 && lb > CLASSIFY * 0.6) G.mode = (ax * bx + ay * by) / (la * lb) > 0.5 ? 'orbit' : 'pinch';
      else if (Math.max(la, lb) > CLASSIFY * 2.2) G.mode = 'pinch';
      else return;   // 还没判定：先不动，避免一上来就误缩放
    }
    const now = performance.now();
    if (G.mode === 'orbit') {
      const dyaw = -(mx - G.midX) * 0.0065 * this.sens;
      this.rotate(dyaw, (my - G.midY) * 0.0045 * this.sens); this.yawVel = dyaw * 60; this._rotT = now;
    } else {
      if (G.pinch > 0 && d > 0) this.zoom(G.pinch / d, mx, my);
      this._pan(G.midX, G.midY, mx, my);
      if (this.free) {
        const da = wrap(ang - G.ang); G.twist += da;
        if (!G.twisting && Math.abs(G.twist) > TWIST) G.twisting = true;
        if (G.twisting) { this.rotate(-da, 0); this.yawVel = -da * 60; this._rotT = now; }
      }
    }
    G.pinch = d; G.ang = ang; G.midX = mx; G.midY = my;
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
      const [a] = [...this._ptrs.values()]; this._drag = { x0: a.x, y0: a.y, t0: 0, moved: true, px: a.x, py: a.y, slop: 10 }; this._trail = [];
    }
  }
  update(dt) {
    this._keysTick(dt);
    if (this.fly) {
      const f = this.fly; f.t = Math.min(1, f.t + dt / f.sec); const k = ease(f.t);
      this.focus.x = f.fx + (f.x - f.fx) * k; this.focus.z = f.fz + (f.z - f.fz) * k; this.dist = f.fd + (f.d - f.fd) * k;
      this.yaw = f.fy + (f.y - f.fy) * k; this.pitch = f.fp + (f.p - f.fp) * k;
      this.target.dist = this.dist; this.target.yaw = this.yaw; this.target.pitch = this.pitch;
      if (f.t >= 1) { this.fly = null; f.res(); }
    } else if (!this._drag) {
      // 平移惯性 + 指数阻尼；超出边界时弹回（弹簧）
      if (this.vel.lengthSq() > 0.0004) { this.focus.x += this.vel.x * dt; this.focus.z += this.vel.y * dt; this.vel.multiplyScalar(Math.exp(-dt * 5)); }
      const b = this.bounds, cx = clamp(this.focus.x, b.minX, b.maxX), cz = clamp(this.focus.z, b.minZ, b.maxZ);
      if (cx !== this.focus.x || cz !== this.focus.z) { const k = 1 - Math.exp(-dt * 8); this.focus.x += (cx - this.focus.x) * k; this.focus.z += (cz - this.focus.z) * k; this.vel.multiplyScalar(0.8); }
      // 旋转惯性；自动环绕
      if (Math.abs(this.yawVel) > 0.01 && !this._ptrs.size) { this.target.yaw += this.yawVel * dt; this.yawVel *= Math.exp(-dt * 4); }
      if (this.orbit && !this._ptrs.size) this.target.yaw += this.orbit * dt;
    }
    if (!this.fly) {
      const k = 1 - Math.exp(-dt * 9), T = this.target;
      this.dist += (T.dist - this.dist) * k; this.yaw += (T.yaw - this.yaw) * k; this.pitch += (T.pitch - this.pitch) * k;
    }
    // 枢轴贴着焦点下方的地面（海上是海面）
    if (this.heightAt) { const h = Math.max(this.heightAt(this.focus.x, this.focus.z) ?? 0, 0); this.lookY += (h - this.lookY) * (1 - Math.exp(-dt * 5)); }
    this.updateFov();
    this.apply();
  }
}
