// 镜头：固定斜俯视角。单指拖动平移，双指或滚轮缩放，轻点触发 tap。
import * as THREE from 'three';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class CameraRig {
  constructor(dom, aspect) {
    this.cam = new THREE.PerspectiveCamera(30, aspect, 0.5, 400);
    this.focus = new THREE.Vector3();
    this.dist = 22; this.minDist = 9; this.maxDist = 60;
    this.pitch = THREE.MathUtils.degToRad(47); this.yaw = THREE.MathUtils.degToRad(-24);
    this.bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
    this.locked = false; this.onTap = null; this.onMove = null;
    this.vel = new THREE.Vector2(); this.fly = null;
    this._ptrs = new Map(); this._drag = null; this._ray = new THREE.Raycaster(); this._v = new THREE.Vector3();
    this.dom = dom;
    dom.addEventListener('pointerdown', (e) => this._down(e));
    dom.addEventListener('pointermove', (e) => this._moveEv(e));
    dom.addEventListener('pointerup', (e) => this._up(e));
    dom.addEventListener('pointercancel', (e) => this._up(e, true));
    dom.addEventListener('wheel', (e) => { e.preventDefault(); if (!this.locked) this.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
    this.apply();
  }
  apply() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.cam.position.set(this.focus.x + Math.sin(this.yaw) * cp * this.dist, sp * this.dist, this.focus.z + Math.cos(this.yaw) * cp * this.dist);
    this.cam.lookAt(this.focus.x, 0.4, this.focus.z);
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
  zoom(f) { this.dist = THREE.MathUtils.clamp(this.dist * f, this.minDist, this.maxDist); this.fly = null; }
  clamp() {
    const b = this.bounds;
    this.focus.x = THREE.MathUtils.clamp(this.focus.x, b.minX, b.maxX);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z, b.minZ, b.maxZ);
  }
  /** 平滑飞到某点，返回 Promise */
  flyTo(x, z, dist = this.dist, sec = 1.4) {
    return new Promise((res) => { this.fly = { fx: this.focus.x, fz: this.focus.z, fd: this.dist, x, z, d: dist, t: 0, sec, res }; this.vel.set(0, 0); });
  }
  _down(e) {
    if (this.locked) return;
    this.dom.setPointerCapture?.(e.pointerId);
    this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._ptrs.size === 1) this._drag = { x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false, last: this.ground(e.clientX, e.clientY) };
    else if (this._ptrs.size === 2) { const [a, b] = [...this._ptrs.values()]; this._pinch = Math.hypot(a.x - b.x, a.y - b.y); if (this._drag) this._drag.moved = true; }
    this.vel.set(0, 0); this.fly = null;
  }
  _moveEv(e) {
    const p = this._ptrs.get(e.pointerId);
    if (!p) { this.onMove?.(e.clientX, e.clientY); return; }
    p.x = e.clientX; p.y = e.clientY;
    if (this.locked) return;
    if (this._ptrs.size === 2) {
      const [a, b] = [...this._ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this._pinch > 0 && d > 0) this.zoom(this._pinch / d);
      this._pinch = d; return;
    }
    const dr = this._drag; if (!dr) return;
    if (!dr.moved && Math.hypot(e.clientX - dr.x0, e.clientY - dr.y0) > 7) { dr.moved = true; dr.last = this.ground(e.clientX, e.clientY); }
    if (dr.moved) {
      const g = this.ground(e.clientX, e.clientY), dx = dr.last.x - g.x, dz = dr.last.z - g.z;
      this.focus.x += dx; this.focus.z += dz; this.clamp(); this.apply();
      this.vel.set(dx, dz).multiplyScalar(60);
      dr.last = this.ground(e.clientX, e.clientY);
    }
  }
  _up(e, cancel) {
    const had = this._ptrs.delete(e.pointerId);
    if (!had) return;
    const dr = this._drag;
    if (this._ptrs.size === 0) {
      this._drag = null; this._pinch = 0;
      if (!cancel && dr && !dr.moved && performance.now() - dr.t0 < 600 && !this.locked) { this.vel.set(0, 0); this.onTap?.(e.clientX, e.clientY); }
    } else if (this._ptrs.size === 1) { const [a] = [...this._ptrs.values()]; this._drag = { x0: a.x, y0: a.y, t0: 0, moved: true, last: this.ground(a.x, a.y) }; }
  }
  update(dt) {
    if (this.fly) {
      const f = this.fly; f.t = Math.min(1, f.t + dt / f.sec); const k = ease(f.t);
      this.focus.x = f.fx + (f.x - f.fx) * k; this.focus.z = f.fz + (f.z - f.fz) * k; this.dist = f.fd + (f.d - f.fd) * k;
      if (f.t >= 1) { this.fly = null; f.res(); }
    } else if (!this._drag && this.vel.lengthSq() > 0.01) {
      this.focus.x += this.vel.x * dt; this.focus.z += this.vel.y * dt; this.vel.multiplyScalar(Math.exp(-dt * 6)); this.clamp();
    }
    this.apply();
  }
}
