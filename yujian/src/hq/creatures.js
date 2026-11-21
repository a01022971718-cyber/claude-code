// AI 创造的动物：按配方生成的身体、腿、翅膀（forge.js），在岛上按自己的习性活动：
//  walk 走（迈腿、轻微颠簸）· hop 跳（抛物线，落地压扁）· fly 飞（离地 0.3–0.9，扇翅）· swim 游（在近岸海面，尾巴摆）· slither 蛇行（左右扭着走）。
// 栖息地是某种地块（含 AI 新造的生态）或“任意陆地”或“海”。会自动在栖息地上住下几只，玩家也可以从建造栏里放。
// 部件都是隐藏的占位网格，由画面统一合批绘制。
import * as THREE from 'three';
import { creatureParts } from './forge.js';
import { G } from './waves.js';

const PARTS = new Map();   // 物种 id → 生成好的部件几何（同种共用）

export class CreatureLayer {
  constructor(view) {
    this.view = view; this.group = new THREE.Group(); view.scene.add(this.group);
    this.list = []; this.specs = new Map(); this.sig = '';
  }
  /** 换一套物种（读档、AI 新造了动物）。voxel：体素主题用方块搭 */
  setSpecs(specs, voxel) {
    this.voxel = voxel; this.specs = new Map(specs.map((s) => [s.id, s]));
    for (const k of [...PARTS.keys()]) if (!this.specs.has(k)) PARTS.delete(k);
    this.clear(true); this.sig = '';
  }
  _parts(id) {
    let p = PARTS.get(id); if (p) return p;
    const sp = this.specs.get(id); if (!sp) return null;
    p = creatureParts(sp, this.voxel); for (const g of [p.body, ...p.legs.map((l) => l.geo), ...p.wings.map((w) => w.geo)]) g.userData.shared = true;
    PARTS.set(id, p); return p;
  }
  clear(all = false) { for (let i = this.list.length - 1; i >= 0; i--) { const c = this.list[i]; if (all || c.auto) { this.group.remove(c.g); this.list.splice(i, 1); } } }
  /** 能不能待在这里 */
  ok(sp, x, z) {
    const T = this.view.terrain, t = T.tileAt(x, z);
    if (sp.habitat === 'sea') return !t && T.landDist(x, z) > 0.25 && T.landDist(x, z) < 3;
    if (!t) return false;
    if (T.riverD && T.riverD(x, z) < 0.15) return false;
    return sp.habitat === 'land' || sp.habitat === t.t || sp.habitat === 'any' || sp.move === 'fly';
  }
  _ground(sp, x, z) { return sp.habitat === 'sea' ? (this.view.ocean ? this.view.ocean.surfaceAt(x, z).h : 0) : this.view.terrain.heightAt(x, z) ?? 0; }
  /** 在 (x,z) 附近放一只。返回是否成功 */
  spawn(id, x, z, auto = false) {
    const sp = this.specs.get(id), P = this._parts(id); if (!sp || !P) return false;
    let px = x, pz = z, found = false;
    for (let k = 0; k < 30 && !found; k++) { const a = Math.random() * 6.28, r = k ? Math.random() * 0.6 : 0; px = x + Math.cos(a) * r; pz = z + Math.sin(a) * r; found = this.ok(sp, px, pz); }
    if (!found) return false;
    const mat = this.view.mats.clay, g = new THREE.Group(), body = new THREE.Mesh(P.body, mat); body.castShadow = sp.move !== 'swim'; g.add(body);
    const legs = P.legs.map((l) => { const m = new THREE.Mesh(l.geo, mat); m.position.fromArray(l.pivot); m.geometry.userData.pv ||= l.pivot; g.add(m); return m; });
    const wings = P.wings.map((w) => { const m = new THREE.Mesh(w.geo, mat); m.position.fromArray(w.pivot); g.add(m); return { m, side: w.side }; });
    // 部件几何是按模型坐标做的：腿和翅膀要绕关节转，先把几何挪到关节为原点（同种只做一次）
    for (const [m, pv] of [...legs.map((m, i) => [m, P.legs[i].pivot]), ...wings.map((w, i) => [w.m, P.wings[i].pivot])]) if (!m.geometry.userData.centered) { m.geometry.translate(-pv[0], -pv[1], -pv[2]); m.geometry.userData.centered = true; }
    g.position.set(px, this._ground(sp, px, pz), pz); this.group.add(g);
    this.list.push({ sp, g, legs, wings, auto, home: [px, pz], tx: px, tz: pz, yaw: Math.random() * 6.28, wait: Math.random() * 3, t: 0, hop: null, alt: 0.4 + Math.random() * 0.5, ph: Math.random() * 6 });
    return true;
  }
  /** 自动住下：每种动物在自己的栖息地上住 count 只（岛变了就重排） */
  populate() {
    const T = this.view.terrain, sig = T.tiles.length + '|' + [...this.specs.keys()].join(',');
    if (sig === this.sig) return; this.sig = sig; this.clear(false);
    for (const sp of this.specs.values()) {
      const cand = sp.habitat === 'sea' ? T.tiles.filter((t) => [0, 1, 2, 3, 4, 5].some((k) => !T.has(t.q + [1, 0, -1, -1, 0, 1][k], t.r + [0, 1, 1, 0, -1, -1][k]))) : T.tiles.filter((t) => sp.habitat === 'land' || sp.habitat === 'any' || sp.habitat === t.t || sp.move === 'fly');
      if (!cand.length) continue;
      for (let i = 0; i < (sp.count || 3); i++) { const t = cand[Math.floor(Math.random() * cand.length)], off = sp.habitat === 'sea' ? 1.1 : 0.3; const a = Math.random() * 6.28; this.spawn(sp.id, t.x + Math.cos(a) * off, t.z + Math.sin(a) * off, true); }
    }
  }
  update(dt, t) {
    for (const c of this.list) {
      const { sp, g } = c, p = g.position, S = +sp.size || 0.08, mv = sp.move || 'walk';
      c.wait -= dt;
      if (c.wait < 0 && !c.hop) {
        // 选下一个去处
        for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28, r = (mv === 'fly' ? 1.2 : mv === 'swim' ? 0.9 : 0.5) * Math.random() + 0.1, x = c.home[0] + Math.cos(a) * r, z = c.home[1] + Math.sin(a) * r; if (this.ok(sp, x, z)) { c.tx = x; c.tz = z; break; } }
        c.wait = 2 + Math.random() * 5;
      }
      const dx = c.tx - p.x, dz = c.tz - p.z, d = Math.hypot(dx, dz);
      let moving = d > 0.02, sy = 1, roll = 0, pitch = 0;
      if (moving) { let dy = Math.atan2(dx, dz) - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, dt * 4); }
      if (mv === 'hop') {
        if (!c.hop && moving && c.wait > 0) { const step = Math.min(d, S * 1.2), nx = p.x + dx / d * step, nz = p.z + dz / d * step; c.hop = { x0: p.x, z0: p.z, y0: p.y, x1: nx, z1: nz, y1: this._ground(sp, nx, nz), t: 0, T: 0.32 }; }
        if (c.hop) { const h = c.hop; h.t += dt; const u = Math.min(1, h.t / h.T), tt = u * h.T, vy = (h.y1 - h.y0 + 0.5 * G * h.T * h.T) / h.T; p.set(h.x0 + (h.x1 - h.x0) * u, h.y0 + vy * tt - 0.5 * G * tt * tt, h.z0 + (h.z1 - h.z0) * u); sy = 1 + Math.sin(u * Math.PI) * 0.15; if (u >= 1) { c.hop = null; c.wait = Math.min(c.wait, 0.15 + Math.random() * 0.4); } }
        else sy = 1 - Math.max(0, Math.sin(t * 3 + c.ph)) * 0.04;
      } else {
        const sp0 = mv === 'fly' ? 0.35 : mv === 'swim' ? 0.12 : mv === 'slither' ? 0.07 : Math.max(0.05, S * 0.9);
        if (moving) { const k = Math.min(d, sp0 * dt) / d; p.x += dx * k; p.z += dz * k; }
        const gy = this._ground(sp, p.x, p.z);
        if (mv === 'fly') { p.y += (gy + c.alt + Math.sin(t * 1.3 + c.ph) * 0.06 - p.y) * Math.min(1, dt * 2); pitch = -0.1; roll = Math.sin(t * 0.9 + c.ph) * 0.15; }
        else if (mv === 'swim') { p.y = gy - S * 0.15; roll = Math.sin(t * 1.7 + c.ph) * 0.08; }
        else { p.y = gy + (moving && c.legs.length ? Math.abs(Math.sin(t * 12 + c.ph)) * S * 0.04 : 0); }
        if (mv === 'slither' && moving) c.yaw += Math.sin(t * 6 + c.ph) * dt * 2;
      }
      // 腿：对角交替摆；翅膀：飞的时候快扇，停着时收拢偶尔扇两下
      const sw = moving && mv !== 'hop' ? Math.sin(t * (8 + 4 / S * 0.05) + c.ph) * 0.6 : 0;
      c.legs.forEach((m, i) => { m.rotation.x = (i % 2 === (Math.floor(i / 2) % 2) ? sw : -sw); });
      const flap = mv === 'fly' ? Math.sin(t * 16 + c.ph) * 0.7 : Math.max(0, Math.sin(t * 0.7 + c.ph) - 0.9) * 4;
      for (const w of c.wings) w.m.rotation.z = w.side * (flap + (mv === 'fly' ? 0 : 0.6));
      g.rotation.set(pitch, c.yaw, roll, 'YXZ'); g.scale.set(1, sy, 1);
    }
  }
}
