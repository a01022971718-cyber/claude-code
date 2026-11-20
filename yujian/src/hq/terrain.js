// 高画质地形：每块地的顶面（细分网格 + 起伏 + 接缝凹槽）、地块之间的台阶、整座岛连续的海岸岩壁、海底。
import * as THREE from 'three';
import { toWorld, fromWorld, key, DIRS, CORNERS } from '../hex.js';
import { makeNoise } from './noise.js';
import { LandField } from './landfield.js';

const NZ = makeNoise(20261115);
const SUB_HI = 18;                      // 每个三角扇区的细分数（近处）；远处用 SUB_LO（1/9 的三角形，顶点是近处版本的子集，接缝对得上）
export const SUB_LO = 6;
const INR = Math.sqrt(3) / 2;           // 六边形内切圆半径
export const SEA_FLOOR = -2.4;

// 地块类型 → 顶面高度、颜色（sRGB）、表面属性 [草, 岩, 土]
export const TYPES = {
  meadow: { h: 0.450, c: [0x8cc043, 0x6ea33a, 0xb9cf58], surf: [1, 0, 0] },
  flowers: { h: 0.455, c: [0x93c447, 0x76aa3c, 0xc4d460], surf: [1, 0, 0] },
  forest: { h: 0.465, c: [0x4f7f31, 0x3d6a2a, 0x6f8a3a], surf: [1, 0, 0.25] },
  camp: { h: 0.450, c: [0x8dbd47, 0x739f3c, 0xb3c95a], surf: [1, 0, 0] },
  field: { h: 0.425, c: [0xc4824a, 0xa86a3c, 0xd69a5a], surf: [0, 0, 1] },
  wheat: { h: 0.430, c: [0xb38b4c, 0x9a7440, 0xc9a35c], surf: [0.2, 0, 1] },
  quarry: { h: 0.470, c: [0x8f9c58, 0x7a8650, 0xa09468], surf: [0.7, 0.3, 0.3] },
  mountain: { h: 0.485, c: [0x7fa843, 0x6a9539, 0x9cb653], surf: [1, 0.15, 0] },
  beach: { h: 0.34, c: [0xe8d6a6, 0xd9c08c, 0xf2e6c4], surf: [0, 0, 0.12] },
  pond: { h: 0.45, c: [0x84b046, 0x678f3a, 0xa3bd5c], surf: [1, 0, 0] },
  stream: { h: 0.452, c: [0x88b845, 0x6c9c3a, 0xaec65a], surf: [1, 0, 0] },
  islet: { h: 0.415, c: [0x9cb85a, 0x84a24c, 0xbac469], surf: [1, 0.1, 0] },
};
const col = (hex) => new THREE.Color(hex); // three 默认开启色彩管理，得到的是线性值
const LC = new Map();   // 地块配色的线性值（只换算一次）
const lcol = (ty) => { let L = LC.get(ty); if (!L) LC.set(ty, L = ty.c.map(col)); return L; };
const GRASSY = new Set(['meadow', 'flowers', 'camp', 'islet', 'pond', 'stream']);
/** 各类地表的细节起伏（世界坐标的噪声，同一点不管哪块地来算都一样） */
function detail(ty, x, z) {
  if (GRASSY.has(ty)) return NZ.fbm2(x * 1.3, z * 1.3, 3) * 0.014 + NZ.n2(x * 5, z * 5) * 0.003;
  const cu = TYPES[ty]?.custom; if (cu) return NZ.fbm2(x * 1.6, z * 1.6, 3) * (0.008 + Math.min(1, +cu.roughness || 0) * 0.02) + NZ.n2(x * 5, z * 5) * 0.003;   // AI 新造的生态：起伏程度按配方
  if (ty === 'forest') return NZ.fbm2(x * 1.7, z * 1.7, 3) * 0.018 + NZ.n2(x * 7, z * 7) * 0.004;
  if (ty === 'quarry') return NZ.fbm2(x * 2.2, z * 2.2, 3) * 0.022;
  if (ty === 'mountain') return NZ.fbm2(x * 1.4, z * 1.4, 3) * 0.02;
  return NZ.n2(x * 3, z * 3) * 0.004;
}
let VER = 0;
const WATER = new Set(['stream', 'pond']);

/** 以 polyline（XZ 点数组）表示的河道：返回点到河道的距离和沿河的进度 */
export function riverField(points) {
  return (x, z) => {
    let best = 1e9, along = 0, acc = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L))), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; along = acc + t * L; }
      acc += L;
    }
    return [best, along];
  };
}

export class Terrain {
  /** tiles: [{q,r,t}]；opts.river: [[x,z],...] 河道折线；opts.riverWidth */
  constructor(tiles, opts = {}) {
    this.tiles = tiles;
    this.map = new Map(tiles.map((t) => [key(t.q, t.r), t]));
    this.riverPts = opts.river || null;
    this.riverW = opts.riverWidth || 0.17;
    this.ponds = opts.ponds || [];
    this.river = this.riverPts ? riverField(this.riverPts) : null;
    // 游戏里的水系：溪流地块的河道折线、池塘（按地块键索引，查询只看附近几块地，地图再大也一样快）
    this.lines = new Map();      // 地块键 → [[ [x,z], ... ], ...] 河道中心线（上游 → 下游）
    this.pondMap = new Map();    // 地块键 → { x, z, r, depth }
    this.lineNear = new Set();   // 有河道的地块和它们的邻居
    this.paths = [];             // 营地通往田地、林边、海边、水边的小路（折线）
    this.pathNear = new Map();   // 地块键 → 经过它附近的小路
    this.field = new LandField();
    this._ver = ++VER;           // 地块增删的版本号：每块地的邻居列表按它缓存
    for (const t of tiles) this._init(t);
  }
  _init(t) {
    const [x, z] = toWorld(t.q, t.r);
    t.x = x; t.z = z;
    t.base = this.baseOf(t);
    this.field.add(x, z);
  }
  /** 地块的基准高度（按类型 + 一点按位置固定的起伏） */
  baseOf(t) { return (TYPES[t.t] || TYPES.meadow).h + (NZ.n2(t.q * 3.1, t.r * 2.7)) * 0.012; }
  /** 新增一块地（游戏里放地块时调用），返回受影响的地块键（自己 + 邻居） */
  addTile(t) {
    this.tiles.push(t); this.map.set(key(t.q, t.r), t); this._init(t); this._cd?.clear(); this._ver = ++VER;
    const out = new Set([key(t.q, t.r), ...DIRS.map((d) => key(t.q + d[0], t.r + d[1]))]);
    // 水系：新地块本身是溪流/池塘，或者挨着溪流（海岸变了，出水口可能要换），就重算它所在的水网
    const seeds = [t, ...DIRS.map((d) => this.map.get(key(t.q + d[0], t.r + d[1])))].filter((x) => x && WATER.has(x.t));
    const seen = new Set();
    for (const s0 of seeds) { if (seen.has(key(s0.q, s0.r))) continue; for (const kk of this._waterNet(s0)) { seen.add(kk); out.add(kk); } }
    for (const kk of this._pathNet()) out.add(kk);
    return [...out];
  }
  /** 小路：每个营地连到两圈以内的田地、麦田、林子、沙滩、溪流和池塘，像人常走踩出来的。返回走向变了的地块 */
  _pathNet() {
    const before = new Set(this.pathNear.keys());
    this.paths = []; this.pathNear.clear();
    const goals = { field: 1, wheat: 1, forest: 1, beach: 1, stream: 1, pond: 1, camp: 1 };
    for (const c of this.tiles) {
      if (c.t !== 'camp') continue;
      for (const g of this.tiles) {
        if (g === c || !goals[g.t]) continue;
        const dq = g.q - c.q, dr = g.r - c.r, hd = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
        if (hd > 2 || (g.t === 'camp' && hd > 3)) continue;
        // 从营地中心偏一点出发，走到目标地块靠近营地的一侧；中间按噪声弯一弯
        const ax = c.x + (g.x - c.x) * 0.18, az = c.z + (g.z - c.z) * 0.18, bx = g.x - (g.x - c.x) * 0.25, bz = g.z - (g.z - c.z) * 0.25;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, L = Math.hypot(bx - ax, bz - az) || 1, off = NZ.n2(mx * 2.1, mz * 2.1) * 0.35;
        const cx = mx - (bz - az) / L * off, cz = mz + (bx - ax) / L * off, pts = [];
        let ok = true;
        for (let i = 0; i <= 12; i++) { const u = i / 12, x = (1 - u) ** 2 * ax + 2 * (1 - u) * u * cx + u * u * bx, z = (1 - u) ** 2 * az + 2 * (1 - u) * u * cz + u * u * bz; if (!this.tileAt(x, z)) { ok = false; break; } pts.push([x, z]); }
        if (!ok) continue;
        const pi = this.paths.length; this.paths.push({ pts, from: c, to: g });
        for (const [x, z] of pts) { const [q, r] = fromWorld(x, z); for (const kk of [key(q, r), ...DIRS.map((d) => key(q + d[0], r + d[1]))]) { let L2 = this.pathNear.get(kk); if (!L2) this.pathNear.set(kk, L2 = new Set()); L2.add(pi); } }
      }
    }
    const changed = new Set([...before, ...this.pathNear.keys()]);
    return [...changed];
  }
  /** 点到最近小路的距离 */
  pathD(x, z) {
    if (!this.paths.length) return 9;
    const [q, r] = fromWorld(x, z), S = this.pathNear.get(key(q, r)); if (!S) return 9;
    let best = 9;
    for (const pi of S) { const pl = this.paths[pi].pts; for (let i = 0; i < pl.length - 1; i++) { const [ax, az] = pl[i], [bx, bz] = pl[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * u, z - az - dz * u); if (d < best) best = d; } }
    return best;
  }
  /** 重算 t 所在的连通水网（溪流 + 池塘）：流向、河道折线、出海口瀑布、源头泉眼。返回受影响的地块键（水网里的地块和它们的邻居） */
  _waterNet(t0) {
    const comp = [], idx = new Map(), queue = [t0];
    idx.set(key(t0.q, t0.r), t0);
    while (queue.length) { const t = queue.shift(); comp.push(t); for (const d of DIRS) { const kk = key(t.q + d[0], t.r + d[1]), n = this.map.get(kk); if (n && WATER.has(n.t) && !idx.has(kk)) { idx.set(kk, n); queue.push(n); } } }
    const coastEdges = (t) => DIRS.map((d, k) => (this.map.has(key(t.q + d[0], t.r + d[1])) ? -1 : k)).filter((k) => k >= 0);
    // 离出海口的距离：所有挨海的溪流地块都是出海口；没有就流进池塘；都没有就从第一块地的泉眼开始
    let src = comp.filter((t) => t.t === 'stream' && coastEdges(t).length);
    if (!src.length) src = comp.filter((t) => t.t === 'pond');
    if (!src.length) src = [comp[0]];
    const dist = new Map(src.map((t) => [key(t.q, t.r), 0])), q2 = [...src];
    while (q2.length) { const t = q2.shift(), d0 = dist.get(key(t.q, t.r)); for (const d of DIRS) { const kk = key(t.q + d[0], t.r + d[1]); if (idx.has(kk) && !dist.has(kk)) { dist.set(kk, d0 + 1); q2.push(idx.get(kk)); } } }
    const touched = new Set();
    for (const t of comp) {
      const k = key(t.q, t.r), dt = dist.get(k) ?? 0, lines = [];
      this.lines.delete(k); this.pondMap.delete(k); t.fall = null;
      const mid = (e) => [t.x + Math.cos(Math.PI / 3 * e) * INR, t.z + Math.sin(Math.PI / 3 * e) * INR];
      const curve = (a, b, salt) => {
        // 两点之间带一点弯的河道（二次贝塞尔，控制点按位置固定偏移）
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
        const off = NZ.n2(mx * 3.7 + salt, mz * 3.7 - salt) * 0.16, cx = mx - dz / L * off, cz = mz + dx / L * off, pts = [];
        for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * cx + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * cz + u * u * b[1]]); }
        return pts;
      };
      const conn = [];
      for (let e = 0; e < 6; e++) { const kk = key(t.q + DIRS[e][0], t.r + DIRS[e][1]); if (idx.has(kk)) conn.push([e, dist.get(kk) ?? 0]); }
      if (t.t === 'pond') {
        this.pondMap.set(k, { x: t.x, z: t.z, r: 0.42, depth: 0.11 });
        for (const [e] of conn) { const m = mid(e), inner = [t.x + Math.cos(Math.PI / 3 * e) * 0.3, t.z + Math.sin(Math.PI / 3 * e) * 0.3]; lines.push(curve(m, inner, e)); }
      } else {
        const c = [t.x, t.z];
        for (const [e, dn] of conn) lines.push(dn < dt ? curve(c, mid(e), e) : curve(mid(e), c, e));
        // 出海口：选和上游方向最顺的那条海岸边，河水从那里落进海里
        const ce = coastEdges(t);
        if (dt === 0 && ce.length && src.includes(t)) {
          let best = ce[0], bs = -9;
          const ux = conn.reduce((a, [e]) => a + Math.cos(Math.PI / 3 * e), 0), uz = conn.reduce((a, [e]) => a + Math.sin(Math.PI / 3 * e), 0);
          for (const e of ce) { const sc = -(Math.cos(Math.PI / 3 * e) * ux + Math.sin(Math.PI / 3 * e) * uz) + NZ.n2(t.q * 1.7 + e, t.r * 1.3) * 0.01; if (sc > bs) { bs = sc; best = e; } }
          lines.push(curve(c, mid(best), best + 7));
          t.fall = { x: mid(best)[0], z: mid(best)[1], nx: Math.cos(Math.PI / 3 * best), nz: Math.sin(Math.PI / 3 * best) };
        } else if (dt === 0 && !ce.length && !comp.some((x) => x.t === 'pond')) {
          // 没有出海口也没有池塘：源头是一眼泉
          this.pondMap.set(k, { x: t.x, z: t.z, r: 0.2, depth: 0.07, spring: true });
        }
        if (!conn.length && !t.fall && !this.pondMap.has(k)) this.pondMap.set(k, { x: t.x, z: t.z, r: 0.2, depth: 0.07, spring: true });
      }
      if (lines.length) this.lines.set(k, lines);
      touched.add(k); for (const d of DIRS) touched.add(key(t.q + d[0], t.r + d[1]));
    }
    this.lineNear.clear();
    for (const kk of this.lines.keys()) { const [q, r] = kk.split(',').map(Number); this.lineNear.add(kk); for (const d of DIRS) this.lineNear.add(key(q + d[0], r + d[1])); }
    return [...touched];
  }
  /** 点到最近河道中心线的距离（样张的整条河 + 游戏里溪流地块的河道） */
  riverD(x, z) {
    let best = this.river ? this.river(x, z)[0] : 9;
    if (!this.lines.size) return best;
    const [q, r] = fromWorld(x, z); if (!this.lineNear.has(key(q, r))) return best;
    for (let k = -1; k < 6; k++) {
      const L = this.lines.get(k < 0 ? key(q, r) : key(q + DIRS[k][0], r + DIRS[k][1])); if (!L) continue;
      for (const pl of L) for (let i = 0; i < pl.length - 1; i++) {
        const [ax, az] = pl[i], [bx, bz] = pl[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - dx * u, z - az - dz * u);
        if (d < best) best = d;
      }
    }
    return best;
  }
  /** 离 (x,z) 最近、会影响它的池塘（样张的固定池塘 + 游戏里的池塘地块） */
  pondsAt(x, z) {
    const out = this.ponds.length ? this.ponds.slice() : [];
    if (this.pondMap.size) { const [q, r] = fromWorld(x, z), p = this.pondMap.get(key(q, r)); if (p) out.push(p); }
    return out;
  }
  /** 删掉一块地（自由画布的橡皮擦），返回受影响的地块键 */
  removeTile(q, r) {
    const k = key(q, r), t = this.map.get(k); if (!t) return [];
    this.map.delete(k); this.tiles.splice(this.tiles.indexOf(t), 1); this._cd?.clear(); this._ver = ++VER;
    this.field.remove(t.x, t.z, this.tiles);
    const out = new Set([k, ...DIRS.map((d) => key(q + d[0], r + d[1])), ...this._pathNet()]);
    if (this.lines.has(k) || this.pondMap.has(k)) { this.lines.delete(k); this.pondMap.delete(k); }
    for (const d of DIRS) { const n = this.map.get(key(q + d[0], r + d[1])); if (n && WATER.has(n.t)) for (const kk of this._waterNet(n)) out.add(kk); }
    return [...out];
  }
  tileAt(x, z) { const [q, r] = fromWorld(x, z); return this.map.get(key(q, r)); }
  has(q, r) { return this.map.has(key(q, r)); }

  /** 地块 t 在世界坐标 (x,z) 处的顶面高度（含细节起伏、接缝凹槽、海岸圆角、河道） */
  /** 自己 + 相邻的陆地（按地块增删的版本号缓存） */
  _nbList(t) {
    if (t._nbv !== this._ver) { const L = [t]; for (const d of DIRS) { const b = this.map.get(key(t.q + d[0], t.r + d[1])); if (b) L.push(b); } t._nb = L; t._nbv = this._ver; }
    return t._nb;
  }
  /** 地块交界的融合：点 (x,z) 上，自己和相邻几块地各占多少。
   *  权重只由那块地本身和点的位置决定，相邻两块地在交界处算出来完全一样，所以高度、颜色、起伏都连续，没有台阶和接缝；
   *  每块地的“势力范围”按各自的噪声进退，交界线是弯弯曲曲的，像草地慢慢长进沙地、林子慢慢稀到草地里。
   *  w：高度用（沙滩让一让，所以沙滩靠草地的一侧是缓缓抬起的沙坡）；wc：颜色用（更陡，地块类型读得清楚） */
  _mixAt(t, x, z) {
    const C = this._mc || (this._mc = { L: [], w: new Float32Array(7), wc: new Float32Array(7), n: 0 });
    if (C.t === t && C.x === x && C.z === z && C.v === this._ver) return C;
    const L = this._nbList(t); let n = 0, sw = 0, sc = 0;
    for (let i = 0; i < L.length; i++) {
      const b = L[i], d0 = Math.hypot(x - b.x, z - b.z);
      if (b !== t && d0 > 1.35) continue;
      const d = d0 + NZ.n2(x * 2.3 + b.q * 7.13, z * 2.3 + b.r * 5.37) * 0.13;
      let w = 1 - THREE.MathUtils.smoothstep(d, 0.35, 1.2); if (b === t) w = Math.max(w, 1e-4); if (w <= 0) continue;
      const sand = b.t === 'beach';
      C.L[n] = b; C.w[n] = w * (sand ? 0.45 : 1); C.wc[n] = w * w * w * (sand ? 0.8 : 1); sw += C.w[n]; sc += C.wc[n]; n++;
    }
    for (let i = 0; i < n; i++) { C.w[i] /= sw; C.wc[i] /= sc; }
    C.n = n; C.t = t; C.x = x; C.z = z; C.v = this._ver;
    return C;
  }
  /** 点 (x,z) 的地表里某种地块占多少（颜色权重，0–1）：给装点用，比如草地靠沙滩的一侧草变稀 */
  typeShare(t, x, z, ty) { const M = this._mixAt(t, x, z); let s = 0; for (let i = 0; i < M.n; i++) if (M.L[i].t === ty) s += M.wc[i]; return s; }
  /** 交界处融合后的基准高度 */
  _baseAt(t, x, z) { const M = this._mixAt(t, x, z); let b = 0; for (let i = 0; i < M.n; i++) b += M.w[i] * M.L[i].base; return b; }
  heightIn(t, x, z) {
    const lx = x - t.x, lz = z - t.z;
    // 基准高度 + 细节起伏：交界处按权重融合几块地的（同类地块只算一次）
    const M = this._mixAt(t, x, z); let h = 0;
    if (M.n === 1) h = t.base + detail(t.t, x, z);
    else {
      const seen = this._seen || (this._seen = []); seen.length = 0;
      for (let i = 0; i < M.n; i++) {
        const b = M.L[i]; let dv = null;
        for (let j = 0; j < seen.length; j += 2) if (seen[j] === b.t) { dv = seen[j + 1]; break; }
        if (dv == null) { dv = detail(b.t, x, z); seen.push(b.t, dv); }
        h += M.w[i] * (b.base + dv);
      }
    }
    // 海岸边做圆角（陆地之间的边不再有凹槽：两块地平滑相接）
    for (let k = 0; k < 6; k++) {
      if (this.has(t.q + DIRS[k][0], t.r + DIRS[k][1])) continue;
      const a = (Math.PI / 3) * k, d = INR - (lx * Math.cos(a) + lz * Math.sin(a));
      if (d < 0.16) { const f = 1 - Math.max(0, d) / 0.16; h -= 0.055 * f * f; }
    }
    // 池塘：碗状下凹
    for (const pd of this.pondsAt(x, z)) { const d = Math.hypot(x - pd.x, z - pd.z); if (d < pd.r * 1.3) { const f = 1 - THREE.MathUtils.smoothstep(d, pd.r * 0.45, pd.r * 1.3); h -= pd.depth * f; } }
    // 河道
    if (this.river || this.lines.size) {
      const d = this.riverD(x, z), w = this.riverW;
      if (d < w * 1.8) { const f = 1 - Math.min(1, d / (w * 1.8)); h -= 0.075 * (f * f * (3 - 2 * f)); }
    }
    return h;
  }
  /** 世界坐标处的地表高度；不在陆地上返回 null */
  heightAt(x, z) { const t = this.tileAt(x, z); return t ? this.heightIn(t, x, z) : null; }

  _topColor(t, x, z, h) {
    const n1 = NZ.fbm2(x * 0.9 + 11, z * 0.9 - 7, 3), n2 = NZ.fbm2(x * 2.6 - 3, z * 2.6 + 5, 2);
    const a1 = THREE.MathUtils.clamp(0.5 - n1 * 1.4, 0, 1) * 0.8, a2 = THREE.MathUtils.clamp(n2 * 1.6, 0, 1) * 0.55;
    // 地表底色：交界处按颜色权重融合相邻几块地的配色（草慢慢长进沙地、林下的深绿慢慢淡成草地）
    const M = this._mixAt(t, x, z), c = new THREE.Color(0, 0, 0), tmp = this._tc || (this._tc = new THREE.Color());
    for (let i = 0; i < M.n; i++) { const P = lcol(TYPES[M.L[i].t] || TYPES.meadow); tmp.copy(P[0]).lerp(P[1], a1).lerp(P[2], a2); c.r += tmp.r * M.wc[i]; c.g += tmp.g * M.wc[i]; c.b += tmp.b * M.wc[i]; }
    // 营地中间踩出来的泥土地
    if (t.t === 'camp') { const d = Math.hypot(x - t.x - 0.05, z - t.z + 0.05); const f = 1 - THREE.MathUtils.smoothstep(d, 0.18, 0.42 + NZ.n2(x * 6, z * 6) * 0.06); c.lerp(col(0xa8885c), f * 0.85); }
    // 采石场的碎石地
    if (t.t === 'quarry') { const f = THREE.MathUtils.smoothstep(NZ.fbm2(x * 3.1, z * 3.1, 3), 0.0, 0.35); c.lerp(col(0x938572), f * 0.7); }
    // 池塘边的湿泥和池底
    for (const pd of this.pondsAt(x, z)) { const d = Math.hypot(x - pd.x, z - pd.z); if (d < pd.r * 1.45) { c.lerp(col(0x5f6a3a), (1 - THREE.MathUtils.smoothstep(d, pd.r * 0.95, pd.r * 1.45)) * 0.7); c.lerp(col(0x4a4630), 1 - THREE.MathUtils.smoothstep(d, pd.r * 0.6, pd.r * 1.0)); } }
    // 河岸湿土
    if (this.river || this.lines.size) { const d = this.riverD(x, z); const f = 1 - THREE.MathUtils.smoothstep(d, this.riverW * 0.8, this.riverW * 2.0); c.lerp(col(0x6f7a46), f * 0.6); }
    // 小路：踩实的土路，边缘不规则，路中间颜色更浅
    if (this.paths.length && t.t !== 'beach') {
      const pd = this.pathD(x, z), w = 0.045 + NZ.n2(x * 7, z * 7) * 0.015;
      if (pd < w * 1.8) { const f = 1 - THREE.MathUtils.smoothstep(pd, w * 0.5, w * 1.8); c.lerp(col(0xa48a60), f * 0.85); c.lerp(col(0xbfa77a), (1 - THREE.MathUtils.smoothstep(pd, 0, w * 0.6)) * 0.3); }
    }
    // 海岸带：离海岸边越近草越稀，露出土和岩石（沙滩除外），宽度按位置变化
    if (t.t !== 'beach') {
      let dm = 9; const lx = x - t.x, lz = z - t.z;
      for (let k = 0; k < 6; k++) if (!this.has(t.q + DIRS[k][0], t.r + DIRS[k][1])) dm = Math.min(dm, INR - (lx * Math.cos(Math.PI / 3 * k) + lz * Math.sin(Math.PI / 3 * k)));
      if (dm < 0.4) {
        const n = NZ.fbm2(x * 4.1 + 2, z * 4.1 - 7, 3), f = 1 - THREE.MathUtils.smoothstep(dm, 0.02, 0.16 + n * 0.12);
        c.lerp(col(0x8a7552), f * 0.55 * THREE.MathUtils.clamp(0.6 + n, 0, 1));
        c.lerp(col(0x857f74), f * THREE.MathUtils.clamp(NZ.n2(x * 11, z * 11) * 1.4 - 0.2, 0, 0.6));
      }
    }
    // 凹槽处略暗（接缝读得出来）
    const dropAO = THREE.MathUtils.clamp((this._baseAt(t, x, z) - h) * 9, 0, 0.3);
    return c.multiplyScalar(1 - dropAO);
  }

  /** 静态构建（样张用）：所有地块一次性生成，返回 Group */
  build(material, rockMaterial) {
    const grp = new THREE.Group();
    const top = mergeColored(this.tiles.map((t) => this.tileTop(t)));
    const rock = mergeColored(this.tiles.map((t) => this.tileRock(t)).filter(Boolean));
    const mTop = new THREE.Mesh(top, material); mTop.receiveShadow = true; mTop.castShadow = true; mTop.name = 'terrain-top';
    const mRock = new THREE.Mesh(rock, rockMaterial); mRock.receiveShadow = true; mRock.castShadow = true; mRock.name = 'terrain-cliffs';
    grp.add(mTop, mRock);
    this.topMesh = mTop; this.rockMesh = mRock;
    return grp;
  }

  // ---------- 自然海岸线 ----------
  // 六边形的海岸边不再是直线：沿边按世界坐标的噪声往外凸（小岬角）或往里凹（小海湾），幅度约 -0.06 到 +0.1。
  // 位移只由位置决定，相邻地块、顶面和岩壁算出来的完全一样，接缝不会裂开。
  coastShift(x, z) { return NZ.fbm2(x * 1.7 + 5.3, z * 1.7 - 9.1, 3) * 0.14 + 0.02; }
  _cornerDisp(px, pz) {
    const k = Math.round(px * 100) + ',' + Math.round(pz * 100), c = this._cd || (this._cd = new Map());
    let d = c.get(k); if (d) return d;
    const n = this.cornerNormal(px, pz, null), m = n ? this.coastShift(px, pz) : 0;
    d = n ? [n[0] * m, n[1] * m] : [0, 0]; c.set(k, d); if (c.size > 20000) c.clear();
    return d;
  }
  /** 地块 t 第 k 条边上、从角 A 到角 B 参数 u 处的边界位移 [dx, dz] */
  edgeDisp(t, k, u) {
    const A = CORNERS[(k + 5) % 6], B = CORNERS[k], ax = t.x + A[0], az = t.z + A[1], bx = t.x + B[0], bz = t.z + B[1];
    const dA = this._cornerDisp(ax, az), dB = this._cornerDisp(bx, bz), ss = THREE.MathUtils.smoothstep;
    if (!this.has(t.q + DIRS[k][0], t.r + DIRS[k][1])) {
      const px = ax + (bx - ax) * u, pz = az + (bz - az) * u, m = this.coastShift(px, pz), nx = Math.cos(Math.PI / 3 * k), nz = Math.sin(Math.PI / 3 * k);
      const w = ss(u, 0, 0.22) * (1 - ss(u, 0.78, 1));
      return [(dA[0] * (1 - u) + dB[0] * u) * (1 - w) + nx * m * w, (dA[1] * (1 - u) + dB[1] * u) * (1 - w) + nz * m * w];
    }
    // 两块地之间的边：只在挨着海岸的角附近跟着角走，往里很快衰减到 0
    const fa = 1 - ss(u, 0, 0.18), fb = ss(u, 0.82, 1);
    return [dA[0] * fa + dB[0] * fb, dA[1] * fa + dB[1] * fb];
  }

  /** 一块地的顶面（带法线），坐标为世界坐标 */
  tileTop(t, SUB = SUB_HI) {
    const pos = [], colr = [], surf = [], idx = [], surfT = (TYPES[t.t] || TYPES.meadow).surf;
    for (let s = 0; s < 6; s++) {
      const a = CORNERS[s], b = CORNERS[(s + 1) % 6], base = pos.length / 3, k = (s + 1) % 6;
      for (let i = 0; i <= SUB; i++) for (let j = 0; j <= SUB - i; j++) {
        const u = i / SUB, v = j / SUB;
        let x = t.x + a[0] * u + b[0] * v, z = t.z + a[1] * u + b[1] * v;
        // 边界附近的点跟着边界位移走（越往里越少），海岸线就有了进退
        const e = 1 - u - v, w = Math.max(0, 1 - e * INR / 0.3);
        if (w > 0 && u + v > 0) { const d = this.edgeDisp(t, k, v / (u + v)), ww = w * w; x += d[0] * ww; z += d[1] * ww; }
        const h = this.heightIn(t, x, z);
        pos.push(x, h, z);
        const c = this._topColor(t, x, z, h); colr.push(c.r, c.g, c.b);
        surf.push(surfT[0], surfT[1], surfT[2]);
      }
      const row = (i) => { let o = 0; for (let k = 0; k < i; k++) o += SUB + 1 - k; return o; };
      for (let i = 0; i < SUB; i++) for (let j = 0; j < SUB - i; j++) {
        const p0 = base + row(i) + j, p1 = base + row(i + 1) + j, p2 = p0 + 1;
        idx.push(p0, p2, p1);
        if (j < SUB - i - 1) { const p3 = p1 + 1; idx.push(p2, p3, p1); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setAttribute('surf', new THREE.Float32BufferAttribute(surf, 3));
    g.setIndex(idx);
    const out = mergeTileSeams(g); out.computeVertexNormals();
    return out;
  }

  /** 一块地的“侧面”：朝海的岩壁 + 朝较低邻居的土坡；没有侧面时返回 null */
  tileRock(t) {
    const parts = [];
    for (let k = 0; k < 6; k++) {
      const nb = this.map.get(key(t.q + DIRS[k][0], t.r + DIRS[k][1]));
      if (!nb) parts.push(this.coastEdge(t, k));   // 陆地之间平滑相接，不再需要台阶侧面
    }
    return parts.length ? mergeColored(parts) : null;
  }

  /** 角点处的外法线：把所有接触这个角点的海岸边的法线加起来（相邻地块算出来完全一样，岩壁才能无缝对接） */
  cornerNormal(px, pz, fallback) {
    const keys = new Set();
    for (let m = 0; m < 6; m++) { const a = (Math.PI / 3) * m + Math.PI / 6, [q, r] = fromWorld(px + Math.cos(a) * 0.3, pz + Math.sin(a) * 0.3); keys.add(key(q, r)); }
    let nx = 0, nz = 0;
    for (const kk of keys) {
      const h = this.map.get(kk); if (!h) continue;
      for (let c = 0; c < 6; c++) {
        if (Math.abs(h.x + CORNERS[c][0] - px) > 1e-3 || Math.abs(h.z + CORNERS[c][1] - pz) > 1e-3) continue;
        for (const e of [c, (c + 1) % 6]) if (!this.has(h.q + DIRS[e][0], h.r + DIRS[e][1])) { nx += Math.cos((Math.PI / 3) * e); nz += Math.sin((Math.PI / 3) * e); }
      }
    }
    const l = Math.hypot(nx, nz);
    return l > 1e-4 ? [nx / l, nz / l] : fallback;
  }

  /** 沙滩海岸边 k 上参数 u（0–1）处、高度为 y 的那一点（和 coastEdge 的沙坡算法一致）；返回 [x, z, 外法线x, 外法线z] */
  beachPoint(t, k, u, y) {
    const A = CORNERS[(k + 5) % 6], B = CORNERS[k], d = this.edgeDisp(t, k, u), nx = Math.cos((Math.PI / 3) * k), nz = Math.sin((Math.PI / 3) * k);
    const x0 = t.x + A[0] + (B[0] - A[0]) * u + d[0], z0 = t.z + A[1] + (B[1] - A[1]) * u + d[1], yTop = this.heightIn(t, x0 - nx * 1e-3, z0 - nz * 1e-3);
    const dy = Math.max(0, yTop - y), v = dy / (yTop - SEA_FLOOR), off = Math.min(dy, 0.9) * 1.75 + Math.max(0, dy - 0.9) * 0.6 + NZ.n2(x0 * 3, z0 * 3) * 0.04 * Math.min(1, v * 6);
    return [x0 + nx * off, z0 + nz * off, nx, nz];
  }
  /** 一条海岸边的岩壁（沙滩是缓坡） */
  coastEdge(t, k) {
    const NU = 12, ROWS = [0, 0.012, 0.035, 0.07, 0.12, 0.2, 0.3, 0.42, 0.56, 0.7, 0.82, 0.92, 1.0], R = ROWS.length;
    const A = [t.x + CORNERS[(k + 5) % 6][0], t.z + CORNERS[(k + 5) % 6][1]], B = [t.x + CORNERS[k][0], t.z + CORNERS[k][1]];
    const nE = [Math.cos((Math.PI / 3) * k), Math.sin((Math.PI / 3) * k)], nA = this.cornerNormal(A[0], A[1], nE), nB = this.cornerNormal(B[0], B[1], nE);
    const pos = new Float32Array((NU + 1) * R * 3), colr = new Float32Array((NU + 1) * R * 3), surf = new Float32Array((NU + 1) * R * 3);
    const strata = [col(0x8a6a4c), col(0x6f523c), col(0x9a7a58), col(0x5c4636), col(0x7d6650)], grassC = col(0x6f9a38), wet = col(0x3e3a34), rockG = col(0x77736c);
    const beach = t.t === 'beach';
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, dsp = this.edgeDisp(t, k, u), x0 = A[0] + (B[0] - A[0]) * u + dsp[0], z0 = A[1] + (B[1] - A[1]) * u + dsp[1];
      const n = i === 0 ? nA : i === NU ? nB : nE;
      const yTop = this.heightIn(t, x0 - n[0] * 1e-3, z0 - n[1] * 1e-3), lipC = this._topColor(t, x0, z0, yTop);
      for (let j = 0; j < R; j++) {
        const v = ROWS[j], y = yTop + (SEA_FLOOR - yTop) * v;
        let off = (j === 0 ? 0 : 0.012 + 0.03 * Math.sin(Math.min(1, v * 4) * Math.PI * 0.5)) + Math.max(0, v - 0.55) ** 2 * 1.4;
        if (beach) off = Math.min(yTop - y, 0.9) * 1.75 + Math.max(0, yTop - y - 0.9) * 0.6 + NZ.n2(x0 * 3, z0 * 3) * 0.04 * Math.min(1, v * 6);
        if (j >= 2 && !beach) off += NZ.fbm3(x0 * 1.8, y * 2.6, z0 * 1.8, 4) * 0.11 + Math.round(NZ.n3(x0 * 0.7, y * 7.0, z0 * 0.7) * 2) * 0.022;
        const wx = j >= 2 && !beach ? NZ.n3(x0 * 2.3 + 40, y * 2.3, z0 * 2.3) * 0.04 : 0, wz = j >= 2 && !beach ? NZ.n3(x0 * 2.3, y * 2.3, z0 * 2.3 - 40) * 0.04 : 0;
        const o = (i * R + j) * 3;
        pos[o] = x0 + n[0] * off + wx; pos[o + 1] = y + (j >= 2 ? NZ.n3(x0 * 3, y * 3, z0 * 3) * 0.02 : 0); pos[o + 2] = z0 + n[1] * off + wz;
        const band = strata[Math.abs(Math.floor(y * 9 + NZ.n3(x0 * 1.2, y * 2, z0 * 1.2) * 1.6)) % strata.length].clone();
        band.lerp(rockG, THREE.MathUtils.clamp(-y * 0.5, 0, 0.6));
        if (j <= 1) band.copy(lipC); else if (j === 2) band.lerp(lipC, 0.35 + NZ.n2(x0 * 9, z0 * 9) * 0.3);
        const wetF = 1 - THREE.MathUtils.smoothstep(y, -0.05, 0.12);
        if (beach) { band.copy(col(0xe6d3a2)).lerp(col(0xc9b07c), THREE.MathUtils.clamp(0.2 - y * 2, 0, 1) * 0.6).multiplyScalar(0.93 + NZ.n2(x0 * 20, y * 20) * 0.07); band.lerp(col(0xb59a6a), wetF * 0.6); }
        else band.lerp(wet, wetF * 0.55);
        colr[o] = band.r; colr[o + 1] = band.g; colr[o + 2] = band.b;
        surf[o] = j <= 1 && !beach ? 1 : 0; surf[o + 1] = j <= 1 || beach ? 0 : 1; surf[o + 2] = beach ? 0.1 : wetF;
      }
    }
    const idx = [];
    for (let i = 0; i < NU; i++) for (let j = 0; j < R - 1; j++) { const a = i * R + j, b = (i + 1) * R + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3)); g.setAttribute('surf', new THREE.BufferAttribute(surf, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }


  /** 到最近陆地边缘的距离（陆地距离场，增量更新） */
  landDist(x, z) { return this.field.dist(x, z); }
  /** 海底高度：岛周围浅、远处深 */
  seabedAt(x, z) {
    const dl = this.landDist(x, z), ss = THREE.MathUtils.smoothstep;
    let y = -0.42 - 1.0 * ss(dl, 0, 2.2) - 2.8 * ss(dl, 2.2, 14);
    y += NZ.fbm2(x * 0.35, z * 0.35, 4) * 0.35 * ss(dl, 0.5, 4) + NZ.n2(x * 2.2, z * 2.2) * 0.04;
    y += Math.sin(x * 2.4 + NZ.n2(x * 0.3, z * 0.3) * 4) * 0.015;
    // 近岸台地：宽窄按位置变化（0.4–1.6 个单位），台地上起伏不平，有的地方浅到露出水面
    const w = 0.4 + (NZ.fbm2(x * 0.45 - 3, z * 0.45 + 8, 2) * 0.5 + 0.5) * 1.2, k = 1 - ss(dl, w * 0.55, w);
    if (k > 0) { const shelf = -0.2 + NZ.fbm2(x * 1.3 + 11, z * 1.3, 3) * 0.22 + NZ.n2(x * 5, z * 5) * 0.03; y = y + (Math.max(y, shelf) - y) * k; }
    return y;
  }
  /** 海底网格（样张：一整块；游戏：按区块，传入中心） */
  buildSeabed(material, radius = 60, seg = 240, cx = 0, cz = 0) {
    const g = new THREE.PlaneGeometry(radius * 2, radius * 2, seg, seg); g.rotateX(-Math.PI / 2); g.translate(cx, 0, cz);
    const p = g.attributes.position, colr = new Float32Array(p.count * 3), sand = col(0xcdb88e), mid = col(0x7f8c6e), deep = col(0x3b5560), rockC = col(0x7a7468);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const dl = this.landDist(x, z), y = this.seabedAt(x, z);
      p.setY(i, y);
      const c = sand.clone().lerp(mid, THREE.MathUtils.smoothstep(dl, 1.2, 5)).lerp(deep, THREE.MathUtils.smoothstep(dl, 5, 16));
      // 台地上：靠近水面的地方是湿沙和长着海藻的礁石，露出水面的沙洲颜色偏浅
      if (y > -0.3) { const r = NZ.fbm2(x * 2.3 - 4, z * 2.3 + 1, 3); c.lerp(r > 0.12 ? col(0x6f6a52) : col(0xcfbd93), THREE.MathUtils.smoothstep(y, -0.3, -0.05) * 0.7); if (r > 0.25) c.lerp(col(0x55613a), 0.35); }
      c.lerp(rockC, THREE.MathUtils.clamp(NZ.fbm2(x * 0.8 + 50, z * 0.8, 3) * 2 - 0.4, 0, 0.6) * (1 - THREE.MathUtils.smoothstep(dl, 3, 8)));
      colr[i * 3] = c.r; colr[i * 3 + 1] = c.g; colr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    const surf = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { surf[i * 3 + 1] = 0.3; surf[i * 3 + 2] = 1; }
    g.setAttribute('surf', new THREE.BufferAttribute(surf, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material); m.receiveShadow = true; m.name = 'seabed';
    return m;
  }
}


/** 相邻扇区共享的边上会有重复顶点：按位置合并，法线才能平滑 */
function mergeTileSeams(g) {
  const p = g.attributes.position, map = new Map(), remap = new Uint32Array(p.count), keep = [];
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 2000) + '_' + Math.round(p.getZ(i) * 2000) + '_' + Math.round(p.getY(i) * 2000);
    let j = map.get(k);
    if (j === undefined) { j = keep.length; map.set(k, j); keep.push(i); }
    remap[i] = j;
  }
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name], arr = new Float32Array(keep.length * a.itemSize);
    keep.forEach((src, d) => { for (let c = 0; c < a.itemSize; c++) arr[d * a.itemSize + c] = a.array[src * a.itemSize + c]; });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  const idx = g.index.array, ni = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) ni[i] = remap[idx[i]];
  out.setIndex(new THREE.BufferAttribute(ni, 1));
  return out;
}

/** 合并带 color/surf 的几何（缺 surf 的补 [0,1,0]） */
export function mergeColored(list) {
  list = list.filter(Boolean);
  if (list.length === 1 && list[0].attributes.surf) return list[0];
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), c = new Float32Array(nv * 3), s = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, ov * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, ov * 3);
    c.set(g.attributes.color.array, ov * 3);
    if (g.attributes.surf) s.set(g.attributes.surf.array, ov * 3); else for (let i = 0; i < n; i++) s[(ov + i) * 3 + 1] = 1;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov; else for (let i = 0; i < n; i++) idx[oi + i] = ov + i;
    oi += g.index ? g.index.count : n; ov += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  out.setAttribute('surf', new THREE.BufferAttribute(s, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
