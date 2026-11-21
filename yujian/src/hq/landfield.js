// 陆地距离场：记录每个点到最近陆地边缘的距离（陆地内为 0）。
// 地块只增不减，所以新增地块时只要在它周围取 min 即可，增量更新、开销很小。海底深度、浪花、鱼群避岸、生态分区都查它。
const INR = Math.sqrt(3) / 2;
const NS = Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]);
const CELL = 0.5, CN = 32, MAXD = 64, REACH = 16;

/** 点到单个六边形边缘的距离（外部为正，内部为负；用六个半平面的最大值近似） */
export function hexEdgeDist(px, pz, cx, cz) {
  const lx = px - cx, lz = pz - cz;
  let m = -1e9; for (const n of NS) { const d = lx * n[0] + lz * n[1]; if (d > m) m = d; }
  return m - INR;
}

export class LandField {
  constructor() { this.chunks = new Map(); this.version = 0; }
  _chunk(ix, iz, create) {
    const cx = Math.floor(ix / CN), cz = Math.floor(iz / CN), k = cx + ',' + cz;
    let c = this.chunks.get(k);
    if (!c && create) { c = new Float32Array(CN * CN).fill(MAXD); this.chunks.set(k, c); }
    return c ? [c, (iz - cz * CN) * CN + (ix - cx * CN)] : null;
  }
  cell(ix, iz) { const r = this._chunk(ix, iz, false); return r ? r[0][r[1]] : MAXD; }
  /** 加入一块地（中心 cx,cz） */
  add(cx, cz) {
    const i0 = Math.floor((cx - REACH) / CELL), i1 = Math.ceil((cx + REACH) / CELL), j0 = Math.floor((cz - REACH) / CELL), j1 = Math.ceil((cz + REACH) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, d = Math.max(0, hexEdgeDist(x, z, cx, cz));
      if (d > REACH) continue;
      const [c, o] = this._chunk(i, j, true);
      if (d < c[o]) c[o] = d;
    }
    this.version++;
  }
  /** 删掉一块地以后：把它周围的格子清空，再用附近剩下的地块重算（只动这一片） */
  remove(cx, cz, tiles) {
    const i0 = Math.floor((cx - REACH) / CELL), i1 = Math.ceil((cx + REACH) / CELL), j0 = Math.floor((cz - REACH) / CELL), j1 = Math.ceil((cz + REACH) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const r = this._chunk(i, j, false); if (r) r[0][r[1]] = MAXD; }
    const near = tiles.filter((t) => Math.abs(t.x - cx) < REACH * 2 + 1 && Math.abs(t.z - cz) < REACH * 2 + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL; let m = MAXD;
      for (const t of near) { const d = Math.max(0, hexEdgeDist(x, z, t.x, t.z)); if (d < m) m = d; }
      if (m < MAXD) { const [c, o] = this._chunk(i, j, true); c[o] = m; }
    }
    this.version++;
  }
  /** 双线性插值的距离 */
  dist(x, z) {
    const fx = x / CELL - 0.5, fz = z / CELL - 0.5, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = this.cell(i, j), b = this.cell(i + 1, j), c = this.cell(i, j + 1), d = this.cell(i + 1, j + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  /** 离岸系数：贴着陆地为 1，向外 3.2 个单位衰减到 0 */
  shore(x, z) { return 1 - Math.min(1, this.dist(x, z) / 3.2); }
}
