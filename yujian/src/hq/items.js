// 自由画布里玩家摆的东西：植物（按种类合批成实例网格）、建筑（风车的风叶会转、钟会摆、灯塔夜里亮）、
// 海面上的小船和浮标（交给海洋做浮力）、动物（交给一份专门的动物群，放下后自己走动）。
import * as THREE from 'three';
import { instanced } from './vegetation.js';
import { kit, propOf } from './dressing.js';
import * as P from './props.js';
import { Fauna } from './fauna.js';
import { findItem } from '../catalog.js';
import { LAYER_FX } from './pipeline.js';

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
  }
  _fauna() {
    const v = this.view;
    if (!this.fauna) this.fauna = new Fauna({ scene: v.scene, parent: v.faunaRoot, terrain: v.terrain, tiles: v.terrain.tiles, taken: [], trees: [], flowers: [], peaks: [], center: new THREE.Vector3(), seed: 4242, counts: { deer: 0, sheep: 0, goats: 0, rabbits: 0, butterflies: 0, dragonflies: 0, songbirds: 0, crabs: 0 }, river: (x, z) => v.terrain.riverD(x, z) });
    this.fauna.env.terrain = v.terrain; this.fauna.env.tiles = v.terrain.tiles;
    return this.fauna;
  }
  /** 整体换一套（读档、新画布） */
  set(list) {
    for (const id of [...this.items.keys()]) this.remove(id, true);
    if (this.fauna) { this.fauna.dispose(); this.fauna = null; }
    for (const it of list) this.add(it, true);
    this._rebuildPlants();
  }
  /** it: { id, k, x, z, ry, s }。返回 false 表示放不下（比如羊放在了沙滩上） */
  add(it, batch = false) {
    const def = findItem(it.k); if (!def) return false;
    const v = this.view, y = v.terrain.heightAt(it.x, it.z);
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
    if (g) { this.group.remove(g); this.objs.delete(id); const m = this.view.marine; if (m) m.floaters = m.floaters.filter((f) => f.obj !== g); }
    this.anim = this.anim.filter((a) => a.id !== id);
    this.view.fires.delete(id);
    if (def?.kit && !quiet) this._rebuildPlants();
    if (def?.animal && !quiet) this._respawnAnimals();
    return it;
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
