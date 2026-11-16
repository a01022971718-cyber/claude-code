// 地块装点：按地块类型和状态（是否已收获）生成树、灌木、石头、山峰、草叶、花、麦穗、菜垄和道具。
// 全部由地块坐标决定（同一块地每次生成结果一样），不需要存档；样张和游戏共用这一份逻辑。
import * as THREE from 'three';
import { conifer, broadleaf, bush } from './vegetation.js';
import { boulder, peak } from './rocks.js';
import { rng, makeNoise } from './noise.js';
import * as P from './props.js';
import * as L from './models-land.js';

const NZ = makeNoise(9);
const INR = Math.sqrt(3) / 2;
export const tileSeed = (q, r) => ((q * 73856093) ^ (r * 19349663) ^ 0x5bd1e995) >>> 0;

/** 共享的几何“套件”：每种植物/石头的几个变体，只生成一次 */
let KIT = null;
export function kit() {
  if (KIT) return KIT;
  const stump = (() => {
    const g = new THREE.CylinderGeometry(0.03, 0.038, 0.05, 9); g.translate(0, 0.025, 0);
    const p = g.attributes.position, c = new Float32Array(p.count * 3), bark = new THREE.Color(0x5b3d29), ring = new THREE.Color(0xd9a66b);
    for (let i = 0; i < p.count; i++) { const k = p.getY(i) > 0.049 ? ring : bark; c.set([k.r, k.g, k.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
  })();
  KIT = {
    con: [1, 2, 3, 4, 5].map((s) => conifer(s * 11)),
    broad: [broadleaf(3, 'green'), broadleaf(7, 'lime'), broadleaf(9, 'green', 0.95), broadleaf(13, 'autumn', 0.8), broadleaf(17, 'blossom', 0.75)],
    bush: [bush(1, 'green'), bush(2, 'lime'), bush(3, 'green')],
    rock: [boulder(1), boulder(2, 1), boulder(3), boulder(4, 1), boulder(5), boulder(6, 1), boulder(7, 0, 0), boulder(8, 1, 0)],
    crop: [bush(21, 'lime'), bush(22, 'green'), bush(23, 'lime')],
    palm: [L.palm(1, 0.95).geometry, L.palm(2, 1.1).geometry],
    reed: [L.reeds(1).geometry, L.cattail(2).geometry],
    lily: [L.lilyPad(1, false).geometry, L.lilyPad(2, true).geometry],
    stump: [stump],
  };
  return KIT;
}

const FC = [[1.0, 0.82, 0.18], [0.98, 0.96, 0.9], [0.98, 0.5, 0.68], [0.62, 0.48, 0.9], [1.0, 0.58, 0.2]].map((c) => c.map((v) => Math.pow(v, 2.2)));

// 道具模型生成很慢（茅屋、营火各约 60ms），每种只生成几个变体，缓存起来共用
const PROPS = new Map();
export function propOf(fn, sd) { let m = PROPS.get(fn); if (!m) PROPS.set(fn, m = new Map()); let r = m.get(sd); if (!r) { r = fn(sd * 97 + 11); m.set(sd, r); } return r; }

/** 生成一块地的装点。opts: { grass: 草的密度系数, flowers: 花的密度系数, props: 是否放道具, clear: [[x,z,r]] 额外要空出来的圆 } */
export function dressTile(T, t, opts = {}) {
  const R = rng(tileSeed(t.q, t.r)), dens = opts.grass ?? 1, fdens = opts.flowers ?? dens, tf = opts.trees ?? 1;
  const out = { inst: {}, blades: { grass: [], flower: [], wheat: [] }, meshes: [], obstacles: [], perches: [], flowers: [], fire: null };
  const push = (k, it) => { (out.inst[k] ||= []).push(it); };
  const H = (x, z) => T.heightIn(t, x, z);
  const taken = (opts.clear || []).slice();
  const free = (x, z, d) => taken.every(([a, b, r]) => (a - x) ** 2 + (b - z) ** 2 > (r + d) ** 2);
  const riverD = (x, z) => { let d = T.riverD ? T.riverD(x, z) : T.river ? T.river(x, z)[0] : 9; for (const pd of (T.pondsAt ? T.pondsAt(x, z) : T.ponds)) d = Math.min(d, Math.hypot(x - pd.x, z - pd.z) - pd.r * 0.75 + 0.2); return d; };
  const inHex = (pad = 0.12) => { for (let k = 0; k < 40; k++) { const x = (R() * 2 - 1) * (INR - pad), z = (R() * 2 - 1) * (1 - pad); if (Math.abs(z) <= (1 - pad) - Math.abs(x) / Math.sqrt(3) && Math.abs(x) <= INR - pad) return [t.x + x, t.z + z]; } return [t.x, t.z]; };
  const plant = (k, v, it, d) => { if (!free(it.x, it.z, d)) return false; taken.push([it.x, it.z, d]); out.obstacles.push([it.x, it.z, d]); push(k + ':' + v, it); return true; };
  const ty = t.t, harvested = !!t.harvested;
  if (t.center) taken.push([t.x, t.z, 0.55]);

  if (ty === 'forest') {
    const keep = harvested ? 0.3 : 1;
    for (let i = 0; i < 46; i++) {
      const [x, z] = inHex(0.05), s = 0.85 + R() * 0.55, v = Math.floor(R() * 5), cut = R() > keep;
      if (tf < 1 && ((i * 0.618) % 1) > tf) continue;   // 植被密度低时少种几棵（按序号挑，不打乱其余随机数）
      if (cut) { if (free(x, z, 0.05)) { taken.push([x, z, 0.05]); push('stump:0', { x, y: H(x, z) - 0.01, z, s: 1 + R() * 0.4, ry: R() * 6.28 }); } continue; }
      if (plant('con', v, { x, y: H(x, z) - 0.02, z, s, ry: R() * 6.28, tilt: 0.04, tint: [0.9 + R() * 0.2, 0.92 + R() * 0.16, 0.9 + R() * 0.2] }, 0.13 * s)) out.perches.push({ x, y: H(x, z), z, h: s });
    }
    for (let i = 0; i < 3; i++) { const [x, z] = inHex(0.1), s = 0.9 + R() * 0.3; if (plant('broad', R() < 0.5 ? 1 : 0, { x, y: H(x, z) - 0.02, z, s, ry: R() * 6.28 }, 0.2)) out.perches.push({ x, y: H(x, z), z, h: 0.85 * s }); }
    for (let i = 0; i < 6; i++) { const [x, z] = inHex(0.03); plant('bush', Math.floor(R() * 3), { x, y: H(x, z), z, s: 0.9 + R() * 0.6, ry: R() * 6.28 }, 0.08); }
  }
  if (ty === 'mountain') {
    const pick = R(), big = pick < 0.34 ? [2.5, 0.95] : pick < 0.67 ? [2.1, 0.88] : [1.5, 0.72];
    out.meshes.push({ geo: peak(tileSeed(t.q, t.r) % 997, big[1], big[0]), mat: 'peak', pos: [t.x + (R() - 0.5) * 0.2, t.base - 0.03, t.z + (R() - 0.5) * 0.2], ry: R() * 6.28, peak: true });
    for (let k = 0; k < 2; k++) { const a = R() * 6.28, d = 0.45 + R() * 0.15; out.meshes.push({ geo: peak((tileSeed(t.q, t.r) + k * 131) % 997, 0.32 + R() * 0.12, 0.55 + R() * 0.5), mat: 'peak', pos: [t.x + Math.cos(a) * d, t.base - 0.02, t.z + Math.sin(a) * d], ry: R() * 6.28, peak: true }); }
    taken.push([t.x, t.z, 0.6]);
    for (let i = 0; i < 9; i++) { const [x, z] = inHex(0.06), s = 0.7 + R() * 0.4; if (tf < 1 && ((i * 0.618) % 1) > tf) continue; if (plant('con', Math.floor(R() * 5), { x, y: H(x, z) - 0.02, z, s, ry: R() * 6.28, tilt: 0.05 }, 0.11)) out.perches.push({ x, y: H(x, z), z, h: s }); }
    for (let i = 0; i < 5; i++) { const [x, z] = inHex(0.08); plant('rock', Math.floor(R() * 4), { x, y: H(x, z) - 0.02, z, s: 0.05 + R() * 0.08, ry: R() * 6.28 }, 0.08); }
  }
  if (ty === 'quarry') {
    for (let i = 0; i < 14; i++) { const [x, z] = inHex(0.1), s = 0.1 + R() * 0.22; plant('rock', Math.floor(R() * 4), { x, y: H(x, z) - 0.03, z, s, ry: R() * 6.28 }, s * 0.9); }
    for (let i = 0; i < 20; i++) { const [x, z] = inHex(0.05); plant('rock', 4 + Math.floor(R() * 2), { x, y: H(x, z) - 0.01, z, s: 0.025 + R() * 0.035, ry: R() * 6.28 }, 0.03); }
    for (let i = 0; i < 3; i++) { const [x, z] = inHex(0.1); plant('bush', Math.floor(R() * 3), { x, y: H(x, z), z, s: 0.8 + R() * 0.5, ry: R() * 6.28 }, 0.08); }
  }
  if (ty === 'camp' && opts.props !== false) {
    const hutX = t.x - 0.24, hutZ = t.z - 0.27, fx = t.x + 0.12, fz = t.z + 0.1;
    taken.push([hutX, hutZ, 0.36], [fx, fz, 0.3]); out.obstacles.push([hutX, hutZ, 0.34], [fx, fz, 0.18]);
    const prop = (fn, x, z, ry, s = 1) => { if (typeof fn !== 'function') return null; const sd = Math.floor(R() * 1000) % 3, r = propOf(fn, sd); out.meshes.push({ geo: r.geometry, mat: 'prop', pos: [x, H(x, z) - 0.01, z], ry, s, anchors: r.anchors, shared: true }); return out.meshes[out.meshes.length - 1]; };
    prop(P.strawHut, hutX, hutZ, 0.5, 1.05);
    const f = prop(P.campfire, fx, fz, 0, 1);
    if (f) { const a = f.anchors?.fire || [0, 0.02, 0]; out.fire = [fx + a[0], f.pos[1] + a[1], fz + a[2]]; }
    prop(P.logSeat, t.x + 0.42, t.z + 0.05, 1.2); prop(P.logSeat, t.x + 0.1, t.z + 0.42, 0.1); prop(P.logSeat, t.x - 0.18, t.z + 0.22, 2.2);
    prop(P.woodPile, t.x - 0.55, t.z + 0.1, 0.4);
  }
  // 水系：池塘的睡莲和一圈芦苇香蒲；溪流两岸的芦苇和卵石
  if (ty === 'pond' || ty === 'stream') {
    const pd = (T.pondsAt ? T.pondsAt(t.x, t.z) : []).find((p) => Math.hypot(p.x - t.x, p.z - t.z) < 0.5);
    if (pd) {
      out.pond = pd;
      if (!pd.spring) {
        const pads = [];
        for (let k = 0; k < 40 && pads.length < 12; k++) { const a = R() * 6.28, r = Math.sqrt(R()) * pd.r * 0.8, x = pd.x + Math.cos(a) * r, z = pd.z + Math.sin(a) * r; if (pads.every((q) => Math.hypot(q.x - x, q.z - z) > 0.07)) pads.push({ x, z }); }
        out.lilyPads = pads.map((p) => ({ x: p.x, y: t.base - 0.05 + 0.002, z: p.z }));
        for (const p of out.lilyPads) push('lily:' + (R() < 0.3 ? 1 : 0), { x: p.x, y: p.y, z: p.z, ry: R() * 6.28, s: 1.2 + R() * 0.6 });
      }
      for (let k = 0; k < (pd.spring ? 10 : 24); k++) { const a = R() * 6.28, r = pd.r * (0.95 + R() * 0.3), x = pd.x + Math.cos(a) * r, z = pd.z + Math.sin(a) * r; push('reed:' + (R() < 0.6 ? 0 : 1), { x, y: H(x, z) - 0.01, z, ry: R() * 6.28, s: 1.1 + R() * 0.5 }); }
      taken.push([pd.x, pd.z, pd.r * 1.2]);
    }
    for (const pl of (T.lines && T.lines.get(t.q + ',' + t.r)) || []) {
      for (let i = 1; i < pl.length - 1; i++) {
        const [ax, az] = pl[i - 1], [bx, bz] = pl[i + 1], dx = bx - ax, dz = bz - az, L2 = Math.hypot(dx, dz) || 1;
        for (const side of [-1, 1]) {
          if (R() < 0.45) { const o = 0.17 + R() * 0.06, x = pl[i][0] - dz / L2 * o * side, z = pl[i][1] + dx / L2 * o * side; push('reed:0', { x, y: H(x, z) - 0.01, z, ry: R() * 6.28, s: 0.9 + R() * 0.4 }); }
          if (R() < 0.3) { const o = 0.15 + R() * 0.05, x = pl[i][0] - dz / L2 * o * side, z = pl[i][1] + dx / L2 * o * side; push('rock:' + Math.floor(R() * 4), { x, y: H(x, z) - 0.02, z, s: 0.03 + R() * 0.035, ry: R() * 6.28 }); }
        }
      }
    }
  }
  if (['meadow', 'flowers', 'camp', 'islet', 'pond', 'stream'].includes(ty)) {
    const nTree = ty === 'meadow' || ty === 'stream' ? (R() < 0.6 ? 1 : 0) + (R() < 0.3 ? 1 : 0) : ty === 'camp' ? 2 : 0;
    for (let i = 0; i < nTree; i++) { const [x, z] = inHex(0.15); if (riverD(x, z) < 0.35) continue; const s = 0.8 + R() * 0.35; if (plant('broad', Math.floor(R() * 5), { x, y: H(x, z) - 0.02, z, s, ry: R() * 6.28 }, 0.24)) out.perches.push({ x, y: H(x, z), z, h: 0.85 * s }); }
    for (let i = 0; i < (ty === 'islet' ? 4 : 3); i++) { const [x, z] = inHex(0.05); if (riverD(x, z) < 0.25) continue; plant('bush', Math.floor(R() * 3), { x, y: H(x, z), z, s: 0.7 + R() * 0.6, ry: R() * 6.28 }, 0.07); }
    for (let i = 0; i < 2; i++) { const [x, z] = inHex(0.08); if (riverD(x, z) < 0.25) continue; plant('rock', Math.floor(R() * 4), { x, y: H(x, z) - 0.02, z, s: 0.04 + R() * 0.05, ry: R() * 6.28 }, 0.06); }
  }
  if (ty === 'beach') {
    const n = t.game === 'harbor' ? 2 : 4;
    for (let i = 0; i < n; i++) { const [x, z] = inHex(0.2); plant('palm', i % 2, { x, y: H(x, z) - 0.01, z, ry: R() * 6.28, s: 0.85 + R() * 0.3, tilt: 0.12 }, 0.22); }
    for (let i = 0; i < 2; i++) { const [x, z] = inHex(0.15); plant('rock', Math.floor(R() * 4), { x, y: H(x, z) - 0.02, z, s: 0.04 + R() * 0.04, ry: R() * 6.28 }, 0.06); }
  }
  if (ty === 'field') {
    // 菜地：一垄垄的土埂 + 小菜苗（收获后只剩小苗）
    const parts = [], soilA = new THREE.Color(0x8d5530), soilB = new THREE.Color(0xb7743f), dir = Math.PI / 6 + Math.floor(R() * 3) * Math.PI / 3;
    for (let k = -5; k <= 5; k++) {
      const off = k * 0.13, Lr = 2 * Math.sqrt(Math.max(0, (INR - 0.13) ** 2 - off * off)) * 1.05;
      if (Lr < 0.3) continue;
      const g = new THREE.CapsuleGeometry(0.035, Lr, 4, 8); g.rotateZ(Math.PI / 2); g.scale(1, 0.55, 1);
      g.rotateY(dir); g.translate(t.x - Math.sin(dir) * off, t.base - 0.004, t.z - Math.cos(dir) * off);
      const p = g.attributes.position, c = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const cc = soilA.clone().lerp(soilB, THREE.MathUtils.clamp((p.getY(i) - t.base) * 25 + 0.5, 0, 1)).multiplyScalar(0.9 + NZ.n2(p.getX(i) * 30, p.getZ(i) * 30) * 0.1); c.set([cc.r, cc.g, cc.b], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g);
      for (let s = -Lr / 2 + 0.06; s < Lr / 2 - 0.04; s += 0.09) push('crop:' + Math.floor(R() * 3), { x: t.x + Math.cos(dir) * s - Math.sin(dir) * off, y: t.base + 0.008, z: t.z - Math.sin(dir) * s - Math.cos(dir) * off, s: harvested ? 0.1 + R() * 0.05 : 0.28 + R() * 0.12, ry: R() * 6.28, sy: 0.7 });
    }
    out.meshes.push({ geo: mergeSimple(parts), mat: 'soil', pos: [0, 0, 0], ry: 0, merged: true });
    taken.push([t.x, t.z, 0.8]);
  }
  // ---- 草叶、花、麦穗 ----
  const grassy = ({ meadow: 4200, flowers: 3800, camp: 3000, islet: 2200, forest: 900, quarry: 1500, mountain: 1400, pond: 3600, stream: 3800, beach: 260 }[ty] || 0) * dens;
  for (let i = 0; i < grassy; i++) {
    const [x, z] = inHex(0.0);
    if (riverD(x, z) < 0.2) continue;
    if (ty === 'camp' && Math.hypot(x - t.x - 0.05, z - t.z + 0.05) < 0.42) continue;
    if (ty === 'mountain' && Math.hypot(x - t.x, z - t.z) < 0.5) continue;
    if (ty === 'beach' && Math.hypot(x - t.x, z - t.z) < 0.55) continue;
    if (t.center && Math.hypot(x - t.x, z - t.z) < 0.35) continue;
    const h = H(x, z), c = T._topColor(t, x, z, h), v = 0.88 + R() * 0.3;
    out.blades.grass.push({ x, y: h - 0.004, z, h: (0.035 + R() * 0.045) * (ty === 'forest' ? 0.8 : 1), w: 0.008 + R() * 0.006, lean: R() * 0.3, rot: R() * 6.28, tint: [c.r * v * 1.12, c.g * v * 1.08, c.b * v * 0.95], tint2: [c.r * 0.55, c.g * 0.6, c.b * 0.5] });
  }
  const nFlower = ({ flowers: 3200, meadow: 380, camp: 160, islet: 260, pond: 220, stream: 300 }[ty] || 0) * fdens;
  for (let i = 0; i < nFlower; i++) {
    const [x, z] = inHex(0.03);
    if (riverD(x, z) < 0.22) continue;
    const patch = NZ.fbm2(x * 1.6, z * 1.6, 3), kind = Math.floor((NZ.n2(x * 0.9 + 30, z * 0.9) * 0.5 + 0.5) * 5) % 5;
    if (ty === 'flowers' ? patch < -0.15 : patch < 0.25) continue;
    const h = H(x, z), s = 0.022 + R() * 0.02;
    out.blades.flower.push({ x, y: h - 0.003, z, h: s * 2.2, w: s * 0.45, lean: R() * 0.15, rot: R() * 6.28, tint: FC[kind], tint2: [0.08, 0.2, 0.05] });
    if (i % 7 === 0) out.flowers.push({ x, y: h + s * 2.2, z });
  }
  if (ty === 'wheat') {
    const n = (harvested ? 3000 : 8000) * dens;
    for (let i = 0; i < n; i++) {
      const [x, z] = inHex(0.1), h = H(x, z), g = 0.85 + R() * 0.25;
      if (harvested) out.blades.wheat.push({ x, y: h - 0.005, z, h: 0.03 + R() * 0.02, w: 0.1, lean: 0.05, rot: R() * 6.28, tint: [0.85 * g, 0.66 * g, 0.32 * g], tint2: [0.62 * g, 0.5 * g, 0.24 * g] });
      else out.blades.wheat.push({ x, y: h - 0.005, z, h: 0.17 + R() * 0.07, w: 0.11, lean: 0.1 + R() * 0.25, rot: R() * 6.28, tint: [0.98 * g, 0.62 * g, 0.16 * g], tint2: [0.7 * g, 0.52 * g, 0.16 * g] });
    }
    taken.push([t.x, t.z, 0.8]);
  }
  return out;
}

export function mergeSimple(list) {
  let n = 0; for (const g of list) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0, c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += c; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.computeBoundingSphere();
  return out;
}
