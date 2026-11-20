// 自由画布里玩家摆的东西：植物（按种类合批成实例网格）、建筑（风车的风叶会转、钟会摆、灯塔夜里亮）、
// 海面上的小船和浮标（交给海洋做浮力）、动物（交给一份专门的动物群，放下后自己走动）。
import * as THREE from 'three';
import { instanced } from './vegetation.js';
import { kit, propOf } from './dressing.js';
import * as P from './props.js';
import { Fauna } from './fauna.js';
import { findItem } from '../catalog.js';
import { LAYER_FX } from './pipeline.js';
import { MAKES } from '../make/register.js';
import { partGeo, animatePart, HEX_UNIT } from '../make/model.js';

// 我的造物：每个造物的部件几何只生成一次，摆多少个都共用（还会被统一合批）
const MAKE_GEO = new Map();
function makeGeos(mk) { const k = mk.id + ':' + JSON.stringify(mk).length; let g = MAKE_GEO.get(k); if (!g) { g = mk.parts.map((p) => { const x = partGeo(p); if (x) x.userData.shared = true; return x; }); MAKE_GEO.set(k, g); } return g; }

/** 浮标：红白相间的小圆柱（样张同款） */
let BUOY = null;
function buoyGeo() {
  if (BUOY) return BUOY;
  const parts = [new THREE.CylinderGeometry(0.035, 0.05, 0.12, 14), new THREE.SphereGeometry(0.036, 14, 8).translate(0, 0.06, 0)].map((g) => g.toNonIndexed());
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g of parts) {
    const p = g.attributes.position; pos.set(p.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < p.count; i++) { const c = new THREE.Color(Math.floor((p.getY(i) + 0.06) * 22) % 2 ? 0xd8392b : 0xf2efe8); col.set([c.r, c.g, c.b], (o + i) * 3); }
    o += p.count;
  }
  BUOY = new THREE.BufferGeometry(); BUOY.setAttribute('position', new THREE.BufferAttribute(pos, 3)); BUOY.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); BUOY.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return BUOY;
}
const PROP = (name) => (name === 'buoy' ? { geometry: buoyGeo(), anchors: {} } : typeof P[name] === 'function' ? propOf(P[name], 0) : null);

export class ItemLayer {
  constructor(view) {
    this.view = view;
    this.group = new THREE.Group(); view.scene.add(this.group);
    this.plantGroup = null; this.items = new Map(); this.objs = new Map(); this.anim = [];
    this.fauna = null; this.pendingFloat = [];
    this.makeRoot = new THREE.Group(); view.scene.add(this.makeRoot); this.makes = [];
  }
  _fauna() {
    const v = this.view;
    if (!this.fauna) this.fauna = new Fauna({ extBatch: true, variants: 1, scene: v.scene, parent: v.faunaRoot, terrain: v.terrain, tiles: v.terrain.tiles, taken: [], trees: [], flowers: [], peaks: [], center: new THREE.Vector3(), seed: 4242, counts: { deer: 0, sheep: 0, goats: 0, rabbits: 0, butterflies: 0, dragonflies: 0, songbirds: 0, crabs: 0 }, river: (x, z) => v.terrain.riverD(x, z) });
    this.fauna.env.terrain = v.terrain; this.fauna.env.tiles = v.terrain.tiles;
    return this.fauna;
  }
  /** 整体换一套（读档、新画布） */
  set(list) {
    for (const id of [...this.items.keys()]) this.remove(id, true);
    if (this.fauna) { this.fauna.dispose(); this.fauna = null; }
    this.view.creatures?.clear(true); if (this.view.creatures) this.view.creatures.sig = '';
    for (const it of list) this.add(it, true);
    this._rebuildPlants();
  }
  /** it: { id, k, x, z, ry, s }。返回 false 表示放不下（比如羊放在了沙滩上） */
  add(it, batch = false) {
    const def = findItem(it.k); if (!def) return false;
    const v = this.view, y = v.terrain.heightAt(it.x, it.z);
    if (def.make) return this._addMake(it, def, y);
    if (def.creature) {   // AI 创造的动物
      if (!v.creatures?.spawn(def.creature, it.x, it.z)) return false;
      this.items.set(it.id, it); return true;
    }
    if (def.animal) {
      if (!this._fauna().spawn(def.animal, it.x, it.z)) return false;
      this.items.set(it.id, it); return true;
    }
    if (def.water) { if (y != null) return false; }
    else if (y == null) return false;
    this.items.set(it.id, it);
    if (def.kit) { if (!batch) this._rebuildPlants(); return true; }
    const pr = PROP(def.prop); if (!pr) return true;
    const g = new THREE.Group(), m = new THREE.Mesh(pr.geometry, v.mats.prop); m.castShadow = m.receiveShadow = true; g.add(m);
    if (pr.parts) for (const [name, part] of Object.entries(pr.parts)) {
      const geo = part.geometry.clone(), pv = part.pivot || [0, 0, 0]; geo.translate(-pv[0], -pv[1], -pv[2]);
      const pm = new THREE.Mesh(geo, v.mats.prop); pm.position.fromArray(pv); pm.castShadow = true; g.add(pm);
      this.anim.push({ id: it.id, name, m: pm });
    }
    if (def.prop === 'lighthouse') this._beam(g, pr.anchors.lamp || [0, 1.6, 0], it.id);
    g.scale.setScalar((def.s || 1) * (it.s || 1)); g.rotation.y = it.ry || 0;
    if (def.water) { g.position.set(it.x, 0, it.z); this.pendingFloat.push(g); }
    else g.position.set(it.x, y - 0.01, it.z);
    this.group.add(g); this.objs.set(it.id, g);
    if (def.fire) v.fires.set(it.id, [it.x + (pr.anchors.fire?.[0] || 0), y + (pr.anchors.fire?.[1] || 0.02), it.z + (pr.anchors.fire?.[2] || 0)]);
    return true;
  }
  /** 摆一个“我的造物”：按部件建网格（关节点为原点），会动的部件每帧按动作转动；动物 / 生物按行为在附近活动 */
  _addMake(it, def, y) {
    const mk = MAKES.get(def.make); if (!mk) return false;
    const swim = mk.behavior === 'swim' && mk.use === 'creature';
    if (swim ? y != null : y == null) return false;
    const v = this.view, mat = v.mats.clay || v.mats.prop, geos = makeGeos(mk), holder = new THREE.Group(), body = new THREE.Group(), parts = [];
    body.scale.setScalar(HEX_UNIT * (mk.size || 1) * (it.s || 1)); holder.add(body);
    mk.parts.forEach((p, i) => { if (!geos[i]) return; const o = new THREE.Group(); o.position.fromArray(p.pivot || [0, 0, 0]); const m = new THREE.Mesh(geos[i], mat); m.castShadow = !swim; m.receiveShadow = true; o.add(m); body.add(o); parts.push({ obj: o, part: p }); });
    holder.position.set(it.x, swim ? 0 : y - 0.005, it.z); holder.rotation.y = it.ry || 0;
    this.makeRoot.add(holder); this.objs.set(it.id, holder); this.items.set(it.id, it);
    const R = () => Math.random();
    this.makes.push({ id: it.id, holder, parts, mk, mobile: mk.use === 'creature' && mk.behavior !== 'still', home: [it.x, it.z], tx: it.x, tz: it.z, yaw: it.ry || 0, wait: R() * 3, ph: R() * 6, alt: 0.25 + R() * 0.3, hop: 0 });
    return true;
  }
  _makeOk(mk, x, z) { const T = this.view.terrain, land = T.heightAt(x, z) != null; if (mk.behavior === 'swim') return !land && T.landDist(x, z) < 2.5; if (mk.behavior === 'fly' || mk.behavior === 'float') return true; return land && !(T.riverD && T.riverD(x, z) < 0.12); }
  _updMakes(dt, t) {
    const T = this.view.terrain, oc = this.view.ocean;
    for (const c of this.makes) {
      const { holder: g, mk } = c, p = g.position; let moving = false;
      if (c.mobile) {
        c.wait -= dt;
        if (c.wait < 0) { for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28, r = 0.15 + Math.random() * (mk.behavior === 'fly' ? 1.2 : 0.6), x = c.home[0] + Math.cos(a) * r, z = c.home[1] + Math.sin(a) * r; if (this._makeOk(mk, x, z)) { c.tx = x; c.tz = z; break; } } c.wait = 2 + Math.random() * 5; }
        const dx = c.tx - p.x, dz = c.tz - p.z, d = Math.hypot(dx, dz), sp = (mk.behavior === 'fly' ? 0.3 : mk.behavior === 'swim' ? 0.1 : 0.06) * Math.max(0.6, mk.size || 1);
        if (d > 0.02) { moving = true; const k = Math.min(d, sp * dt) / d; p.x += dx * k; p.z += dz * k; let dy = Math.atan2(dx, dz) - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, dt * 4); g.rotation.y = c.yaw; }
      }
      const gy = T.heightAt(p.x, p.z);
      if (mk.behavior === 'swim') p.y = oc ? oc.surfaceAt(p.x, p.z).h - 0.01 : 0;
      else if (mk.behavior === 'fly') p.y += ((gy ?? 0) + c.alt + Math.sin(t * 1.3 + c.ph) * 0.05 - p.y) * Math.min(1, dt * 2);
      else if (mk.behavior === 'float') p.y = (gy ?? 0) + 0.12 + Math.sin(t * 1.1 + c.ph) * 0.03;
      else if (gy != null) p.y = gy - 0.005 + (mk.behavior === 'hop' && moving ? Math.abs(Math.sin(t * 7 + c.ph)) * 0.04 : 0);
      c.parts.forEach((x, i) => animatePart(x.obj, x.part, t + c.ph, moving || !c.mobile, i));
    }
  }
  _beam(g, lamp, id) {
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; void main(){ float a = pow(vUv.y, 2.2) * 0.22; gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * a, a); }' });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 7, 20, 1, true), mat); cone.geometry.translate(0, -3.5, 0); cone.geometry.rotateZ(-Math.PI / 2 - 0.04);
    const piv = new THREE.Group(); piv.position.fromArray(lamp); piv.add(cone); piv.visible = false; g.add(piv);
    this.anim.push({ id, name: 'beam', m: piv });
  }
  remove(id, quiet = false) {
    const it = this.items.get(id); if (!it) return null;
    this.items.delete(id);
    const def = findItem(it.k), g = this.objs.get(id);
    if (g) { g.removeFromParent(); this.objs.delete(id); this.makes = this.makes.filter((c) => c.id !== id); const m = this.view.marine; if (m) m.floaters = m.floaters.filter((f) => f.obj !== g); }
    this.anim = this.anim.filter((a) => a.id !== id);
    this.view.fires.delete(id);
    if (def?.kit && !quiet) this._rebuildPlants();
    if (def?.animal && !quiet) this._respawnAnimals();
    if (def?.creature && !quiet) this._respawnCreatures();
    return it;
  }
  _respawnCreatures() {
    const C = this.view.creatures; if (!C) return; C.clear(true); C.sig = '';
    for (const it of this.items.values()) { const d = findItem(it.k); if (d?.creature) C.spawn(d.creature, it.x, it.z); }
  }
  _respawnAnimals() {
    if (this.fauna) { this.fauna.dispose(); this.fauna = null; }
    for (const it of this.items.values()) { const d = findItem(it.k); if (d?.animal) this._fauna().spawn(d.animal, it.x, it.z); }
  }
  /** 地形变了（删了地块）：落在海里的岸上物件收起来，返回被收起的物件 */
  prune() {
    const out = [];
    for (const it of [...this.items.values()]) { const d = findItem(it.k), onLand = this.view.terrain.heightAt(it.x, it.z) != null; if (d && !d.water && !onLand) out.push(this.remove(it.id, true)); }
    if (out.length) { this._rebuildPlants(); this._respawnAnimals(); }
    // 地面高度变了：岸上的东西贴回地面
    for (const [id, g] of this.objs) { const it = this.items.get(id), d = findItem(it.k); if (d.water) continue; const y = this.view.terrain.heightAt(it.x, it.z); if (y != null) g.position.y = y - 0.01; }
    this._rebuildPlants();
    return out;
  }
  _rebuildPlants() {
    if (this.plantGroup) { this.group.remove(this.plantGroup); this.plantGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); this.plantGroup = null; }
    const by = {}, K = kit();
    for (const it of this.items.values()) {
      const d = findItem(it.k); if (!d?.kit) continue;
      const y = this.view.terrain.heightAt(it.x, it.z); if (y == null) continue;
      (by[d.kit] ||= []).push({ v: d.v, x: it.x, y: y - 0.02, z: it.z, s: (d.s || 1) * (it.s || 1), ry: it.ry || 0, tilt: d.kit === 'palm' ? 0.12 : 0.03 });
    }
    const g = new THREE.Group(), M = this.view.mats;
    for (const [k, list] of Object.entries(by)) g.add(instanced(K[k], list, k === 'rock' ? M.prop : k === 'bush' ? M.bush : M.tree));
    this.plantGroup = g; this.group.add(g);
  }
  /** 物件的占地半径（摆放时避免叠在一起） */
  hit(x, z, pad = 0) {
    for (const it of this.items.values()) { const d = findItem(it.k); const r = (d?.r ?? 0.12) * (it.s || 1); if (Math.hypot(it.x - x, it.z - z) < r + pad) return it; }
    return null;
  }
  update(dt, t) {
    const v = this.view;
    if (this.makes.length) this._updMakes(dt, t);
    if (v.marine && this.pendingFloat.length) { for (const g of this.pendingFloat) v.marine.addFloater(g, { draft: g.children[0].geometry === BUOY ? 0.03 : 0.005, stiff: g.children[0].geometry === BUOY ? 14 : 9 }); this.pendingFloat = []; }
    for (const a of this.anim) {
      if (a.name === 'sails') a.m.rotation.z = -t * 0.9;
      else if (a.name === 'bell') a.m.rotation.x = Math.sin(t * 2.4) * 0.25;
      else if (a.name === 'beam') { a.m.visible = (v.nightK ?? 0) > 0.45; a.m.rotation.y = t * 0.6; }
    }
    if (this.fauna) this.fauna.update(dt, t);
  }
}
export { LAYER_FX };
