// geo.js — 极简三角面构建器：每个顶点带颜色，配合平面着色得到低多边形观感。
// 单位约定：六边形地块外接圆半径 = 1；y 轴向上；模型原点在底部中心（y=0 落地）。
import * as THREE from 'three';

const _col = new THREE.Color();
const _linCache = new Map();
/** sRGB 十六进制 → 线性 RGB 数组 */
export function lin(hex) {
  let v = _linCache.get(hex);
  if (!v) { _col.setHex(hex); v = [_col.r, _col.g, _col.b]; _linCache.set(hex, v); }
  return v;
}
const rgb = (c) => (typeof c === 'number' ? lin(c) : c);

/** 可复现随机数：返回 () => [0,1) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash3(x, y, z, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440662683) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return h >>> 0;
}
/** rng 辅助 */
export const rr = (rng, a, b) => a + (b - a) * rng();
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

export class G {
  constructor() { this.p = []; this.c = []; }
  get count() { return this.p.length / 3; }
  get tris() { return this.p.length / 9; }

  // ---------- 追加面 ----------
  /** 三角形：a,b,c 为 [x,y,z]，col 为十六进制颜色 */
  tri(a, b, c, col) {
    const k = rgb(col);
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.c.push(k[0], k[1], k[2], k[0], k[1], k[2], k[0], k[1], k[2]);
    return this;
  }
  /** 四边形：a,b,c,d 按逆时针或顺时针依次给出 */
  quad(a, b, c, d, col) { return this.tri(a, b, c, col).tri(a, c, d, col); }
  /** 追加另一个 G（不修改对方） */
  add(g) {
    if (!g) return this;
    for (let i = 0; i < g.p.length; i++) this.p.push(g.p[i]);
    for (let i = 0; i < g.c.length; i++) this.c.push(g.c[i]);
    return this;
  }
  clone() { const g = new G(); g.p = this.p.slice(); g.c = this.c.slice(); return g; }

  // ---------- 变换（原地修改，返回 this，可链式） ----------
  translate(x, y, z) {
    const p = this.p;
    for (let i = 0; i < p.length; i += 3) { p[i] += x; p[i + 1] += y; p[i + 2] += z; }
    return this;
  }
  scale(sx, sy = sx, sz = sx) {
    const p = this.p;
    for (let i = 0; i < p.length; i += 3) { p[i] *= sx; p[i + 1] *= sy; p[i + 2] *= sz; }
    return this;
  }
  rotateY(a) {
    const p = this.p, c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 2]; p[i] = x * c + z * s; p[i + 2] = -x * s + z * c; }
    return this;
  }
  rotateX(a) {
    const p = this.p, c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < p.length; i += 3) { const y = p[i + 1], z = p[i + 2]; p[i + 1] = y * c - z * s; p[i + 2] = y * s + z * c; }
    return this;
  }
  rotateZ(a) {
    const p = this.p, c = Math.cos(a), s = Math.sin(a);
    for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1]; p[i] = x * c - y * s; p[i + 1] = x * s + y * c; }
    return this;
  }
  /** 顶点抖动：同一位置的顶点位移一致（不会裂缝）。amt 可为数字或 [ax,ay,az] */
  jitter(amt, seed = 0) {
    const p = this.p;
    const ax = Array.isArray(amt) ? amt[0] : amt, ay = Array.isArray(amt) ? amt[1] : amt, az = Array.isArray(amt) ? amt[2] : amt;
    for (let i = 0; i < p.length; i += 3) {
      const kx = Math.round(p[i] * 500), ky = Math.round(p[i + 1] * 500), kz = Math.round(p[i + 2] * 500);
      const h1 = hash3(kx, ky, kz, seed), h2 = hash3(kx, ky, kz, seed + 77), h3 = hash3(kx, ky, kz, seed + 191);
      p[i] += (h1 / 4294967296 * 2 - 1) * ax;
      p[i + 1] += (h2 / 4294967296 * 2 - 1) * ay;
      p[i + 2] += (h3 / 4294967296 * 2 - 1) * az;
    }
    return this;
  }

  // ---------- 着色 ----------
  /** 全部涂成一个颜色 */
  paint(col) { const k = rgb(col), c = this.c; for (let i = 0; i < c.length; i += 3) { c[i] = k[0]; c[i + 1] = k[1]; c[i + 2] = k[2]; } return this; }
  /** 按高度渐变：y<=y0 用 colLow，y>=y1 用 colHigh */
  gradientY(colLow, colHigh, y0, y1) {
    const a = rgb(colLow), b = rgb(colHigh), p = this.p, c = this.c;
    for (let i = 0; i < c.length; i += 3) {
      const t = Math.min(1, Math.max(0, (p[i + 1] - y0) / (y1 - y0 || 1)));
      c[i] = a[0] + (b[0] - a[0]) * t; c[i + 1] = a[1] + (b[1] - a[1]) * t; c[i + 2] = a[2] + (b[2] - a[2]) * t;
    }
    return this;
  }
  /** 高于 y 的顶点涂成 col（雪顶、屋檐等） */
  paintAbove(y, col) { const k = rgb(col), p = this.p, c = this.c; for (let i = 0; i < c.length; i += 3) if (p[i + 1] >= y) { c[i] = k[0]; c[i + 1] = k[1]; c[i + 2] = k[2]; } return this; }
  /** 每个三角面的明度随机浮动 ±amount，增强切面感 */
  vary(amount = 0.06, seed = 0) {
    const c = this.c, p = this.p;
    for (let i = 0; i < c.length; i += 9) {
      const h = hash3(Math.round((p[i] + p[i + 3] + p[i + 6]) * 331), Math.round((p[i + 1] + p[i + 4] + p[i + 7]) * 331), Math.round((p[i + 2] + p[i + 5] + p[i + 8]) * 331), seed);
      const f = 1 + (h / 4294967296 * 2 - 1) * amount;
      for (let j = 0; j < 9; j++) c[i + j] *= f;
    }
    return this;
  }

  bounds() {
    const p = this.p, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { if (p[i + k] < mn[k]) mn[k] = p[i + k]; if (p[i + k] > mx[k]) mx[k] = p[i + k]; }
    return { min: mn, max: mx };
  }
  toGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
    geo.computeVertexNormals(); // 非索引几何 → 每面一个法线（阴影偏移要用）
    geo.computeBoundingSphere();
    return geo;
  }

  // ---------- 基础体（底面在 y=0，水平居中） ----------
  static from(geometry, col) {
    const g = new G(), src = geometry.index ? geometry.toNonIndexed() : geometry, a = src.attributes.position.array, k = rgb(col);
    for (let i = 0; i < a.length; i++) g.p.push(a[i]);
    for (let i = 0; i < a.length; i += 3) g.c.push(k[0], k[1], k[2]);
    if (src !== geometry) src.dispose();
    geometry.dispose();
    return g;
  }
  /** 长方体：宽(x) 高(y) 深(z) */
  static box(w, h, d, col) { return G.from(new THREE.BoxGeometry(w, h, d), col).translate(0, h / 2, 0); }
  /** 圆柱/圆台：底半径、顶半径、高、边数 */
  static cyl(rBottom, rTop, h, seg, col, open = false) { return G.from(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open), col).translate(0, h / 2, 0); }
  /** 圆锥：底半径、高、边数 */
  static cone(r, h, seg, col) { return G.from(new THREE.ConeGeometry(r, h, seg), col).translate(0, h / 2, 0); }
  /** 二十面体球：球心在原点（注意不是落地）。detail=0 为 20 面，1 为 80 面 */
  static ico(r, detail, col) { return G.from(new THREE.IcosahedronGeometry(r, detail), col); }
  /** 人字屋顶：宽(x) 高(y) 深(z)，屋脊沿 z 轴 */
  static roof(w, h, d, col) {
    const g = new G(), x = w / 2, z = d / 2;
    g.quad([-x, 0, z], [0, h, z], [0, h, -z], [-x, 0, -z], col);
    g.quad([x, 0, -z], [0, h, -z], [0, h, z], [x, 0, z], col);
    g.tri([-x, 0, z], [x, 0, z], [0, h, z], col);
    g.tri([x, 0, -z], [-x, 0, -z], [0, h, -z], col);
    return g;
  }
  /** 四坡屋顶（四棱锥）：宽(x) 高(y) 深(z) */
  static pyramid(w, h, d, col) {
    const g = new G(), x = w / 2, z = d / 2, t = [0, h, 0];
    g.tri([-x, 0, z], [x, 0, z], t, col).tri([x, 0, z], [x, 0, -z], t, col).tri([x, 0, -z], [-x, 0, -z], t, col).tri([-x, 0, -z], [-x, 0, z], t, col);
    return g;
  }
  /** 把多边形（XZ 平面上的点 [[x,z],...]，逆时针）从 y0 拉伸到 y1，带顶面 */
  static extrude(pts, y0, y1, colSide, colTop = colSide) {
    const g = new G(), n = pts.length;
    let cx = 0, cz = 0;
    for (const q of pts) { cx += q[0] / n; cz += q[1] / n; }
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      g.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], colSide);
      g.tri([cx, y1, cz], [a[0], y1, a[1]], [b[0], y1, b[1]], colTop);
    }
    return g;
  }
  static merge(...gs) { const g = new G(); for (const o of gs.flat()) g.add(o); return g; }
}
