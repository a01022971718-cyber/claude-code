// 微距层（原型，?style=blocky 时启用）：镜头拉近（距离 < 4.5）时，在焦点周围铺一层细长的草叶、草尖上的露珠和几朵雏菊，
// 让特写有“蹲在草地里看”的质感，而不是一片宽扁的卡通草。只在镜头附近生成，焦点走开半个单位才重铺。
import * as THREE from 'three';
import { bladeField } from './vegetation.js';
import { TYPES } from './terrain.js';
import { rng } from './noise.js';

const GRASSY = new Set(['meadow', 'flowers', 'camp', 'pond', 'stream', 'islet', 'forest', 'mountain']);
const R0 = 1.9;   // 铺多大一圈（单位）

function daisyGeometry() {
  const parts = [], add = (g, c) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c); for (let i = 0; i < n; i++) a.set([cc.r, cc.g, cc.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); };
  const stem = new THREE.CylinderGeometry(0.0012, 0.0016, 0.1, 5); stem.translate(0, 0.05, 0); add(stem, 0x4f8a34);
  const center = new THREE.SphereGeometry(0.0055, 10, 6); center.scale(1, 0.55, 1); center.translate(0, 0.101, 0); add(center, 0xf2b81e);
  for (let i = 0; i < 14; i++) {
    const p = new THREE.PlaneGeometry(0.0034, 0.013); p.rotateX(-Math.PI / 2 + 0.18); p.translate(0, 0.1, 0.0105); p.rotateY(i / 14 * Math.PI * 2);
    add(p, i % 3 ? 0xfbfaf4 : 0xf2efe6);
  }
  const g = new THREE.BufferGeometry(); const n = parts.reduce((s, x) => s + x.attributes.position.count, 0), P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0; for (const x of parts) { x.computeVertexNormals(); P.set(x.attributes.position.array, o * 3); N.set(x.attributes.normal.array, o * 3); C.set(x.attributes.color.array, o * 3); o += x.attributes.position.count; }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return g;
}

export class MacroLayer {
  constructor(view) {
    this.view = view; this.group = new THREE.Group(); this.group.visible = false; view.scene.add(this.group);
    this.at = null; this.grass = null;
    this.dewMat = new THREE.MeshStandardMaterial({ color: 0xdfeee8, roughness: 0.03, metalness: 0, envMapIntensity: 3, transparent: true, opacity: 0.35 });   // 露珠：几乎透明，只留高光
    this.dew = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), this.dewMat, 900); this.dew.count = 0; this.dew.frustumCulled = false; this.group.add(this.dew);
    this.daisy = new THREE.InstancedMesh(daisyGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide }), 90); this.daisy.count = 0; this.daisy.frustumCulled = false; this.daisy.castShadow = false; this.group.add(this.daisy);
  }
  update(focus, dist) {
    const on = dist < 4.5; this.group.visible = on;
    if (!on) return;
    if (this.at && Math.hypot(focus.x - this.at.x, focus.z - this.at.z) < 0.5 && this.ver === this.view.landChanged) return;
    this.at = focus.clone(); this.ver = this.view.landChanged; this._build(focus.x, focus.z);
  }
  _build(cx, cz) {
    const T = this.view.terrain, R = rng(((Math.round(cx * 2) * 73856093) ^ (Math.round(cz * 2) * 19349663)) >>> 0), list = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let nd = 0, nf = 0;
    for (let i = 0; i < 11000; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * R0, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, t = T.tileAt(x, z);
      if (!t || !(GRASSY.has(t.t) || (TYPES[t.t]?.custom?.grass ?? 0) > 0.3)) continue;
      if (T.riverD && T.riverD(x, z) < 0.2) continue;
      if (T.paths?.length && T.pathD(x, z) < 0.06) continue;
      if (T.typeShare && T.typeShare(t, x, z, 'beach') > 0.4) continue;
      const pd = T.pondsAt ? T.pondsAt(x, z) : []; if (pd.some((o) => Math.hypot(x - o.x, z - o.z) < o.r * 1.05)) continue;
      const h = T.heightIn(t, x, z), c = T._topColor(t, x, z, h), v = 0.95 + R() * 0.3, tall = 0.05 + R() * R() * 0.08;
      list.push({ x, y: h - 0.004, z, h: tall * (t.t === 'forest' ? 0.8 : 1), w: 0.004 + R() * 0.004, lean: R() * 0.45, rot: R() * 6.28, tint: [c.r * v * 1.18, c.g * v * 1.12, c.b * v * 0.9], tint2: [c.r * 0.5, c.g * 0.58, c.b * 0.45] });
      // 露珠：挂在一部分草叶的中上部
      if (R() < 0.09 && nd < this.dew.instanceMatrix.count) { const f = 0.45 + R() * 0.45, rr = 0.0010 + R() * 0.0011; this.dew.setMatrixAt(nd++, m4.compose(p.set(x + Math.cos(a) * 0.002, h + tall * f, z), q.identity(), s.set(rr, rr * 1.12, rr))); }
      // 雏菊：零星几朵，比草高一点
      if (R() < 0.006 && nf < 90) { const k = 0.8 + R() * 0.5; this.daisy.setMatrixAt(nf++, m4.compose(p.set(x, h - 0.003, z), q.setFromAxisAngle(s.set(R() - 0.5, 0, R() - 0.5).normalize(), R() * 0.2), s.set(k, k * (0.9 + R() * 0.3), k))); }
    }
    if (this.grass) { this.group.remove(this.grass); this.grass.geometry.dispose(); }
    this.grass = bladeField('grass', list); this.grass.name = 'macro-grass'; this.group.add(this.grass);
    this.dew.count = nd; this.dew.instanceMatrix.needsUpdate = true;
    this.daisy.count = nf; this.daisy.instanceMatrix.needsUpdate = true;
  }
}
