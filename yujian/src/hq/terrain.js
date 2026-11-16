// 高画质地形：每块地的顶面（细分网格 + 起伏 + 接缝凹槽）、地块之间的台阶、整座岛连续的海岸岩壁、海底。
import * as THREE from 'three';
import { toWorld, fromWorld, key, DIRS, CORNERS } from '../hex.js';
import { makeNoise } from './noise.js';
import { LandField } from './landfield.js';

const NZ = makeNoise(20261115);
const SUB = 18;                         // 每个三角扇区的细分数
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
  islet: { h: 0.415, c: [0x9cb85a, 0x84a24c, 0xbac469], surf: [1, 0.1, 0] },
};
const col = (hex) => new THREE.Color(hex); // three 默认开启色彩管理，得到的是线性值

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
    this.field = new LandField();
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
    this.tiles.push(t); this.map.set(key(t.q, t.r), t); this._init(t);
    return [key(t.q, t.r), ...DIRS.map((d) => key(t.q + d[0], t.r + d[1]))];
  }
  tileAt(x, z) { const [q, r] = fromWorld(x, z); return this.map.get(key(q, r)); }
  has(q, r) { return this.map.has(key(q, r)); }

  /** 地块 t 在世界坐标 (x,z) 处的顶面高度（含细节起伏、接缝凹槽、海岸圆角、河道） */
  heightIn(t, x, z) {
    const lx = x - t.x, lz = z - t.z;
    let h = t.base;
    // 细节起伏
    const ty = t.t;
    if (ty === 'meadow' || ty === 'flowers' || ty === 'camp' || ty === 'islet') h += NZ.fbm2(x * 1.3, z * 1.3, 3) * 0.014 + NZ.n2(x * 5, z * 5) * 0.003;
    else if (ty === 'forest') h += NZ.fbm2(x * 1.7, z * 1.7, 3) * 0.018 + NZ.n2(x * 7, z * 7) * 0.004;
    else if (ty === 'quarry') h += NZ.fbm2(x * 2.2, z * 2.2, 3) * 0.022;
    else if (ty === 'mountain') h += NZ.fbm2(x * 1.4, z * 1.4, 3) * 0.02;
    else h += NZ.n2(x * 3, z * 3) * 0.004;
    // 到六条边的距离：有邻居的边做浅凹槽，海岸边做圆角
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k, d = INR - (lx * Math.cos(a) + lz * Math.sin(a));
      const coast = !this.has(t.q + DIRS[k][0], t.r + DIRS[k][1]);
      const w = coast ? 0.16 : 0.07, dep = coast ? 0.055 : 0.014;
      if (d < w) { const f = 1 - Math.max(0, d) / w; h -= dep * f * f; }
    }
    // 池塘：碗状下凹
    for (const pd of this.ponds) { const d = Math.hypot(x - pd.x, z - pd.z); if (d < pd.r * 1.3) { const f = 1 - THREE.MathUtils.smoothstep(d, pd.r * 0.45, pd.r * 1.3); h -= pd.depth * f; } }
    // 河道
    if (this.river) {
      const [d] = this.river(x, z), w = this.riverW;
      if (d < w * 1.8) { const f = 1 - Math.min(1, d / (w * 1.8)); h -= 0.075 * (f * f * (3 - 2 * f)); }
    }
    return h;
  }
  /** 世界坐标处的地表高度；不在陆地上返回 null */
  heightAt(x, z) { const t = this.tileAt(x, z); return t ? this.heightIn(t, x, z) : null; }

  _topColor(t, x, z, h) {
    const ty = TYPES[t.t], c = col(ty.c[0]);
    const n1 = NZ.fbm2(x * 0.9 + 11, z * 0.9 - 7, 3), n2 = NZ.fbm2(x * 2.6 - 3, z * 2.6 + 5, 2);
    c.lerp(col(ty.c[1]), THREE.MathUtils.clamp(0.5 - n1 * 1.4, 0, 1) * 0.8);
    c.lerp(col(ty.c[2]), THREE.MathUtils.clamp(n2 * 1.6, 0, 1) * 0.55);
    // 营地中间踩出来的泥土地
    if (t.t === 'camp') { const d = Math.hypot(x - t.x - 0.05, z - t.z + 0.05); const f = 1 - THREE.MathUtils.smoothstep(d, 0.18, 0.42 + NZ.n2(x * 6, z * 6) * 0.06); c.lerp(col(0xa8885c), f * 0.85); }
    // 采石场的碎石地
    if (t.t === 'quarry') { const f = THREE.MathUtils.smoothstep(NZ.fbm2(x * 3.1, z * 3.1, 3), 0.0, 0.35); c.lerp(col(0x938572), f * 0.7); }
    // 菜田边缘长一圈草
    if (t.t === 'field' || t.t === 'wheat') {
      let dm = 9; for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k; dm = Math.min(dm, INR - ((x - t.x) * Math.cos(a) + (z - t.z) * Math.sin(a))); }
      c.lerp(col(0x86b244), 1 - THREE.MathUtils.smoothstep(dm, 0.05, 0.13 + NZ.n2(x * 9, z * 9) * 0.03));
    }
    // 池塘边的湿泥和池底
    for (const pd of this.ponds) { const d = Math.hypot(x - pd.x, z - pd.z); if (d < pd.r * 1.45) { c.lerp(col(0x5f6a3a), (1 - THREE.MathUtils.smoothstep(d, pd.r * 0.95, pd.r * 1.45)) * 0.7); c.lerp(col(0x4a4630), 1 - THREE.MathUtils.smoothstep(d, pd.r * 0.6, pd.r * 1.0)); } }
    // 河岸湿土
    if (this.river) { const [d] = this.river(x, z); const f = 1 - THREE.MathUtils.smoothstep(d, this.riverW * 0.8, this.riverW * 2.0); c.lerp(col(0x6f7a46), f * 0.6); }
    // 凹槽处略暗（接缝读得出来）
    const dropAO = THREE.MathUtils.clamp((t.base - h) * 9, 0, 0.3);
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

  /** 一块地的顶面（带法线），坐标为世界坐标 */
  tileTop(t) {
    const pos = [], colr = [], surf = [], idx = [], surfT = (TYPES[t.t] || TYPES.meadow).surf;
    for (let s = 0; s < 6; s++) {
      const a = CORNERS[s], b = CORNERS[(s + 1) % 6], base = pos.length / 3;
      for (let i = 0; i <= SUB; i++) for (let j = 0; j <= SUB - i; j++) {
        const u = i / SUB, v = j / SUB;
        const x = t.x + a[0] * u + b[0] * v, z = t.z + a[1] * u + b[1] * v, h = this.heightIn(t, x, z);
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
      if (!nb) parts.push(this.coastEdge(t, k));
      else if (nb.base < t.base - 0.004) parts.push(this.stepEdge(t, k, nb));
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

  /** 一条海岸边的岩壁（沙滩是缓坡） */
  coastEdge(t, k) {
    const NU = 12, ROWS = [0, 0.012, 0.035, 0.07, 0.12, 0.2, 0.3, 0.42, 0.56, 0.7, 0.82, 0.92, 1.0], R = ROWS.length;
    const A = [t.x + CORNERS[(k + 5) % 6][0], t.z + CORNERS[(k + 5) % 6][1]], B = [t.x + CORNERS[k][0], t.z + CORNERS[k][1]];
    const nE = [Math.cos((Math.PI / 3) * k), Math.sin((Math.PI / 3) * k)], nA = this.cornerNormal(A[0], A[1], nE), nB = this.cornerNormal(B[0], B[1], nE);
    const pos = new Float32Array((NU + 1) * R * 3), colr = new Float32Array((NU + 1) * R * 3), surf = new Float32Array((NU + 1) * R * 3);
    const strata = [col(0x8a6a4c), col(0x6f523c), col(0x9a7a58), col(0x5c4636), col(0x7d6650)], grassC = col(0x6f9a38), wet = col(0x3e3a34), rockG = col(0x77736c);
    const beach = t.t === 'beach';
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, x0 = A[0] + (B[0] - A[0]) * u, z0 = A[1] + (B[1] - A[1]) * u;
      const n = i === 0 ? nA : i === NU ? nB : nE;
      const yTop = this.heightIn(t, x0 - n[0] * 1e-3, z0 - n[1] * 1e-3);
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
        if (j <= 1) band.copy(grassC); else if (j === 2) band.lerp(grassC, 0.35 + NZ.n2(x0 * 9, z0 * 9) * 0.3);
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

  /** 朝较低邻居的一面：做成带草皮唇边的土坡，下沿伸进邻居地里；邻居是沙滩时过渡成沙坡 */
  stepEdge(t, k, nb) {
    const N = SUB * 2, ROWS = 4, A = [t.x + CORNERS[(k + 5) % 6][0], t.z + CORNERS[(k + 5) % 6][1]], B = [t.x + CORNERS[k][0], t.z + CORNERS[k][1]];
    const nx = Math.cos((Math.PI / 3) * k), nz = Math.sin((Math.PI / 3) * k), sandy = nb.t === 'beach';
    const lip = col(0x6f9a38), soil = col(0x7a5a3e), soilD = col(0x5a422d), sand = col(0xd9c597);
    const pos = [], colr = [], idx = [], srf = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, x0 = A[0] + (B[0] - A[0]) * u, z0 = A[1] + (B[1] - A[1]) * u, y1 = this.heightIn(t, x0, z0);
      const dh = Math.max(0.01, y1 - this.heightIn(nb, x0, z0)), reach = dh * (sandy ? 2.6 : 1.1) + 0.025 + NZ.n2(x0 * 7, z0 * 7) * 0.012;
      for (let j = 0; j < ROWS; j++) {
        const f = j / (ROWS - 1), ox = x0 + nx * reach * f, oz = z0 + nz * reach * f;
        const yb = this.heightIn(nb, ox, oz) - 0.006, y = j === 0 ? y1 : THREE.MathUtils.lerp(y1, yb, sandy ? f : Math.pow(f, 0.7));
        pos.push(ox, y, oz);
        const c = j === 0 ? lip.clone() : sandy ? soil.clone().lerp(sand, f) : soil.clone().lerp(soilD, f);
        c.multiplyScalar(0.92 + NZ.n2(x0 * 15, y * 30) * 0.08);
        colr.push(c.r, c.g, c.b); srf.push(j === 0 ? 1 : 0, 0, j === 0 ? 0 : 1);
      }
      if (i < N) for (let j = 0; j < ROWS - 1; j++) { const a = i * ROWS + j, b = (i + 1) * ROWS + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setAttribute('surf', new THREE.Float32BufferAttribute(srf, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /** 到最近陆地边缘的距离（陆地距离场，增量更新） */
  landDist(x, z) { return this.field.dist(x, z); }
  /** 海底高度：岛周围浅、远处深 */
  seabedAt(x, z) {
    const dl = this.landDist(x, z);
    let y = -0.42 - 1.0 * THREE.MathUtils.smoothstep(dl, 0, 2.2) - 2.8 * THREE.MathUtils.smoothstep(dl, 2.2, 14);
    y += NZ.fbm2(x * 0.35, z * 0.35, 4) * 0.35 * THREE.MathUtils.smoothstep(dl, 0.5, 4) + NZ.n2(x * 2.2, z * 2.2) * 0.04;
    y += Math.sin(x * 2.4 + NZ.n2(x * 0.3, z * 0.3) * 4) * 0.015;
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
