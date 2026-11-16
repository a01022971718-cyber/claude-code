// 《屿见》高画质版：程序化陆地动物与湿地 / 沙滩植物模型（风格化写实）。
// 只依赖 three 与 BufferGeometryUtils；不使用 DOM / Math.random（随机数由 seed 决定，可复现）。
// 每个导出函数：(seed = 1, ...) => { geometry, parts?, anchors? }
//   geometry：非索引的合并几何，带 position / normal / color（线性 RGB，已乘入烘焙 AO），
//             蝴蝶 / 蜻蜓 / 小鸟另有 wing（-1..1，左负右正），椰子树 / 芦苇 / 香蒲 / 睡莲另有 wind（0..1）。
//   坐标：y 向上，头 / 正面朝 +z；地面动物原点在脚底中心；飞行动物原点在身体中心；鸭子原点在水线。
//   单位：1 = 10 米。动物的 L（左）= +x，R（右）= -x（面朝 +z 时的左右）。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ============================================================
 * 随机数 / 噪声 / 小数学
 * ============================================================ */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash3(ix, iy, iz, s) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(iz, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, z, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => hash3(ix + a, iy + b, iz + c, s);
  const x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * ux;
  const x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * ux;
  const x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * ux;
  const x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * ux;
  const y0 = x00 + (x10 - x00) * uy, y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}
function fbm(x, y, z, s = 0, oct = 3) {
  let a = 0.5, f = 1, t = 0, n = 0;
  for (let i = 0; i < oct; i++) { t += a * vnoise(x * f, y * f, z * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return t / n;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
function sstep(a, b, x) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
const TAU = Math.PI * 2;
const hex = (h) => new THREE.Color(h);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const mixC = (a, b, t) => a.clone().lerp(b, clamp(t));

/* ============================================================
 * 几何工具
 * ============================================================ */
/** 参数网格；wrap=true 时 i 方向首尾相接 */
function grid(cols, rows, fn, wrap = true) {
  const pos = new Float32Array(cols * rows * 3), v = [0, 0, 0];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { fn(i, j, v); pos.set(v, (j * cols + i) * 3); }
  const idx = [], qi = wrap ? cols : cols - 1;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < qi; i++) {
      const i1 = (i + 1) % cols;
      const a = j * cols + i, b = j * cols + i1, c = (j + 1) * cols + i, d = (j + 1) * cols + i1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
function dropDegenerate(g) {
  const ix = g.index.array, out = [];
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i], b = ix[i + 1], c = ix[i + 2];
    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }
  g.setIndex(out);
  return g;
}
/** 焊接 + 平滑法线 */
function smooth(g) {
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.clearGroups();
  g = mergeVertices(g, 1e-6);
  dropDegenerate(g);
  g.computeVertexNormals();
  return g;
}
/** 封闭网格若法线朝内则翻转 */
function orientOutward(g) {
  const P = g.attributes.position, ix = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let vol = 0;
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(P, ix[i]); b.fromBufferAttribute(P, ix[i + 1]); c.fromBufferAttribute(P, ix[i + 2]);
    vol += a.dot(b.cross(c));
  }
  if (vol < 0) { for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.index.needsUpdate = true; }
  return g;
}
function solidify(g) { g = smooth(g); orientOutward(g); g.computeVertexNormals(); return g; }
function displace(g, fn) {
  const P = g.attributes.position, N = g.attributes.normal, p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
    const d = fn(p, n, i);
    if (typeof d === 'number') p.addScaledVector(n, d);
    P.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}
function paint(g, fn) {
  const P = g.attributes.position, N = g.attributes.normal;
  let C = g.attributes.color; const had = !!C;
  if (!had) { C = new THREE.BufferAttribute(new Float32Array(P.count * 3), 3); g.setAttribute('color', C); }
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
    if (had) c.fromBufferAttribute(C, i); else c.setRGB(1, 1, 1);
    fn(p, n, c, i);
    C.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}
const solid = (g, col) => paint(g, (p, n, c) => c.copy(col));
/** 烘焙 AO：颜色乘以 fn(p, n, i) */
function shade(g, fn) {
  const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
    const k = fn(p, n, i);
    C.setXYZ(i, C.getX(i) * k, C.getY(i) * k, C.getZ(i) * k);
  }
  return g;
}
const skyAO = (n, k = 0.18) => 1 - k * (1 - sstep(-0.7, 0.5, n.y));
const groundAO = (y, h = 0.01, k = 0.25) => 1 - k * (1 - sstep(0, h, y));
function ballAO(p, n, balls, k = 0.8) {
  let ao = 1;
  for (let b = 0; b < balls.length; b++) {
    const B = balls[b];
    const dx = B[0] - p.x, dy = B[1] - p.y, dz = B[2] - p.z;
    const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2);
    if (d < 1e-9) continue;
    const cosT = (n.x * dx + n.y * dy + n.z * dz) / d;
    if (cosT <= 0) continue;
    ao *= 1 - k * Math.min(1, cosT * (B[3] * B[3]) / d2);
  }
  return ao;
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _t = new THREE.Vector3(), _s = new THREE.Vector3();
function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_t.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}
/** 给每个顶点写一个自定义标量属性 */
function setAttr(g, name, fn) {
  const P = g.attributes.position, arr = new Float32Array(P.count), p = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i); arr[i] = fn(p, i); }
  g.setAttribute(name, new THREE.BufferAttribute(arr, 1));
  return g;
}
const crom = (a, b, c, d, f) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);

/** 椭球：rad=[rx,ry,rz]，at=[x,y,z]，rot=[rx,ry,rz]（YXZ）。平滑法线，输出带位置 / 法线（未上色）。 */
function blob(rad, at = [0, 0, 0], rot = [0, 0, 0], w = 10, h = 7) {
  let g = grid(w, h + 1, (i, j, v) => {
    const a = (i / w) * TAU, ph = (Math.PI * j) / h, s = Math.sin(ph);
    v[0] = Math.sin(a) * s; v[1] = -Math.cos(ph); v[2] = Math.cos(a) * s;
  });
  g = solidify(g);
  return place(g, at[0], at[1], at[2], rot[0], rot[1], rot[2], rad[0], rad[1], rad[2]);
}
/** 二十面体细分 1 的“毛团”球（80 面） */
function icoBall(r, at, sq = [1, 1, 1], rot = [0, 0, 0]) {
  const g = solidify(new THREE.IcosahedronGeometry(1, 1));
  return place(g, at[0], at[1], at[2], rot[0], rot[1], rot[2], r * sq[0], r * sq[1], r * sq[2]);
}
/** 贴在表面上的小斑点（扁球，沿 nrm 朝外） */
const _Y = new THREE.Vector3(0, 1, 0);
function decal(p, nrm, r, col, thick = 0.4, w = 6, h = 3) {
  const g = blob([r, r * thick, r], [0, 0, 0], [0, 0, 0], w, h);
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, nrm.clone().normalize());
  const pos = p.clone().addScaledVector(nrm, -r * thick * 0.35);
  g.applyMatrix4(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
  return solid(g, col);
}

/**
 * 放样管：沿 Catmull-Rom 脊线、截面为椭圆、半径逐点变化，两端封口（圆头）。
 *   pts：[[x,y,z],...]；radii：[r | [rSide, rUp], ...] 或 函数 t=>[rx,ry]
 *   o.segs 截面分段；o.sub 每段脊线细分；o.capN 圆头层数（0=尖头）；o.capS / o.capE 两端圆头长度倍率（0=平头）
 *   o.ref 截面“上”方向参考；o.mod(t) 半径倍率；o.wind(t) 写入 wind 属性
 *   附带属性 tt（沿管 0..1，上色时用，成品里会被丢掉）；userData.surf(u,a) 取表面点。
 */
function tube(pts, radii, o = {}) {
  const segs = o.segs ?? 8, sub = o.sub ?? 3, capN = o.capN ?? 2, capS = o.capS ?? 1, capE = o.capE ?? 1;
  const n = pts.length, N = (n - 1) * sub + 1;
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.5);
  let radFn;
  if (typeof radii === 'function') radFn = radii;
  else {
    const rad = radii.map((r) => (Array.isArray(r) ? r : [r, r]));
    radFn = (t) => {
      const u = t * (n - 1), i = Math.min(n - 2, Math.floor(u)), f = u - i;
      const a = rad[Math.max(0, i - 1)], b = rad[i], c = rad[i + 1], d = rad[Math.min(n - 1, i + 2)];
      return [0, 1].map((k) => Math.max(0.00004, crom(a[k], b[k], c[k], d[k], f)));
    };
  }
  const ref = V3(...(o.ref ?? [0, 1, 0]));
  const main = [];
  let U = null, Tp = null;
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1);
    const c = curve.getPoint(t), T = curve.getTangent(t).normalize();
    if (!U) {
      U = ref.clone().addScaledVector(T, -ref.dot(T));
      if (U.lengthSq() < 1e-6) U.set(1, 0, 0).addScaledVector(T, -T.x);
      U.normalize();
    } else {
      const q = new THREE.Quaternion().setFromUnitVectors(Tp, T);
      U.applyQuaternion(q); U.addScaledVector(T, -U.dot(T)).normalize();
    }
    Tp = T;
    const S = new THREE.Vector3().crossVectors(T, U).normalize();
    let [rx, ry] = radFn(t);
    const m = o.mod ? o.mod(t) : 1;
    main.push({ c, T, S, U: U.clone(), rx: rx * m, ry: ry * m, t });
  }
  const rings = [];
  const capRing = (r, a, len, sgn) => {
    const sc = Math.sin(a), off = Math.cos(a) * len * Math.max(r.rx, r.ry) * sgn;
    return { c: r.c.clone().addScaledVector(r.T, off), S: r.S, U: r.U, rx: r.rx * sc, ry: r.ry * sc, t: sgn < 0 ? 0 : 1 };
  };
  const first = main[0], last = main[N - 1];
  if (capS === 0) rings.push({ ...first, rx: 0, ry: 0, t: 0 });
  else for (let j = 0; j <= capN; j++) rings.push(capRing(first, (j / (capN + 1)) * (Math.PI / 2), capS, -1));
  for (const r of main) rings.push(r);
  if (capE === 0) rings.push({ ...last, rx: 0, ry: 0, t: 1 });
  else for (let j = capN; j >= 0; j--) rings.push(capRing(last, (j / (capN + 1)) * (Math.PI / 2), capE, 1));
  let g = grid(segs, rings.length, (i, j, v) => {
    const r = rings[j], a = (i / segs) * TAU, ca = Math.cos(a) * r.rx, sa = Math.sin(a) * r.ry;
    v[0] = r.c.x + r.S.x * ca + r.U.x * sa; v[1] = r.c.y + r.S.y * ca + r.U.y * sa; v[2] = r.c.z + r.S.z * ca + r.U.z * sa;
  });
  const tt = new Float32Array(segs * rings.length);
  for (let j = 0; j < rings.length; j++) for (let i = 0; i < segs; i++) tt[j * segs + i] = rings[j].t;
  g.setAttribute('tt', new THREE.BufferAttribute(tt, 1));
  g = solidify(g);
  if (o.wind) { const T = g.attributes.tt, w = new Float32Array(T.count); for (let i = 0; i < T.count; i++) w[i] = o.wind(T.getX(i)); g.setAttribute('wind', new THREE.BufferAttribute(w, 1)); }
  const nm = main.length;
  g.userData.surf = (u, a) => {
    const f = clamp(u) * (nm - 1), i = Math.min(nm - 2, Math.floor(f)), k = f - i, A = main[i], B = main[i + 1];
    const c = A.c.clone().lerp(B.c, k), S = A.S.clone().lerp(B.S, k).normalize(), Uu = A.U.clone().lerp(B.U, k).normalize();
    const rx = lerp(A.rx, B.rx, k), ry = lerp(A.ry, B.ry, k), ca = Math.cos(a), sa = Math.sin(a);
    const p = c.clone().addScaledVector(S, rx * ca).addScaledVector(Uu, ry * sa);
    const nr = S.clone().multiplyScalar(ca / rx).addScaledVector(Uu, sa / ry).normalize();
    return { p, n: nr };
  };
  return g;
}
const ttOf = (g, i) => g.attributes.tt.getX(i);

/* ============================================================
 * 双面薄片“汤”：叶片 / 翅膀 / 花瓣用。每个三角形输出正反两面（反面法线取反）。
 * ============================================================ */
class Soup {
  constructor(attrs = []) { this.pos = []; this.nrm = []; this.col = []; this.attrs = {}; for (const a of attrs) this.attrs[a] = []; this.names = attrs; }
  /** a/b/c = {p:[x,y,z], c:Color, w:{wind:..}}；o.ref 正面朝向参考，o.soft 法线向 ref 偏移，o.backMul / o.backCol 反面颜色 */
  tri(a, b, c, o = {}) {
    const ref = o.ref ?? [0, 1, 0], soft = o.soft ?? 0.25;
    const ux = b.p[0] - a.p[0], uy = b.p[1] - a.p[1], uz = b.p[2] - a.p[2];
    const vx = c.p[0] - a.p[0], vy = c.p[1] - a.p[1], vz = c.p[2] - a.p[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-14) return;
    nx /= len; ny /= len; nz /= len;
    if (o.single) { /* 单面：保持原始绕向 */ } else if (nx * ref[0] + ny * ref[1] + nz * ref[2] < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    let fx = nx + soft * ref[0], fy = ny + soft * ref[1], fz = nz + soft * ref[2];
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    const emit = (v, col, sx) => {
      this.pos.push(v.p[0], v.p[1], v.p[2]); this.nrm.push(fx * sx, fy * sx, fz * sx); this.col.push(col.r, col.g, col.b);
      for (const k of this.names) this.attrs[k].push(v.w ? (v.w[k] ?? 0) : 0);
    };
    emit(a, a.c, 1); emit(b, b.c, 1); emit(c, c.c, 1);
    if (o.single) return;
    const bm = o.backMul ?? 0.8, bc = o.backCol;
    const bcol = (v) => (bc ? bc : new THREE.Color(v.c.r * bm, v.c.g * bm, v.c.b * bm));
    emit(a, bcol(a), -1); emit(c, bcol(c), -1); emit(b, bcol(b), -1);
  }
  quad(a, b, c, d, o) { this.tri(a, b, c, o); this.tri(a, c, d, o); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    for (const k of this.names) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(this.attrs[k]), 1));
    return g;
  }
}
const sv = (p, c, w) => ({ p: Array.isArray(p) ? p : [p.x, p.y, p.z], c, w });

/** 叶片：沿曲线的带状叶，宽度向尖端收窄；ref 为叶面朝向参考 */
function blade(soup, pts, W, w0, colBase, colTip, o = {}) {
  const segs = o.segs ?? 6, curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V3(...p))), false, 'catmullrom', 0.5);
  const wb = o.windBase ?? 0, wt = o.windTip ?? 1, twist = o.twist ?? 0, midRib = o.rib;
  const rows = [];
  for (let k = 0; k <= segs; k++) {
    const t = k / segs, c = curve.getPoint(t), T = curve.getTangent(t).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(T, twist * t);
    const Wk = W.clone().applyQuaternion(q); Wk.addScaledVector(T, -Wk.dot(T)).normalize();
    const w = w0 * Math.pow(1 - t, o.taper ?? 0.7) * (0.55 + 0.45 * sstep(0, 0.12, t));
    const col = mixC(colBase, colTip, t), wind = wb + (wt - wb) * t;
    const L = c.clone().addScaledVector(Wk, -w / 2), Rr = c.clone().addScaledVector(Wk, w / 2);
    const mid = c.clone();
    rows.push({ L, Rr, mid, col, wind, w, midCol: midRib ? mixC(col, midRib, 0.7) : col });
  }
  const to = { ref: o.ref ?? [0, 1, 0], soft: o.soft ?? 0.3, backMul: o.backMul ?? 0.85 };
  for (let k = 0; k < segs; k++) {
    const A = rows[k], B = rows[k + 1], wa = { wind: A.wind }, wbb = { wind: B.wind };
    if (midRib) {
      const ma = sv(A.mid, A.midCol, wa), mb = sv(B.mid, B.midCol, wbb);
      soup.quad(sv(A.L, A.col, wa), ma, mb, sv(B.L, B.col, wbb), to);
      soup.quad(ma, sv(A.Rr, A.col, wa), sv(B.Rr, B.col, wbb), mb, to);
    } else soup.quad(sv(A.L, A.col, wa), sv(A.Rr, A.col, wa), sv(B.Rr, B.col, wbb), sv(B.L, B.col, wbb), to);
  }
}

/* ============================================================
 * 合并
 * ============================================================ */
function finish(g, attrs = []) {
  if (g.index) g = g.toNonIndexed();
  const keep = ['position', 'normal', 'color', ...attrs];
  for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
  g.clearGroups();
  if (!g.attributes.color) throw new Error('part without color');
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const a of attrs) if (!g.attributes[a]) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return g;
}
function assemble(list, attrs = [], floor = null) {
  const g = mergeGeometries(list.map((x) => finish(x, attrs)), false);
  if (floor !== null) { const P = g.attributes.position; for (let i = 0; i < P.count; i++) if (P.getY(i) < floor) P.setY(i, floor); }
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
const sideX = [1, -1];

/* ============================================================
 * 通用：四足动物的腿（放样管 + 蹄子），返回 [管, 蹄]
 * ============================================================ */
function hoof(x, y0, z, rad, col) {
  const h = blob([rad[0], rad[1], rad[2]], [x, y0 + rad[1] * 0.85, z], [0, 0, 0], 8, 5);
  return solid(h, col);
}

/* ============================================================
 * 梅花鹿
 * ============================================================ */
export function deer(seed = 1) {
  const R = mulberry32(seed * 7919 + 13);
  const C = {
    back: hex(0x9a5f34), flank: hex(0xb97d47), belly: hex(0xecdcba), rump: hex(0xf3e9d2),
    neck: hex(0x8e5a33), head: hex(0xa4703f), face: hex(0xbb8a57), chin: hex(0xeee1c6),
    leg: hex(0xa8703f), legLo: hex(0x5d3d27), hoof: hex(0x1b1511), nose: hex(0x1d1713),
    spot: hex(0xf7f0de), earIn: hex(0xeedcbc), antler: hex(0xd9c6a0), antlerDk: hex(0x7c5c3c), antlerTip: hex(0xf1e6cb),
  };
  /* ---- 躯干 ---- */
  const torso = tube(
    [[0, 0.079, -0.066], [0, 0.080, -0.050], [0, 0.0765, -0.022], [0, 0.078, 0.012], [0, 0.079, 0.042], [0, 0.080, 0.060]],
    [[0.010, 0.012], [0.0185, 0.0215], [0.0172, 0.0200], [0.0192, 0.0236], [0.0185, 0.0225], [0.0098, 0.0136]],
    { segs: 14, sub: 3, capN: 3 });
  paint(torso, (p, n, c) => {
    c.copy(C.flank).lerp(C.back, sstep(0.15, 0.9, n.y)).lerp(C.belly, sstep(-0.05, -0.8, n.y));
    c.multiplyScalar(1 - 0.12 * sstep(0.85, 0.99, n.y));
    c.lerp(C.rump, 0.92 * sstep(-0.052, -0.0625, p.z) * sstep(0.062, 0.074, p.y));
    c.multiplyScalar(0.96 + 0.08 * vnoise(p.x * 160, p.y * 160, p.z * 160, seed));
  });
  // 背上的白斑（两排）
  const spots = [];
  for (const sg of [0, 1]) {
    const rows = [{ n: 7, d: 0.42, u0: 0.20, u1: 0.80, r: 0.0019 }, { n: 6, d: 0.95, u0: 0.26, u1: 0.78, r: 0.0022 }];
    for (const row of rows) {
      for (let i = 0; i < row.n; i++) {
        const u = lerp(row.u0, row.u1, i / (row.n - 1)) + (R() - 0.5) * 0.025;
        const d = row.d + (R() - 0.5) * 0.12;
        const a = sg ? Math.PI / 2 + d : Math.PI / 2 - d;
        const s = torso.userData.surf(u, a);
        spots.push(decal(s.p, s.n, row.r * (0.85 + 0.3 * R()), C.spot, 0.45));
      }
    }
  }
  // 尾巴（白色短尾）
  const tail = solid(blob([0.0032, 0.0046, 0.0052], [0, 0.0805, -0.0715], [-0.5, 0, 0], 9, 6), C.rump);
  const bodyG = assemble([torso, ...spots, tail]);
  shade(bodyG, (p, n) => skyAO(n, 0.22) * groundAO(p.y - 0.05, 0.012, 0.0) * (1 - 0.12 * sstep(0.058, 0.052, p.y)));

  /* ---- 头与脖子 ---- */
  const neck = tube([[0, 0.086, 0.040], [0, 0.101, 0.060], [0, 0.119, 0.076], [0, 0.133, 0.083]],
    [[0.0150, 0.0175], [0.0115, 0.0135], [0.0092, 0.0102], [0.0084, 0.0092]], { segs: 10, sub: 3, capS: 0.6, capE: 0.3, capN: 2 });
  paint(neck, (p, n, c) => {
    c.copy(C.neck).lerp(C.flank, sstep(0.5, 0.9, 1 - ttOf(neck, 0) * 0 - 0.0)).lerp(C.back, 0.3 * sstep(0.2, 0.9, n.y));
    c.lerp(C.chin, 0.8 * sstep(-0.1, -0.8, n.y) * sstep(0.35, 0.8, p.y > 0 ? (p.y - 0.086) / 0.05 : 0));
    c.lerp(C.belly, 0.5 * sstep(-0.1, -0.8, n.y));
  });
  const head = tube([[0, 0.1385, 0.079], [0, 0.1355, 0.090], [0, 0.1300, 0.1010], [0, 0.1272, 0.1075]],
    [[0.0088, 0.0098], [0.0084, 0.0090], [0.0058, 0.0060], [0.0048, 0.0046]], { segs: 12, sub: 3, capS: 0.5, capE: 0.7, capN: 2 });
  paint(head, (p, n, c, i) => {
    const t = ttOf(head, i);
    c.copy(C.head).lerp(C.face, sstep(0.25, 0.7, t));
    c.lerp(C.chin, 0.95 * sstep(-0.15, -0.75, n.y));
    c.lerp(C.nose, sstep(0.82, 0.96, t));
    c.multiplyScalar(1 - 0.18 * sstep(0.55, 0.9, n.y) * (1 - sstep(0.5, 0.8, t)) * 0);
  });
  const nose = solid(blob([0.0040, 0.0034, 0.0030], [0, 0.1274, 0.1088], [0, 0, 0], 8, 5), C.nose);
  const eyes = sideX.map((s) => solid(blob([0.0016, 0.0017, 0.0016], [s * 0.0078, 0.1402, 0.0925], [0, 0, 0], 6, 4), hex(0x0c0907)));
  const earGeo = sideX.map((s) => {
    const g = blob([0.0014, 0.0074, 0.0042], [s * 0.0138, 0.1499, 0.0792], [-0.2, 0, -s * 0.75], 9, 7);
    return paint(g, (p, n, c) => {
      c.copy(C.head).lerp(C.earIn, 0.92 * sstep(0.05, 0.6, -s * n.x));
      c.lerp(hex(0x3a2a1e), 0.55 * sstep(0.1530, 0.1555, p.y));
    });
  });
  // 鹿角（雄鹿，分叉）
  const antlers = [];
  for (const s of sideX) {
    const mk = (pp, rr) => {
      const g = tube(pp.map((q) => [q[0] * s, q[1], q[2]]), rr, { segs: 5, sub: 2, capN: 1, capS: 0.6, capE: 1.2 });
      return paint(g, (p, n, c, i) => { const t = ttOf(g, i); c.copy(C.antlerDk).lerp(C.antler, sstep(0.0, 0.3, t)).lerp(C.antlerTip, sstep(0.7, 1, t)); });
    };
    antlers.push(mk([[0.0045, 0.1465, 0.0818], [0.0066, 0.1545, 0.0782], [0.0092, 0.1625, 0.0795], [0.0092, 0.1700, 0.0850]], [0.0017, 0.0014, 0.0012, 0.0006]));
    antlers.push(mk([[0.0062, 0.1530, 0.0790], [0.0070, 0.1575, 0.0860], [0.0072, 0.1620, 0.0925]], [0.0011, 0.0009, 0.0005]));
    antlers.push(mk([[0.0090, 0.1610, 0.0790], [0.0100, 0.1660, 0.0765], [0.0108, 0.1715, 0.0755]], [0.0010, 0.0008, 0.0005]));
  }
  const headG = assemble([neck, head, nose, ...eyes, ...earGeo, ...antlers]);
  shade(headG, (p, n) => skyAO(n, 0.2) * (p.y < 0.1 ? 0.88 + 0.12 * sstep(0.06, 0.1, p.y) : 1));

  /* ---- 腿 ---- */
  const legs = {};
  const mkLeg = (side, front) => {
    const x = side * (front ? 0.0118 : 0.0126);
    let pts, rad, hz;
    if (front) {
      pts = [[x, 0.073, 0.040], [x, 0.060, 0.0412], [x, 0.044, 0.0405], [x, 0.030, 0.0400], [x, 0.014, 0.0405], [x, 0.0068, 0.0414]];
      rad = [[0.0080, 0.0095], [0.0063, 0.0072], [0.0042, 0.0050], [0.0030, 0.0036], [0.0028, 0.0032], [0.0033, 0.0036]];
      hz = 0.0424;
    } else {
      pts = [[x, 0.074, -0.047], [x, 0.060, -0.044], [x, 0.047, -0.040], [x, 0.036, -0.0455], [x, 0.0285, -0.0525], [x, 0.016, -0.0490], [x, 0.0068, -0.0458]];
      rad = [[0.0100, 0.0135], [0.0086, 0.0115], [0.0060, 0.0076], [0.0043, 0.0052], [0.0040, 0.0050], [0.0030, 0.0036], [0.0032, 0.0036]];
      hz = -0.0446;
    }
    const t = tube(pts, rad, { segs: 7, sub: 2, capN: 1, capS: 0.8, capE: 0.3, ref: [0, 0, 1] });
    paint(t, (p, n, c) => {
      c.copy(C.leg).lerp(C.legLo, sstep(0.055, 0.020, p.y));
      c.lerp(C.belly, 0.7 * sstep(0.06, 0.04, p.y) * 0 + (front ? 0 : 0.25 * sstep(0.04, 0.06, p.y) * sstep(0.1, -0.7, side * n.x)));
      c.multiplyScalar(1 - 0.3 * sstep(0.034, 0.062, p.y) * sstep(0.1, -0.8, side * n.x * 1));
    });
    const hf = hoof(x, 0, hz, [0.0036, 0.0046, 0.0046], C.hoof);
    const g = assemble([t, hf], [], 0);
    shade(g, (p, n) => groundAO(p.y, 0.008, 0.3) * (1 - 0.22 * sstep(0.04, 0.066, p.y)));
    return { geometry: g, pivot: front ? [x, 0.073, 0.040] : [x, 0.074, -0.047] };
  };
  legs.legFL = mkLeg(1, true); legs.legFR = mkLeg(-1, true); legs.legBL = mkLeg(1, false); legs.legBR = mkLeg(-1, false);

  const parts = {
    body: { geometry: bodyG },
    head: { geometry: headG, pivot: [0, 0.088, 0.044] },
    ...legs,
  };
  const geometry = assemble(Object.values(parts).map((p) => p.geometry), [], null);
  return { geometry, parts };
}

/* ============================================================
 * 野兔
 * ============================================================ */
export function rabbit(seed = 1) {
  const R = mulberry32(seed * 3571 + 7);
  const back = hex(0x8a6b4d), side = hex(0xa88b69), belly = hex(0xeae1cd), nape = hex(0xa87a4d), white = hex(0xf6f2ea);
  const fur = (g, b = back, s = side, w = belly) => paint(g, (p, n, c) => {
    c.copy(s).lerp(b, sstep(0.1, 0.85, n.y)).lerp(w, sstep(-0.1, -0.8, n.y));
    c.multiplyScalar(0.94 + 0.12 * vnoise(p.x * 220, p.y * 220, p.z * 220, seed));
  });
  const list = [];
  list.push(fur(blob([0.0122, 0.0136, 0.0172], [0, 0.0148, -0.0030], [-0.45, 0, 0], 12, 9)));
  for (const s of sideX) {
    list.push(fur(blob([0.0056, 0.0086, 0.0112], [s * 0.0106, 0.0088, -0.0088], [-0.15, 0, 0], 10, 7)));       // 大腿
    list.push(fur(blob([0.0029, 0.0017, 0.0096], [s * 0.0092, 0.0017, 0.0030], [0, s * 0.05, 0], 8, 5), side, side, belly)); // 后脚
    list.push(fur(blob([0.0027, 0.0080, 0.0031], [s * 0.0043, 0.0088, 0.0112], [-0.12, 0, 0], 8, 6)));         // 前腿
    list.push(fur(blob([0.0027, 0.0014, 0.0045], [s * 0.0043, 0.0014, 0.0136], [0, 0, 0], 8, 4), belly, belly, belly)); // 前爪
  }
  list.push(solid(blob([0.0062, 0.0062, 0.0058], [0, 0.0100, -0.0190], [0, 0, 0], 10, 7), white));              // 绒球尾
  // 头
  const headBase = fur(blob([0.0086, 0.0082, 0.0108], [0, 0.0264, 0.0122], [0.12, 0, 0], 12, 9), nape, side, belly);
  list.push(headBase);
  list.push(fur(blob([0.0048, 0.0043, 0.0058], [0, 0.0240, 0.0205], [0.1, 0, 0], 10, 7), side, belly, belly));   // 嘴部
  for (const s of sideX) list.push(solid(blob([0.0045, 0.0038, 0.0050], [s * 0.0050, 0.0232, 0.0168], [0, 0, 0], 8, 6), belly)); // 脸颊
  list.push(solid(blob([0.0016, 0.0012, 0.0014], [0, 0.0254, 0.0254], [0, 0, 0], 7, 5), hex(0xd8878a)));         // 鼻
  for (const s of sideX) list.push(solid(blob([0.0014, 0.0017, 0.0015], [s * 0.0070, 0.0296, 0.0150], [0, 0, 0], 7, 5), hex(0x0d0a08))); // 眼
  for (const s of sideX) {
    const ear = blob([0.0017, 0.0060, 0.0038], [s * 0.0060, 0.0390, 0.0072], [-0.22, 0, -s * 0.2], 9, 7);
    paint(ear, (p, n, c) => {
      c.copy(back).lerp(hex(0xd9a99d), 0.85 * sstep(0.1, 0.6, n.z));
      c.lerp(hex(0x3a2d24), 0.9 * sstep(0.039, 0.0445, p.y));
      c.lerp(hex(0xd9a99d), 0.0);
    });
    list.push(ear);
  }
  const geometry = assemble(list, [], 0);
  shade(geometry, (p, n) => skyAO(n, 0.2) * groundAO(p.y, 0.008, 0.3) * (0.9 + 0.1 * sstep(0.004, 0.02, p.y)));
  geometry.computeBoundingBox();
  return { geometry };
}

/* ============================================================
 * 绵羊
 * ============================================================ */
export function sheep(seed = 1) {
  const R = mulberry32(seed * 6151 + 3);
  const wool = hex(0xf3ead6), woolDk = hex(0xcdbf9f), black = hex(0x2a2422), blackLt = hex(0x4a3e3a), hoofC = hex(0x15110f);
  const BC = [0, 0.0555, -0.003], BR = [0.0245, 0.0245, 0.0400];
  const list = [];
  // 内核（填缝）
  list.push(solid(blob([BR[0] * 0.95, BR[1] * 0.95, BR[2] * 0.95], BC, [0, 0, 0], 10, 6), woolDk));
  // 羊毛团块：斐波那契分布在椭球壳上
  const N = 24, ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const yy = 1 - (2 * (i + 0.5)) / N, rr = Math.sqrt(1 - yy * yy), ph = i * ga + R() * 0.3;
    const d = [Math.cos(ph) * rr, yy, Math.sin(ph) * rr];
    const k = 0.94 + R() * 0.1;
    const at = [BC[0] + d[0] * BR[0] * k * 1.05, BC[1] + d[1] * BR[1] * k * 1.05, BC[2] + d[2] * BR[2] * k * 1.05];
    const r = (0.0124 + 0.0044 * R()) * (1 + 0.15 * Math.max(0, yy));
    const g = icoBall(r, at, [1 + (R() - 0.5) * 0.2, 0.92 + R() * 0.15, 1 + (R() - 0.5) * 0.2], [R() * 3, R() * 3, R() * 3]);
    const tint = 0.95 + 0.07 * R();
    displace(g, (p) => (fbm(p.x * 260 + seed, p.y * 260, p.z * 260, seed, 2) - 0.5) * 0.0026);
    paint(g, (p, n, c) => {
      c.copy(wool).lerp(woolDk, sstep(0.3, -0.8, n.y) * 0.65 + sstep(0.2, 0.5, 0.3 - p.y + BC[1]) * 0);
      c.multiplyScalar(tint);
    });
    list.push(g);
  }
  list.push(solid(icoBall(0.0078, [0, 0.0515, -0.0452], [1, 1, 1]), wool));
  const bodyG = assemble(list);
  shade(bodyG, (p, n) => {
    const rho = Math.hypot((p.x - BC[0]) / BR[0], (p.y - BC[1]) / BR[1], (p.z - BC[2]) / BR[2]);
    const cav = lerp(0.58, 1, sstep(0.72, 1.14, rho));
    return cav * lerp(0.74, 1, sstep(0.028, 0.062, p.y)) * (0.9 + 0.1 * sstep(-0.9, 0.3, n.y));
  });

  /* ---- 头 ---- */
  const head = tube([[0, 0.0655, 0.0485], [0, 0.0600, 0.0575], [0, 0.0545, 0.0650], [0, 0.0510, 0.0690]],
    [[0.0108, 0.0118], [0.0088, 0.0100], [0.0066, 0.0072], [0.0056, 0.0056]], { segs: 10, sub: 2, capS: 0.6, capE: 0.7, capN: 2 });
  paint(head, (p, n, c, i) => {
    const t = ttOf(head, i);
    c.copy(black).lerp(blackLt, sstep(0.55, 1, t) * 0.7).lerp(hex(0x5a4642), sstep(0.88, 1, t) * 0.7);
    c.lerp(hex(0x3a302d), sstep(0.0, -0.8, n.y) * 0.5);
  });
  const neck = tube([[0, 0.0600, 0.0300], [0, 0.0630, 0.0420], [0, 0.0640, 0.0490]], [[0.0150, 0.0160], [0.0130, 0.0140], [0.0112, 0.0120]], { segs: 10, sub: 2, capS: 0.5, capE: 0.2, capN: 1 });
  paint(neck, (p, n, c) => c.copy(mixC(woolDk, wool, 0.5)));
  const knot = paint(icoBall(0.0074, [0, 0.0735, 0.0462], [1.1, 0.9, 1]), (p, n, c) => c.copy(wool).lerp(woolDk, sstep(0.2, -0.6, n.y) * 0.6));
  displace(knot, (p) => (fbm(p.x * 260, p.y * 260, p.z * 260, seed + 4, 2) - 0.5) * 0.002);
  const eyes = sideX.map((s) => solid(blob([0.0014, 0.0013, 0.0013], [s * 0.0083, 0.0640, 0.0562], [0, 0, 0], 6, 4), hex(0xd2b45a)));
  const ears = sideX.map((s) => paint(blob([0.0072, 0.0016, 0.0038], [s * 0.0158, 0.0628, 0.0455], [0, 0, -s * 0.5], 9, 6), (p, n, c) => {
    c.copy(black).lerp(hex(0x6a4a46), 0.7 * sstep(0.0, 0.8, -n.y * 0 + (n.y > 0 ? 0 : -n.y)));
  }));
  const nose = solid(blob([0.0036, 0.0028, 0.0024], [0, 0.0508, 0.0700], [0.2, 0, 0], 8, 5), hex(0x6b4f4b));
  const headG = assemble([head, neck, knot, ...eyes, ...ears, nose]);
  shade(headG, (p, n) => skyAO(n, 0.22) * (p.z < 0.045 ? lerp(0.72, 1, sstep(0.025, 0.046, p.z)) : 1));

  /* ---- 腿 ---- */
  const mkLeg = (side, front) => {
    const x = side * 0.0108, z = front ? 0.0250 : -0.0310;
    const pts = front
      ? [[x, 0.046, z], [x, 0.030, z + 0.0004], [x, 0.0155, z], [x, 0.0058, z + 0.0004]]
      : [[x, 0.046, z], [x, 0.031, z - 0.0030], [x, 0.0170, z - 0.0010], [x, 0.0058, z + 0.0006]];
    const t = tube(pts, [[0.0066, 0.0072], [0.0050, 0.0054], [0.0037, 0.0041], [0.0037, 0.0038]], { segs: 7, sub: 2, capN: 1, capS: 0.8, capE: 0.3, ref: [0, 0, 1] });
    paint(t, (p, n, c) => c.copy(black).lerp(blackLt, sstep(0.034, 0.016, p.y) * 0.5));
    const h = hoof(x, 0, pts[3][2] + 0.0010, [0.0036, 0.0044, 0.0045], hoofC);
    const g = assemble([t, h], [], 0);
    shade(g, (p) => groundAO(p.y, 0.008, 0.3) * lerp(0.7, 1, sstep(0.03, 0.05, 0.08 - p.y)));
    return { geometry: g, pivot: [x, 0.044, z] };
  };
  const parts = {
    body: { geometry: bodyG },
    head: { geometry: headG, pivot: [0, 0.062, 0.034] },
    legFL: mkLeg(1, true), legFR: mkLeg(-1, true), legBL: mkLeg(1, false), legBR: mkLeg(-1, false),
  };
  const geometry = assemble(Object.values(parts).map((p) => p.geometry), [], null);
  return { geometry, parts };
}

/* ============================================================
 * 高山山羊
 * ============================================================ */
export function goat(seed = 1) {
  const R = mulberry32(seed * 4421 + 9);
  const C = {
    white: hex(0xf0eadc), cream: hex(0xe2d8c4), gray: hex(0xa79d90), grayDk: hex(0x6e655b), stripe: hex(0x5d544b),
    nose: hex(0x4a423d), hoof: hex(0x2a2522), horn: hex(0xc9b690), hornDk: hex(0x7a6648), beard: hex(0xf4efe3), earIn: hex(0xd9b5a6),
  };
  const torso = tube(
    [[0, 0.052, -0.044], [0, 0.0525, -0.030], [0, 0.0500, -0.006], [0, 0.0510, 0.016], [0, 0.0522, 0.034], [0, 0.0528, 0.046]],
    [[0.0100, 0.0125], [0.0165, 0.0190], [0.0165, 0.0185], [0.0175, 0.0205], [0.0150, 0.0185], [0.0085, 0.0112]],
    { segs: 14, sub: 3, capN: 3 });
  paint(torso, (p, n, c) => {
    c.copy(C.white).lerp(C.cream, sstep(0.3, 0.9, n.y) * 0.6).lerp(C.white, sstep(-0.1, -0.7, n.y) * 0.9);
    // 肩部和背脊偏灰
    c.lerp(C.gray, 0.8 * sstep(0.5, 0.95, n.y) * (0.6 + 0.4 * sstep(-0.02, 0.04, p.z)));
    c.lerp(C.grayDk, 0.45 * sstep(0.01, 0.045, p.z) * sstep(-0.2, 0.6, n.y));
    c.multiplyScalar(0.96 + 0.08 * fbm(p.x * 200, p.y * 200, p.z * 200, seed, 2));
  });
  const tail = paint(blob([0.0028, 0.0050, 0.0034], [0, 0.0570, -0.0462], [0.4, 0, 0], 8, 6), (p, n, c) => c.copy(C.gray));
  const bodyG = assemble([torso, tail]);
  shade(bodyG, (p, n) => skyAO(n, 0.22) * (1 - 0.1 * sstep(0.036, 0.03, p.y)));

  const neck = tube([[0, 0.055, 0.030], [0, 0.0660, 0.047], [0, 0.0725, 0.0585]], [[0.0112, 0.0132], [0.0090, 0.0105], [0.0072, 0.0084]], { segs: 10, sub: 3, capS: 0.5, capE: 0.2, capN: 2 });
  paint(neck, (p, n, c) => c.copy(C.white).lerp(C.gray, 0.55 * sstep(0.3, 0.9, n.y)));
  const head = tube([[0, 0.0725, 0.0572], [0, 0.0715, 0.0655], [0, 0.0678, 0.0738], [0, 0.0652, 0.0788]],
    [[0.0076, 0.0086], [0.0070, 0.0078], [0.0053, 0.0056], [0.0046, 0.0044]], { segs: 12, sub: 3, capS: 0.5, capE: 0.7, capN: 2 });
  paint(head, (p, n, c, i) => {
    const t = ttOf(head, i);
    c.copy(C.white).lerp(C.gray, 0.5 * sstep(0.0, 0.6, n.y) * (1 - 0.4 * sstep(0.6, 1, t)));
    c.lerp(C.stripe, 0.45 * sstep(0.2, 0.8, n.y) * sstep(0.0, 0.5, t) * (1 - sstep(0.7, 0.9, t)));
    c.lerp(C.nose, sstep(0.78, 0.95, t));
  });
  const nose = solid(blob([0.0036, 0.0030, 0.0030], [0, 0.0652, 0.0795], [0, 0, 0], 8, 5), C.nose);
  const eyes = sideX.map((s) => solid(blob([0.0014, 0.0014, 0.0014], [s * 0.0064, 0.0738, 0.0648], [0, 0, 0], 6, 4), hex(0x14100d)));
  const ears = sideX.map((s) => paint(blob([0.0050, 0.0014, 0.0026], [s * 0.0100, 0.0752, 0.0560], [0.0, 0, -s * 0.35], 8, 5), (p, n, c) => c.copy(C.white).lerp(C.earIn, 0.6 * sstep(0, 0.6, -n.y))));
  const beard = tube([[0, 0.0632, 0.0742], [0, 0.0592, 0.0752], [0, 0.0545, 0.0748]], [[0.0020, 0.0016], [0.0020, 0.0014], [0.0009, 0.0006]], { segs: 6, sub: 2, capN: 1, capS: 0.6, capE: 1.5 });
  solid(beard, C.beard);
  const horns = sideX.map((s) => {
    const g = tube([[s * 0.0042, 0.0790, 0.0580], [s * 0.0054, 0.0872, 0.0548], [s * 0.0066, 0.0942, 0.0450], [s * 0.0074, 0.0980, 0.0320], [s * 0.0076, 0.0975, 0.0225]],
      [0.0031, 0.0027, 0.0021, 0.0014, 0.0005], { segs: 7, sub: 3, capN: 1, capS: 0.5, capE: 1.4 });
    return paint(g, (p, n, c, i) => {
      const t = ttOf(g, i);
      const ring = 0.5 + 0.5 * Math.sin(t * 62);
      c.copy(C.horn).lerp(C.hornDk, 0.35 * ring * sstep(0.08, 0.2, t)).lerp(C.hornDk, sstep(0.15, 0.0, t) * 0.7);
      c.lerp(hex(0xe9dcbc), sstep(0.88, 1, t) * 0.8);
    });
  });
  const headG = assemble([neck, head, nose, ...eyes, ...ears, beard, ...horns]);
  shade(headG, (p, n) => skyAO(n, 0.2) * (p.y < 0.07 ? 0.9 : 1));

  const mkLeg = (side, front) => {
    const x = side * (front ? 0.0108 : 0.0114);
    let pts, rad, hz;
    if (front) {
      pts = [[x, 0.056, 0.030], [x, 0.041, 0.0306], [x, 0.027, 0.0300], [x, 0.014, 0.0302], [x, 0.0070, 0.0308]];
      rad = [[0.0084, 0.0096], [0.0060, 0.0068], [0.0049, 0.0056], [0.0042, 0.0046], [0.0045, 0.0048]]; hz = 0.0316;
    } else {
      pts = [[x, 0.056, -0.030], [x, 0.043, -0.0288], [x, 0.031, -0.0332], [x, 0.017, -0.0312], [x, 0.0070, -0.0302]];
      rad = [[0.0100, 0.0140], [0.0070, 0.0090], [0.0049, 0.0058], [0.0042, 0.0048], [0.0045, 0.0048]]; hz = -0.0292;
    }
    const t = tube(pts, rad, { segs: 8, sub: 3, capN: 1, capS: 0.8, capE: 0.3, ref: [0, 0, 1] });
    paint(t, (p, n, c) => {
      c.copy(C.white).lerp(C.gray, sstep(0.042, 0.026, p.y) * 0.75).lerp(C.grayDk, sstep(0.028, 0.012, p.y) * 0.55);
      c.lerp(C.stripe, 0.4 * sstep(0.03, 0.01, p.y) * sstep(0.2, 0.9, front ? n.z : -n.z));
    });
    const h = hoof(x, 0, hz, [0.0042, 0.0045, 0.0050], C.hoof);
    const g = assemble([t, h], [], 0);
    shade(g, (p) => groundAO(p.y, 0.008, 0.3) * (1 - 0.2 * sstep(0.034, 0.058, p.y)));
    return { geometry: g, pivot: [x, 0.056, front ? 0.030 : -0.030] };
  };
  const parts = {
    body: { geometry: bodyG },
    head: { geometry: headG, pivot: [0, 0.058, 0.034] },
    legFL: mkLeg(1, true), legFR: mkLeg(-1, true), legBL: mkLeg(1, false), legBR: mkLeg(-1, false),
  };
  const geometry = assemble(Object.values(parts).map((p) => p.geometry), [], null);
  return { geometry, parts };
}

/* ============================================================
 * 蝴蝶（≤300 面）：翅膀 4 片，双面，wing = x / 半翼展
 * ============================================================ */
const BF_HALF = 0.0153;
const BF_PAL = {
  Y: hex(0xf4d437), K: hex(0x17110e), k: hex(0x2c2118), B: hex(0x2f78f0), L: hex(0x68bdfb), D: hex(0x123a8c),
  O: hex(0xea7518), W: hex(0xf6f4ec), R: hex(0xe8501c), U: hex(0x3c6ee0), w: hex(0xe2e1d4), G: hex(0xb7c06a), A: hex(0xf7b52a),
};
const BF_KIND = {
  swallowtail: {
    root: 'k',
    fore: ['KYKYKY', 'KYKYKY', 'KKKKKK'], foreRoot: 'k',
    hind: ['YYYYYY', 'YYYBBR', 'KKKKKK'], tail: true,
  },
  blue: {
    fore: ['LLBBBB', 'LBBBBB', 'KKKKKK'], foreRoot: 'D',
    hind: ['BBBBBB', 'BBLLBB', 'KKKKKK'], tail: false,
  },
  monarch: {
    fore: ['OKOOKO', 'KOKOOK', 'KWKWKW'], foreRoot: 'k',
    hind: ['OOOOOO', 'OKOKOK', 'KWKWKW'], tail: false,
  },
  white: {
    fore: ['WWwWWW', 'KWWWKW', 'KKKWWW'], foreRoot: 'w',
    hind: ['wWWWWW', 'WWWWWW', 'WWGWWW'], tail: false,
  },
};
export function butterfly(seed = 1, kind = 'swallowtail') {
  const R = mulberry32(seed * 2713 + 5);
  const K = BF_KIND[kind] ?? BF_KIND.swallowtail;
  const soup = new Soup(['wing']);
  const RINGS = [0.45, 0.76, 1.0];
  const wo = { soft: 0.9, backMul: 0.8 };
  const wingAt = (x) => clamp(x / BF_HALF, -1, 1);
  const addWing = (side, outline, root, table, rootKey, yJit) => {
    const pt = (u, k) => {
      const o = outline[k], x = root[0] + (o[0] - root[0]) * u, z = root[1] + (o[1] - root[1]) * u;
      return [side * x, 0.0003 + 0.12 * x + yJit * u * u * 0.001, z];
    };
    const rootV = sv([side * root[0], 0.0003 + 0.12 * root[0], root[1]], BF_PAL[rootKey], { wing: wingAt(side * root[0]) });
    const rows = RINGS.map((u, m) => outline.map((_, k) => {
      const p = pt(u, k);
      return sv(p, BF_PAL[table[m][k]], { wing: wingAt(p[0]) });
    }));
    const n = outline.length;
    for (let k = 0; k < n - 1; k++) soup.tri(rootV, rows[0][k], rows[0][k + 1], wo);
    for (let m = 0; m < 2; m++) for (let k = 0; k < n - 1; k++) soup.quad(rows[m][k], rows[m + 1][k], rows[m + 1][k + 1], rows[m][k + 1], wo);
  };
  const fore = [[0.0048, 0.0042], [0.0100, 0.0072], [0.0152, 0.0058], [0.0150, -0.0014], [0.0105, -0.0040], [0.0030, -0.0030]];
  const hind = [[0.0052, -0.0006], [0.0112, -0.0045], [0.0124, -0.0090], K.tail ? [0.0076, -0.0172] : [0.0092, -0.0124], [0.0045, -0.0108], [0.0018, -0.0058]];
  for (const s of sideX) {
    addWing(s, fore, [0.0012, 0.0006], K.fore, K.foreRoot ?? 'k', 0);
    addWing(s, hind, [0.0012, -0.0010], K.hind, 'k', 0);
  }
  // 触角
  for (const s of sideX) {
    const c = hex(0x1a1410);
    const P = [[s * 0.0006, 0.0010, 0.0074], [s * 0.0013, 0.0020, 0.0100], [s * 0.0022, 0.0028, 0.0128]];
    for (let k = 0; k < 2; k++) {
      const w0 = 0.00022 * (1 - k * 0.6), w1 = 0.00022 * (1 - (k + 1) * 0.6);
      soup.quad(sv([P[k][0] - w0, P[k][1], P[k][2]], c, {}), sv([P[k][0] + w0, P[k][1], P[k][2]], c, {}), sv([P[k + 1][0] + w1, P[k + 1][1], P[k + 1][2]], c, {}), sv([P[k + 1][0] - w1, P[k + 1][1], P[k + 1][2]], c, {}));
    }
  }
  const body = tube([[0, 0.0006, 0.0070], [0, 0.0005, 0.0040], [0, 0.0004, 0.0005], [0, 0.0002, -0.0035], [0, 0, -0.0085]],
    [[0.0012, 0.0013], [0.0016, 0.0018], [0.0018, 0.0020], [0.0013, 0.0014], [0.0004, 0.0004]], { segs: 5, sub: 1, capN: 0, capS: 0.8, capE: 0.8 });
  paint(body, (p, n, c) => { c.copy(hex(0x2b211a)).lerp(hex(0x4a3828), sstep(-0.001, 0.004, p.z) * 0.6); if (kind === 'blue') c.lerp(hex(0x1a2c5a), 0.4); });
  const geometry = assemble([body, soup.geometry()], ['wing']);
  shade(geometry, (p, n) => 0.9 + 0.1 * n.y);
  return { geometry };
}

/* ============================================================
 * 蜻蜓（≤300 面）
 * ============================================================ */
export function dragonfly(seed = 1) {
  const R = mulberry32(seed * 1811 + 3);
  const teal = hex(0x1fb0b8), tealLt = hex(0x45d2c8), dark = hex(0x15303d), thor = hex(0x2f7a4c), thorDk = hex(0x1d3d2c), eye = hex(0x1f8fd6), eyeDk = hex(0x123c78);
  const abd = tube([[0, 0.0003, 0.0040], [0, 0.0002, 0.0005], [0, 0.0000, -0.0060], [0, -0.0002, -0.0130], [0, -0.0003, -0.0190]],
    (t) => { const s = 1 + 0.16 * Math.cos(t * TAU * 5.5); const r = lerp(0.0013, 0.0008, Math.min(1, t * 1.4)) * (t > 0.92 ? 0.7 : 1) * (t < 0.1 ? 1.2 : 1); return [r * s, r * s]; },
    { segs: 5, sub: 2, capN: 0, capS: 0.6, capE: 1.6 });
  paint(abd, (p, n, c, i) => {
    const t = ttOf(abd, i), band = 0.5 + 0.5 * Math.cos(t * TAU * 5.5);
    c.copy(teal).lerp(tealLt, sstep(0.0, 0.5, n.y) * 0.5).lerp(dark, 0.75 * sstep(0.55, 0.95, band) + 0.7 * sstep(0.92, 1.0, t));
    c.lerp(dark, sstep(0.0, -0.7, n.y) * 0.5);
  });
  const thorax = paint(blob([0.0027, 0.0027, 0.0045], [0, 0.0012, 0.0085], [0.12, 0, 0], 6, 4), (p, n, c) => {
    c.copy(thor).lerp(thorDk, 0.5 * sstep(0.5, -0.2, n.y)).lerp(hex(0x9fd25a), 0.5 * sstep(0.2, 0.7, Math.abs(n.x)) * sstep(0.6, 0, Math.abs(n.y)));
  });
  const head = solid(blob([0.0017, 0.0014, 0.0014], [0, 0.0004, 0.0150], [0, 0, 0], 6, 3), hex(0x6bd1b8));
  const eyes = sideX.map((s) => paint(blob([0.0020, 0.0021, 0.0021], [s * 0.0014, 0.0010, 0.0158], [0, 0, 0], 6, 4), (p, n, c) => c.copy(eyeDk).lerp(eye, sstep(-0.2, 0.7, n.y))));
  // 翅：每片 5 个三角 × 双面
  const soup = new Soup(['wing']);
  const HALF = 0.0235;
  const pale = hex(0xcfe1ea), vein = hex(0x7f98a3), stig = hex(0x2a1e16);
  const wing = (s, zr, len, chord, sweep, droop, hindW) => {
    const st = [0, 0.28, 0.62, 0.9];
    const cw = hindW ? [0.8, 1.15, 1.1, 0.8] : [0.6, 1.0, 1.0, 0.75];
    const X = (k) => s * (0.0016 + len * st[k]), Y = (k) => 0.0030 + droop * st[k] * st[k];
    const lead = (k) => [X(k), Y(k), zr + chord * 0.30 * cw[k] + sweep * st[k]];
    const trail = (k) => [X(k), Y(k), zr - chord * 0.70 * cw[k] + sweep * st[k]];
    const wv = (p, col) => sv(p, col, { wing: clamp(p[0] / HALF, -1, 1) });
    const rows = st.map((_, k) => [wv(lead(k), k === 3 ? stig : mixC(hex(0x62767f), pale, 0.45 + 0.15 * k)), wv(trail(k), mixC(pale, vein, 0.15))]);
    const tip = wv([s * (0.0016 + len), Y(3) + droop * 0.3, zr - chord * 0.12 + sweep], hex(0xb9ccd5));
    const o = { soft: 0.9, backMul: 0.92 };
    for (let k = 0; k < 3; k++) soup.quad(rows[k][0], rows[k][1], rows[k + 1][1], rows[k + 1][0], o);
    soup.tri(rows[3][0], rows[3][1], tip, o);
  };
  for (const s of sideX) { wing(s, 0.0100, 0.0220, 0.0056, 0.0008, 0.0010, false); wing(s, 0.0058, 0.0212, 0.0070, -0.0006, 0.0010, true); }
  const geometry = assemble([abd, thorax, head, ...eyes, soup.geometry()], ['wing']);
  shade(geometry, (p, n) => skyAO(n, 0.12));
  return { geometry };
}

/* ============================================================
 * 小鸟（≤300 面）：欧亚鸲 / 大山雀 / 金翅雀
 * ============================================================ */
export function songbird(seed = 1, kind = 'robin') {
  const R = mulberry32(seed * 977 + 17);
  const K = {
    robin: { back: 0x866b47, belly: 0xeee7d6, front: 0xe2551f, wing: 0x6a5436, tail: 0x6a573e, beak: 0x2a2420, edge: 0x8e9aa2 },
    tit: { back: 0x7f8c3f, belly: 0xe7cf30, front: 0x15181b, wing: 0x62788a, tail: 0x56707f, beak: 0x1c1c1c },
    finch: { back: 0x9b7c52, belly: 0xc9c64a, front: 0xaab648, wing: 0x1f1f21, tail: 0x25262a, beak: 0xe9b7a1 },
  }[kind] ?? null;
  const k = K ?? { back: 0x866b47, belly: 0xeee7d6, front: 0xe2551f, wing: 0x6a5436, tail: 0x6a573e, beak: 0x2a2420 };
  const Cb = hex(k.back), Cbel = hex(k.belly), Cf = hex(k.front), Cw = hex(k.wing), Ct = hex(k.tail), Cbk = hex(k.beak);
  const body = tube([[0, 0.0005, -0.0075], [0, 0.0000, -0.0035], [0, 0.0000, 0.0010], [0, 0.0020, 0.0055], [0, 0.0034, 0.0086]],
    [[0.0022, 0.0020], [0.0042, 0.0044], [0.0047, 0.0048], [0.0037, 0.0040], [0.0033, 0.0034]], { segs: 8, sub: 1, capN: 1, capS: 0.8, capE: 0.8 });
  paint(body, (p, n, c) => {
    const bel = sstep(0.0, -0.55, n.y);
    c.copy(Cb).lerp(Cbel, bel);
    if (kind === 'robin') {
      const front = sstep(-0.0010, 0.0035, p.z), crown = sstep(0.35, 0.85, n.y) * sstep(0.0035, 0.006, p.z);
      c.lerp(Cf, front * (1 - sstep(0.55, 0.95, n.y) * sstep(0.0035, 0.0055, p.z)) * (1 - 0.0 * crown));
      c.lerp(hex(k.edge), 0.7 * sstep(0.0035, -0.0005, p.z) * sstep(-0.0030, -0.0005, p.z) * sstep(0.2, -0.3, n.y) * sstep(-0.05, 0.4, n.y + 0.4) * 0);
      c.lerp(hex(k.edge), 0.6 * sstep(-0.0005, -0.0020, p.z) * sstep(-0.0040, -0.0020, p.z) * sstep(0.2, -0.2, n.y) * 0.5);
    } else if (kind === 'tit') {
      const head = sstep(0.0032, 0.0052, p.z);
      c.lerp(hex(k.front), head * (1 - sstep(-0.2, -0.75, n.y) * 0.0));
      c.lerp(hex(0xf4f4ef), head * sstep(0.35, -0.1, n.y) * sstep(-0.9, -0.2, n.y) * sstep(0.0058, 0.0062, p.z) * 0 + head * sstep(0.7, 0.2, Math.abs(n.y)) * sstep(0.25, 0.7, Math.abs(n.x)));
      c.lerp(hex(0x15181b), 0.9 * sstep(0.0035, 0.0, p.z) * sstep(-0.0050, -0.0030, p.z) * 0 + 0.85 * sstep(0.12, 0.0, Math.abs(n.x)) * sstep(0.0035, 0.0, p.z) * sstep(-0.6, -0.9, n.y) * 0);
      c.lerp(hex(0x15181b), 0.85 * sstep(0.2, 0.0, Math.abs(n.x)) * sstep(0.0, -0.5, n.y) * sstep(0.0030, 0.0005, p.z));
      c.lerp(hex(0x15181b), head * sstep(-0.1, -0.7, n.y) * 0.9 * sstep(0.2, 0.9, 1 - Math.abs(n.x) * 0.5));
    } else if (kind === 'finch') {
      c.lerp(hex(0xa4b244), sstep(0.0020, 0.0050, p.z) * 0.8).lerp(hex(0xd6c850), bel * 0.7);
      c.lerp(hex(0x1e1e20), sstep(0.0052, 0.0072, p.z) * sstep(0.3, -0.3, n.y) * 0.45);
    }
    c.lerp(Ct, 0.4 * sstep(-0.0050, -0.0072, p.z));
  });
  const beak = tube([[0, 0.0032, 0.0088], [0, 0.0028, 0.0106]], [[0.0014, 0.0013], [0.0006, 0.0006]], { segs: 5, sub: 1, capN: 0, capS: 0, capE: 1.4 });
  solid(beak, Cbk);
  const eyes = sideX.map((s) => solid(blob([0.0006, 0.0006, 0.0006], [s * 0.0030, 0.0040, 0.0070], [0, 0, 0], 5, 3), hex(0x0a0807)));
  // 尾羽（双面薄片）
  const soup = new Soup(['wing']);
  const tc = Ct, tc2 = mixC(Ct, hex(0x111111), 0.3);
  const tv = (p, c) => sv(p, c, { wing: 0 });
  soup.quad(tv([-0.0016, 0.0006, -0.0066], tc), tv([0.0016, 0.0006, -0.0066], tc), tv([0.0028, 0.0002, -0.0136], tc2), tv([-0.0028, 0.0002, -0.0136], tc2), { soft: 0.3 });
  // 翅膀：多边形扇面，wing = x / 半翼展
  const HALF = 0.0170;
  const outline = [[0.0030, 0.0030], [0.0060, 0.0040], [0.0095, 0.0040], [0.0130, 0.0022], [0.0158, -0.0006], [0.0170, -0.0040], [0.0148, -0.0034], [0.0138, -0.0066], [0.0112, -0.0050], [0.0098, -0.0074], [0.0068, -0.0058], [0.0044, -0.0072], [0.0026, -0.0046]];
  const cen = [0.0052, -0.0004];
  const wingCol = (x, z) => {
    const c = Cw.clone();
    if (kind === 'robin') c.lerp(hex(0x9a8260), sstep(0.0040, 0.0, z) * 0 + 0.35 * sstep(0.0060, 0.0, x));
    if (kind === 'tit') { c.lerp(hex(0xeff0ec), 0.9 * sstep(0.0004, 0.0012, z) * sstep(0.0008, -0.0016, z) * sstep(0.003, 0.006, x) * 0 + 0.8 * (z > -0.0012 && z < 0.0014 && x > 0.0045 && x < 0.0125 ? 1 : 0)); c.lerp(Cb, 0.5 * sstep(0.0075, 0.003, x)); }
    if (kind === 'finch') c.lerp(hex(0xf6d812), 0.95 * ((x > 0.0055 && x < 0.0125 && z < 0.0034 && z > -0.0030) ? 1 : 0));
    if (kind === 'robin') c.lerp(Cb, 0.4 * sstep(0.0075, 0.003, x));
    return c;
  };
  const yAt = (x) => 0.0014 + 0.34 * Math.max(0, x - 0.0030);
  const wv = (x, z, s) => { const c = wingCol(x, z); return sv([s * x, yAt(x), z], c, { wing: clamp((s * x) / HALF, -1, 1) }); };
  for (const s of sideX) {
    const cv = wv(cen[0], cen[1], s);
    for (let i = 0; i < outline.length - 1; i++) soup.tri(cv, wv(outline[i][0], outline[i][1], s), wv(outline[i + 1][0], outline[i + 1][1], s), { soft: 0.85, backMul: 1.0 });
    soup.tri(cv, wv(outline[outline.length - 1][0], outline[outline.length - 1][1], s), wv(outline[0][0], outline[0][1], s), { soft: 0.85, backMul: 1.0 });
  }
  const geometry = assemble([body, beak, ...eyes, soup.geometry()], ['wing']);
  shade(geometry, (p, n) => skyAO(n, 0.16));
  return { geometry };
}

/* ============================================================
 * 绿头鸭（雄），原点在水线
 * ============================================================ */
export function duck(seed = 1) {
  const R = mulberry32(seed * 5309 + 21);
  const C = {
    green: hex(0x1b6a4a), greenLt: hex(0x2f9468), white: hex(0xf4f1e8), chest: hex(0x7c402c), gray: hex(0xb7b8b2), grayBk: hex(0x7a766a),
    rump: hex(0x17191c), bill: hex(0xdcbf2a), nail: hex(0x3a3320), blue: hex(0x2a55a8), tailW: hex(0xe9e8e2), wing: hex(0x8b8579),
  };
  const body = tube([[0, 0.0070, -0.0215], [0, 0.0050, -0.0140], [0, 0.0035, -0.0030], [0, 0.0040, 0.0080], [0, 0.0070, 0.0170]],
    [[0.0030, 0.0045], [0.0085, 0.0100], [0.0112, 0.0125], [0.0108, 0.0120], [0.0080, 0.0100]], { segs: 14, sub: 3, capN: 3, capS: 1.1, capE: 0.9 });
  paint(body, (p, n, c) => {
    const rear = sstep(-0.0140, -0.0200, p.z), chest = sstep(0.004, 0.0125, p.z);
    c.copy(C.gray).lerp(C.grayBk, sstep(0.3, 0.95, n.y) * 0.9);
    c.lerp(C.white, sstep(-0.3, -0.85, n.y) * 0.4 * (1 - chest));
    c.lerp(C.chest, chest * sstep(-0.35, 0.3, n.y) * 0.98 + chest * 0.4 * sstep(-0.5, -0.9, n.y));
    c.lerp(C.rump, rear * sstep(-0.1, 0.5, n.y) * 0.95);
    c.lerp(C.white, 0.9 * rear * sstep(0.0, -0.5, n.y));
    c.multiplyScalar(0.95 + 0.1 * vnoise(p.x * 300, p.y * 300, p.z * 300, seed));
  });
  const neck = tube([[0, 0.0105, 0.0140], [0, 0.0170, 0.0185], [0, 0.0225, 0.0208]], [[0.0066, 0.0068], [0.0047, 0.0050], [0.0042, 0.0044]], { segs: 10, sub: 3, capS: 0.4, capE: 0.2, capN: 1 });
  paint(neck, (p, n, c, i) => {
    const t = ttOf(neck, i);
    c.copy(C.chest).lerp(C.white, sstep(0.2, 0.32, t) * (1 - sstep(0.42, 0.5, t))).lerp(C.green, sstep(0.46, 0.58, t));
    c.lerp(C.greenLt, 0.25 * sstep(0.6, 1, t) * sstep(0.2, 0.9, n.y));
  });
  const head = blob([0.0048, 0.0049, 0.0063], [0, 0.0272, 0.0222], [0.12, 0, 0], 12, 9);
  paint(head, (p, n, c) => { c.copy(C.green).lerp(C.greenLt, 0.45 * sstep(0.1, 0.9, n.y)).lerp(C.green, 0.3); });
  const bill = paint(blob([0.0032, 0.0011, 0.0062], [0, 0.0255, 0.0292], [0.18, 0, 0], 10, 5), (p, n, c) => { c.copy(C.bill).lerp(C.nail, sstep(0.0334, 0.0352, p.z)); });
  const eyes = sideX.map((s) => solid(blob([0.0009, 0.0009, 0.0009], [s * 0.0040, 0.0288, 0.0232], [0, 0, 0], 6, 4), hex(0x080706)));
  // 折叠的翅膀（侧面，带蓝色翼镜）
  const wings = sideX.map((s) => paint(blob([0.0017, 0.0058, 0.0128], [s * 0.0097, 0.0082, -0.0050], [-0.08, 0, -s * 0.1], 10, 8), (p, n, c) => {
    c.copy(C.wing).lerp(C.grayBk, 0.4 * sstep(0.4, 1, n.y));
    const spec = sstep(-0.0105, -0.0125, p.z) * sstep(-0.0150, -0.0125, p.z) * 0 + (p.z < -0.0080 && p.z > -0.0140 ? 1 : 0) * sstep(0.4, 0.8, Math.abs(n.x));
    c.lerp(C.blue, spec * 0.9 * sstep(0.0090, 0.0050, p.y));
    c.lerp(C.white, 0.9 * sstep(-0.0075, -0.0080, p.z) * sstep(-0.0090, -0.0080, p.z) * 0);
  }));
  // 卷曲的黑色尾羽
  const curl = tube([[0, 0.0088, -0.0222], [0, 0.0100, -0.0268], [0, 0.0135, -0.0290], [0, 0.0172, -0.0275], [0, 0.0182, -0.0248]],
    [0.0016, 0.0014, 0.0012, 0.0009, 0.0004], { segs: 6, sub: 3, capN: 1, capS: 0.4, capE: 1.2 });
  solid(curl, C.rump);
  const tailF = paint(blob([0.0040, 0.0010, 0.0058], [0, 0.0078, -0.0245], [-0.25, 0, 0], 8, 5), (p, n, c) => c.copy(C.tailW));
  const geometry = assemble([body, neck, head, bill, ...eyes, ...wings, curl, tailF]);
  shade(geometry, (p, n) => skyAO(n, 0.2) * (p.y < 0 ? lerp(0.55, 1, sstep(-0.01, 0.0, p.y)) : 1));
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(0.86, 0.86, 0.86));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry };
}

/* ============================================================
 * 青蛙
 * ============================================================ */
export function frog(seed = 1) {
  const R = mulberry32(seed * 3319 + 31);
  const C = { green: hex(0x5f9b3c), greenLt: hex(0x8dbb52), greenDk: hex(0x2f5a25), belly: hex(0xefe5ab), iris: hex(0xd9b43c), dark: hex(0x0c0a07), stripe: hex(0x2c4a22) };
  const skin = (g, o = {}) => paint(g, (p, n, c) => {
    c.copy(C.green).lerp(C.greenLt, sstep(0.0, 0.8, n.y) * 0.35 + 0.35 * sstep(0.5, -0.2, n.y) * sstep(-0.3, 0.2, n.y));
    c.lerp(C.belly, sstep(-0.1, -0.7, n.y) * (o.belly ?? 1));
    c.multiplyScalar(0.94 + 0.12 * vnoise(p.x * 400, p.y * 400, p.z * 400, seed));
  });
  const list = [];
  const bodyB = [0, 0.0074, -0.0018], bodyR = [0.0086, 0.0074, 0.0108];
  list.push(skin(blob(bodyR, bodyB, [-0.12, 0, 0], 14, 10)));
  list.push(skin(blob([0.0080, 0.0056, 0.0070], [0, 0.0088, 0.0068], [0.05, 0, 0], 12, 8)));
  // 眼
  for (const s of sideX) {
    list.push(paint(blob([0.0030, 0.0030, 0.0030], [s * 0.0050, 0.0140, 0.0082], [0, 0, 0], 10, 7), (p, n, c) => {
      c.copy(C.green).lerp(C.iris, sstep(0.15, 0.5, n.z + n.y * 0.2) * 0.9);
      c.lerp(C.greenLt, 0.2);
    }));
    list.push(solid(blob([0.0016, 0.0009, 0.0005], [s * 0.0052, 0.0143, 0.0108], [0, 0, 0], 7, 4), C.dark));
  }
  // 后腿：大腿 + 小腿 + 脚
  for (const s of sideX) {
    const th = tube([[s * 0.0070, 0.0090, -0.0064], [s * 0.0110, 0.0070, -0.0010], [s * 0.0126, 0.0040, 0.0030]], [[0.0045, 0.0042], [0.0038, 0.0034], [0.0027, 0.0026]], { segs: 8, sub: 3, capN: 1, capS: 0.5, capE: 0.5 });
    skin(th, { belly: 0.0 });
    const sh = tube([[s * 0.0126, 0.0040, 0.0030], [s * 0.0134, 0.0024, -0.0040], [s * 0.0114, 0.0018, -0.0098]], [[0.0027, 0.0026], [0.0022, 0.0022], [0.0018, 0.0016]], { segs: 7, sub: 3, capN: 1, capS: 0.5, capE: 0.5 });
    skin(sh, { belly: 0.0 });
    const ft = tube([[s * 0.0114, 0.0016, -0.0098], [s * 0.0128, 0.0012, -0.0040], [s * 0.0140, 0.0009, 0.0030]], [[0.0016, 0.0014], [0.0016, 0.0011], [0.0008, 0.0007]], { segs: 6, sub: 2, capN: 1, capS: 0.5, capE: 1.0 });
    skin(ft, { belly: 0.0 });
    list.push(th, sh, ft);
    list.push(skin(blob([0.0030, 0.0006, 0.0034], [s * 0.0142, 0.0007, 0.0044], [0, s * 0.3, 0], 12, 4), { belly: 0 }));
    // 前腿
    const fl = tube([[s * 0.0058, 0.0066, 0.0038], [s * 0.0068, 0.0036, 0.0070], [s * 0.0066, 0.0010, 0.0082]], [[0.0026, 0.0026], [0.0020, 0.0020], [0.0017, 0.0016]], { segs: 7, sub: 3, capN: 1, capS: 0.5, capE: 0.3 });
    list.push(skin(fl, { belly: 0 }));
    list.push(skin(blob([0.0030, 0.0007, 0.0032], [s * 0.0066, 0.0007, 0.0096], [0, s * 0.2, 0], 12, 4), { belly: 0 }));
  }
  // 眼后深色带 + 背上深斑
  for (let i = 0; i < 11; i++) {
    const az = (R() - 0.5) * 2.3, el = 0.62 + R() * 0.7;
    const d = V3(Math.sin(az) * Math.cos(el * 1.2 - 0.3), Math.sin(el), Math.cos(az) * Math.cos(el * 1.2 - 0.3) * 0.55 - 0.1).normalize();
    const nrm = V3(d.x / (bodyR[0] ** 2), d.y / (bodyR[1] ** 2), d.z / (bodyR[2] ** 2)).normalize();
    const pp = V3(bodyB[0] + d.x * bodyR[0], bodyB[1] + d.y * bodyR[1], bodyB[2] + d.z * bodyR[2]);
    if (pp.z > 0.0045) continue;
    list.push(decal(pp, nrm, 0.0011 + 0.0009 * R(), C.greenDk, 0.4, 10, 4));
  }
  const geometry = assemble(list, [], 0);
  shade(geometry, (p, n) => skyAO(n, 0.2) * groundAO(p.y, 0.004, 0.3));
  return { geometry };
}

/* ============================================================
 * 招潮蟹
 * ============================================================ */
export function crab(seed = 1) {
  const R = mulberry32(seed * 8123 + 41);
  const C = { shell: hex(0xd7502b), shellLt: hex(0xe8844a), under: hex(0xeab592), leg: hex(0xc8472a), tip: hex(0xf0d3b8), eye: hex(0x0b0907), stalk: hex(0xe0a07a) };
  const list = [];
  // 蟹壳
  const shell = blob([0.0098, 0.0046, 0.0068], [0, 0.0066, 0], [0, 0, 0], 16, 10);
  displace(shell, (p, n) => { const ax = Math.abs(p.x) / 0.0098; return 0.0003 * Math.sin(p.x * 900) * 0 + (n.y > 0.4 ? 0.0002 * fbm(p.x * 400, p.y * 400, p.z * 400, seed, 2) : 0); });
  paint(shell, (p, n, c) => {
    c.copy(C.shell).lerp(C.shellLt, 0.55 * sstep(0.2, 0.9, n.y) * (0.5 + 0.5 * vnoise(p.x * 500, p.y * 500, p.z * 500, seed)));
    c.lerp(C.shellLt, 0.2 * sstep(0.003, 0.009, p.y));
    c.lerp(C.under, sstep(-0.1, -0.7, n.y));
    c.lerp(hex(0x9a3418), 0.45 * sstep(0.3, 0.9, n.y) * sstep(0.0035, 0.0055, Math.abs(p.z)) * 0.0 + 0.3 * sstep(0.0030, 0.0062, Math.abs(p.x)) * sstep(-0.1, 0.5, n.y) * 0.5);
  });
  list.push(shell);
  // 眼柄
  for (const s of sideX) {
    const st = tube([[s * 0.0030, 0.0090, 0.0058], [s * 0.0034, 0.0108, 0.0072], [s * 0.0036, 0.0124, 0.0078]], [0.0007, 0.0006, 0.0005], { segs: 5, sub: 2, capN: 1, capS: 0.3, capE: 0.4 });
    list.push(solid(st, C.stalk));
    list.push(solid(blob([0.0012, 0.0013, 0.0012], [s * 0.0037, 0.0130, 0.0080], [0, 0, 0], 7, 5), C.eye));
  }
  // 八条腿
  const zs = [0.0032, 0.0011, -0.0010, -0.0030];
  for (const s of sideX) {
    zs.forEach((z, i) => {
      const k = 1 + (i === 0 ? 0.0 : 0.0), dz = (i - 1.5) * -0.0010;
      const pts = [[s * 0.0084, 0.0058, z], [s * 0.0128, 0.0098, z + dz * 0.5], [s * (0.0160 + 0.0004 * i), 0.0040, z + dz * 1.4], [s * (0.0172 + 0.0004 * i), 0.0000, z + dz * 1.8]];
      const t = tube(pts, [0.0010, 0.0009, 0.0007, 0.0004], { segs: 5, sub: 2, capN: 0, capS: 0.5, capE: 0.8 });
      paint(t, (p, n, c, j) => c.copy(C.leg).lerp(C.tip, sstep(0.82, 1, ttOf(t, j)) * 0.5).lerp(hex(0x8d3a22), 0.0));
      list.push(t);
    });
  }
  // 钳：右侧（+x）大钳，左侧（-x）小钳
  const claw = (s, sc, big) => {
    const m = (a, b, c) => [s * a * sc, b * sc + (1 - sc) * 0.0 + 0.0, c * sc];
    const pa = [[0.0084, 0.0062, 0.0046], [0.0128, 0.0088, 0.0076], [0.0124, 0.0082, 0.0122]].map((q) => [s * q[0] * (0.55 + 0.45 * sc) + 0, q[1], q[2] * (0.6 + 0.4 * sc) + 0.0008 * (1 - sc)]);
    const arm = tube(pa, [0.0021 * sc + 0.0004, 0.0018 * sc + 0.0004, 0.0016 * sc + 0.0004], { segs: 7, sub: 3, capN: 1, capS: 0.5, capE: 0.2 });
    list.push(solid(arm, C.leg));
    const cx = s * 0.0124 * (0.55 + 0.45 * sc), cz = 0.0148 * (0.6 + 0.4 * sc) + 0.0006;
    const palm = blob([0.0046 * sc, 0.0032 * sc, 0.0062 * sc], [cx, 0.0080, cz], [0.0, -s * 0.12, 0], 10, 7);
    paint(palm, (p, n, c) => c.copy(C.shell).lerp(C.shellLt, 0.4 * sstep(0.0, 0.8, n.y)).lerp(C.under, 0.4 * sstep(-0.2, -0.8, n.y)));
    list.push(palm);
    const f1 = tube([[cx - s * 0.0010 * sc, 0.0082, cz + 0.0040 * sc], [cx - s * 0.0018 * sc, 0.0082, cz + 0.0080 * sc], [cx - s * 0.0010 * sc, 0.0082, cz + 0.0112 * sc]], [0.0017 * sc + 0.0002, 0.0013 * sc + 0.0002, 0.0005], { segs: 6, sub: 3, capN: 1, capS: 0.3, capE: 1.6 });
    const f2 = tube([[cx + s * 0.0014 * sc, 0.0074, cz + 0.0038 * sc], [cx + s * 0.0026 * sc, 0.0078, cz + 0.0080 * sc], [cx + s * 0.0014 * sc, 0.0080, cz + 0.0112 * sc]], [0.0015 * sc + 0.0002, 0.0012 * sc + 0.0002, 0.0005], { segs: 6, sub: 3, capN: 1, capS: 0.3, capE: 1.6 });
    for (const f of [f1, f2]) list.push(paint(f, (p, n, c, j) => c.copy(C.shell).lerp(C.tip, sstep(0.55, 1, ttOf(f, j)))));
  };
  claw(1, 1.55, true); claw(-1, 0.6, false);
  const geometry = assemble(list, [], 0);
  shade(geometry, (p, n) => skyAO(n, 0.22) * groundAO(p.y, 0.006, 0.3) * (0.85 + 0.15 * sstep(0.002, 0.009, p.y)));
  return { geometry };
}

/* ============================================================
 * 椰子树
 * ============================================================ */
export function palm(seed = 1, h = 0.9) {
  const R = mulberry32(seed * 2909 + 77);
  const k = h / 0.9;
  const trunkH = h * 0.90;
  const lean = (0.06 + 0.07 * R()) * k, dirA = R() * TAU, wig = (0.012 + 0.012 * R()) * k;
  const dx = Math.cos(dirA), dz = Math.sin(dirA);
  const spineAt = (s) => {
    const off = lean * Math.pow(s, 1.7), w = wig * Math.sin(s * Math.PI * 1.15);
    return [dx * off - dz * w, trunkH * s, dz * off + dx * w];
  };
  const pts = []; for (let i = 0; i <= 8; i++) pts.push(spineAt(i / 8));
  const BANDS = 17, rBase = 0.024 * k, rTop = 0.0145 * k;
  const trunk = tube(pts, (t) => { const r = lerp(rBase, rTop, Math.pow(t, 0.8)) * (1 + 0.55 * Math.exp(-t * 20)); return [r, r]; },
    { segs: 8, sub: 6, capS: 0, capE: 0.2, capN: 1, ref: [1, 0, 0],
      mod: (t) => { const ph = (t * BANDS) % 1; return 1 + 0.045 * Math.pow(0.5 + 0.5 * Math.cos(ph * TAU), 3) * sstep(0.03, 0.12, t) - 0.02; },
      wind: (t) => 0.35 * Math.pow(t, 1.4) });
  const barkA = hex(0x93805f), barkB = hex(0x6b573d), barkC = hex(0xa59373);
  paint(trunk, (p, n, c, i) => {
    const t = ttOf(trunk, i), ph = (t * BANDS) % 1, groove = Math.pow(0.5 + 0.5 * Math.cos(ph * TAU), 3);
    const ang = Math.atan2(p.z - 0, p.x - 0);
    c.copy(barkA).lerp(barkC, 0.35 * (1 - groove) * vnoise(p.x * 90, p.y * 40, p.z * 90, seed)).lerp(barkB, 0.75 * groove);
    c.lerp(barkB, 0.35 * sstep(0.08, 0.0, t)).multiplyScalar(0.92 + 0.16 * vnoise(p.x * 250, p.y * 60, p.z * 250, seed + 3));
    c.lerp(hex(0x6e7a3a), 0.25 * sstep(0.12, 0.0, t) * vnoise(p.x * 120, p.y * 120, p.z * 120, seed + 5));
  });
  shade(trunk, (p, n) => (0.78 + 0.22 * sstep(0.0, 0.1 * k, p.y)) * skyAO(n, 0.1));
  const T = V3(...spineAt(1));
  const list = [trunk];
  const crown = blob([0.026 * k, 0.019 * k, 0.026 * k], [T.x, T.y + 0.004 * k, T.z], [0, 0, 0], 10, 7);
  solid(crown, hex(0x5f5a2c)); setAttr(crown, 'wind', () => 0.35); list.push(crown);
  // 椰子
  const nco = 6 + (R() < 0.5 ? 1 : 0);
  for (let i = 0; i < nco; i++) {
    const a = (i / nco) * TAU + R() * 0.5, rr = (0.0185 + 0.004 * R()) * k;
    const c = icoBall((0.0112 + 0.0018 * R()) * k, [T.x + Math.cos(a) * rr, T.y - (0.010 + 0.012 * R()) * k, T.z + Math.sin(a) * rr], [1, 1.1, 1], [R() * 2, R() * 3, R()]);
    const green = R() < 0.6;
    paint(c, (p, n, col) => {
      col.copy(green ? hex(0x6c8b34) : hex(0x8a6a38)).lerp(hex(0x4f6a26), 0.35 * sstep(0.3, -0.8, n.y));
      col.multiplyScalar(0.9 + 0.2 * vnoise(p.x * 200, p.y * 200, p.z * 200, seed));
      col.lerp(hex(0xc9b37a), 0.35 * sstep(0.4, 1, n.y) * (green ? 0.2 : 0.5));
    });
    shade(c, (p, n) => ballAO(p, n, [[T.x, T.y - 0.004 * k, T.z, 0.02 * k]], 0.35) * skyAO(n, 0.25));
    setAttr(c, 'wind', () => 0.35); list.push(c);
  }
  // 羽状复叶
  const nf = 9 + (R() < 0.5 ? 1 : 0);
  const soup = new Soup(['wind']);
  const lfA = hex(0x2c6a30), lfB = hex(0x4c9b3e), lfC = hex(0x8dbd50), rib = hex(0x8aa04a);
  for (let f = 0; f < nf; f++) {
    const phi = ((f + R() * 0.45) * TAU) / nf, hd = V3(Math.cos(phi), 0, Math.sin(phi));
    const sEl = clamp(0.55 + 0.34 * Math.sin(f * 2.4 + 1.0) + (R() - 0.5) * 0.12, 0.15, 0.85);
    const L = (0.37 + 0.05 * R()) * k, cx = 0.92 - 0.3 * Math.max(0, sEl - 0.6), dr = 0.95;
    const base = V3(T.x, T.y + 0.007 * k, T.z);
    const P = (t) => base.clone().addScaledVector(hd, L * cx * t).add(V3(0, L * (sEl * t - dr * t * t), 0));
    const Tn = (t) => hd.clone().multiplyScalar(L * cx).add(V3(0, L * (sEl - 2 * dr * t), 0)).normalize();
    const rpts = []; for (let i = 0; i <= 5; i++) rpts.push(P(i / 5).toArray());
    const rachis = tube(rpts, [0.0020 * k, 0.0017 * k, 0.0014 * k, 0.0011 * k, 0.0008 * k, 0.0004 * k], { segs: 3, sub: 2, capN: 0, capS: 0.3, capE: 1.0, wind: (t) => 0.35 + 0.65 * t });
    solid(rachis, hex(0x7f9448)); list.push(rachis);
    const tone = 0.9 + 0.2 * R();
    const NP = 15;
    for (let j = 0; j < NP; j++) {
      const t = 0.09 + 0.86 * (j / (NP - 1));
      const c0 = P(t), tg = Tn(t);
      let sd = new THREE.Vector3().crossVectors(tg, V3(0, 1, 0)); if (sd.lengthSq() < 1e-6) sd = hd.clone(); sd.normalize();
      const env = 0.38 + 0.62 * Math.sin(Math.PI * clamp((t - 0.02) / 1.0, 0, 1) ** 0.75);
      const len = 0.105 * k * env * (0.94 + 0.12 * R());
      for (const sg of [1, -1]) {
        const del = 0.45 + 0.4 * t + (R() - 0.5) * 0.12;
        const dir = sd.clone().multiplyScalar(sg * Math.cos(del)).add(V3(0, -Math.sin(del), 0)).addScaledVector(tg, 0.33).normalize();
        const mid = c0.clone().addScaledVector(dir, len * 0.5);
        const dir2 = dir.clone().add(V3(0, -0.4, 0)).normalize();
        const tip = mid.clone().addScaledVector(dir2, len * 0.5);
        const w0 = 0.0092 * k * (0.9 + 0.2 * env), w1 = w0 * 0.62;
        const wA = { wind: 0.35 + 0.65 * t }, wM = { wind: clamp(0.35 + 0.65 * t + 0.06, 0, 1) }, wT = { wind: clamp(0.35 + 0.65 * t + 0.12, 0, 1) };
        const cb = mixC(lfA, rib, 0.25).multiplyScalar(tone), cm = mixC(lfB, lfA, 0.2).multiplyScalar(tone), ct = mixC(lfB, lfC, 0.6 + 0.2 * t).multiplyScalar(tone);
        const A = sv(c0.clone().addScaledVector(tg, -w0 / 2), cb, wA), B = sv(c0.clone().addScaledVector(tg, w0 / 2), cb, wA);
        const M1 = sv(mid.clone().addScaledVector(tg, -w1 / 2), cm, wM), M2 = sv(mid.clone().addScaledVector(tg, w1 / 2), cm, wM);
        const TP = sv(tip, ct, wT);
        const o = { soft: 0.4, backMul: 0.72 };
        soup.tri(A, B, M2, o); soup.tri(A, M2, M1, o); soup.tri(M1, M2, TP, o);
      }
    }
  }
  const leaves = soup.geometry();
  shade(leaves, (p, n) => {
    const dxz = Math.hypot(p.x - T.x, p.z - T.z), dy = p.y - T.y;
    return lerp(0.62, 1, sstep(0.0, 0.2 * k, dxz)) * lerp(0.78, 1, sstep(-0.22 * k, 0.04 * k, dy));
  });
  list.push(leaves);
  const geometry = assemble(list, ['wind'], 0);
  return { geometry };
}

/* ============================================================
 * 芦苇丛
 * ============================================================ */
export function reeds(seed = 1) {
  const R = mulberry32(seed * 1223 + 11);
  const list = [];
  const soup = new Soup(['wind']);
  const stemA = hex(0x7f9a45), stemB = hex(0xb3a766), leafA = hex(0x5f8f3a), leafB = hex(0xa9bb5c), plA = hex(0x9a7a66), plB = hex(0xe2d4b0);
  const nC = 8 + Math.floor(R() * 4), nB = 11 + Math.floor(R() * 4);
  const rpos = () => { const a = R() * TAU, r = Math.sqrt(R()) * 0.022; return [Math.cos(a) * r, Math.sin(a) * r]; };
  for (let i = 0; i < nC; i++) {
    const [x0, z0] = rpos(), Ht = 0.15 + 0.045 * R();
    const la = R() * TAU, lm = 0.010 + 0.018 * R();
    const P = (t) => [x0 + Math.cos(la) * lm * t * t, Ht * t, z0 + Math.sin(la) * lm * t * t];
    const pts = [0, 0.3, 0.6, 0.85, 1].map(P);
    const stem = tube(pts, [0.00075, 0.0007, 0.00060, 0.00050, 0.00038], { segs: 4, sub: 2, capN: 0, capS: 0.4, capE: 0.4, wind: (t) => t });
    paint(stem, (p, n, c, j) => c.copy(stemA).lerp(stemB, sstep(0.3, 1, ttOf(stem, j))));
    list.push(stem);
    // 穗
    const top = V3(...P(1)), dirv = V3(...P(1)).sub(V3(...P(0.92))).normalize();
    const pl = (len, wd, off, tilt, tt) => {
      const g = blob([wd, len, wd * 0.9], [0, 0, 0], [0, 0, 0], 8, 6);
      displace(g, (p) => (fbm(p.x * 500 + i, p.y * 500, p.z * 500, seed, 2) - 0.5) * 0.0016);
      const q = new THREE.Quaternion().setFromUnitVectors(_Y, dirv.clone().add(V3(Math.cos(tilt) * 0.4, 0, Math.sin(tilt) * 0.4)).normalize());
      g.applyMatrix4(new THREE.Matrix4().compose(top.clone().addScaledVector(dirv, len * 0.8 + off), q, V3(1, 1, 1)));
      paint(g, (p, n, c) => { const hh = clamp((p.y - top.y) / (0.03)); c.copy(plA).lerp(plB, 0.55 + 0.35 * sstep(0.0, 0.8, n.y + (R() - 0.5) * 0.0) + 0.1 * vnoise(p.x * 400, p.y * 400, p.z * 400, i)); c.multiplyScalar(0.8 + 0.25 * sstep(-0.9, 0.9, n.y)); });
      setAttr(g, 'wind', () => 1);
      return g;
    };
    list.push(pl(0.0170, 0.0036, 0.0, 0, 0), pl(0.0110, 0.0026, -0.0035, 2.2, 0), pl(0.0090, 0.0024, -0.0045, 4.4, 0));
  }
  for (let i = 0; i < nB; i++) {
    const [x0, z0] = rpos(), Ht = 0.11 + 0.07 * R();
    const a = R() * TAU, out = 0.018 + 0.03 * R(), ca = Math.cos(a), sa = Math.sin(a);
    const pts = [[x0, 0, z0], [x0 + ca * out * 0.12, Ht * 0.45, z0 + sa * out * 0.12], [x0 + ca * out * 0.45, Ht * 0.85, z0 + sa * out * 0.45], [x0 + ca * out, Ht * 0.98 - out * 0.7 * 0.5, z0 + sa * out]];
    const W = V3(-sa, 0, ca);
    blade(soup, pts, W, 0.0056, leafA.clone().multiplyScalar(0.8), leafB, { segs: 6, twist: (R() - 0.5) * 1.6, windBase: 0, windTip: 1, taper: 0.8, rib: hex(0xc3d07a), soft: 0.3 });
  }
  list.push(soup.geometry());
  const geometry = assemble(list, ['wind'], 0);
  shade(geometry, (p, n) => lerp(0.62, 1, sstep(0.0, 0.07, p.y)) * (0.92 + 0.08 * n.y));
  return { geometry };
}

/* ============================================================
 * 香蒲
 * ============================================================ */
export function cattail(seed = 1) {
  const R = mulberry32(seed * 1783 + 13);
  const list = [];
  const soup = new Soup(['wind']);
  const stemA = hex(0x6d8f3c), stemB = hex(0x9bad52), brown = hex(0x4b2d1b), brownLt = hex(0x6c4529), tip = hex(0xbfa862);
  const nS = 4 + Math.floor(R() * 3);
  for (let i = 0; i < nS; i++) {
    const a = R() * TAU, r = Math.sqrt(R()) * 0.014, x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const Ht = 0.115 + 0.04 * R(), la = R() * TAU, lm = 0.006 + 0.008 * R();
    const P = (t) => [x0 + Math.cos(la) * lm * t * t, Ht * t, z0 + Math.sin(la) * lm * t * t];
    const stem = tube([0, 0.33, 0.66, 1].map(P), [0.0009, 0.00085, 0.00075, 0.0007], { segs: 5, sub: 3, capN: 0, capS: 0.4, capE: 0.2, wind: (t) => t * 0.85 });
    paint(stem, (p, n, c, j) => c.copy(stemA).lerp(stemB, sstep(0.3, 1, ttOf(stem, j))));
    list.push(stem);
    const top = V3(...P(1)), dv = V3(...P(1)).sub(V3(...P(0.9))).normalize();
    const len = 0.028 + 0.008 * R(), rad = 0.0036 + 0.0004 * R();
    const sp = tube([[top.x, top.y - 0.002, top.z], [top.x + dv.x * len * 0.5, top.y + dv.y * len * 0.5, top.z + dv.z * len * 0.5], [top.x + dv.x * len, top.y + dv.y * len, top.z + dv.z * len]],
      (t) => { const e = Math.sin(Math.PI * clamp(t * 0.96 + 0.02, 0, 1)) ** 0.45; return [rad * e, rad * e]; }, { segs: 10, sub: 5, capN: 2, capS: 0.5, capE: 0.5, wind: (t) => 0.85 + 0.12 * t });
    paint(sp, (p, n, c, j) => { const t = ttOf(sp, j); c.copy(brown).lerp(brownLt, 0.5 * sstep(0.0, 0.8, n.y) + 0.25 * vnoise(p.x * 700, p.y * 700, p.z * 700, i)); c.multiplyScalar(0.9 + 0.2 * vnoise(p.x * 1200, p.y * 300, p.z * 1200, seed)); c.lerp(hex(0x2a1810), 0.25 * sstep(0.7, 1, t) * 0); });
    list.push(sp);
    const spike = tube([[top.x + dv.x * len * 0.95, top.y + dv.y * len * 0.95, top.z + dv.z * len * 0.95], [top.x + dv.x * (len + 0.012), top.y + dv.y * (len + 0.012), top.z + dv.z * (len + 0.012)]], [0.0007, 0.0003], { segs: 4, sub: 1, capN: 0, capS: 0, capE: 1.2, wind: () => 1 });
    solid(spike, tip); list.push(spike);
  }
  for (let i = 0; i < 9; i++) {
    const a = R() * TAU, r = Math.sqrt(R()) * 0.014, x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const Ht = 0.14 + 0.045 * R(), ba = R() * TAU, out = 0.012 + 0.03 * R(), ca = Math.cos(ba), sa = Math.sin(ba);
    const pts = [[x0, 0, z0], [x0 + ca * out * 0.08, Ht * 0.4, z0 + sa * out * 0.08], [x0 + ca * out * 0.4, Ht * 0.82, z0 + sa * out * 0.4], [x0 + ca * out, Ht * 0.98 - out * 0.15, z0 + sa * out]];
    blade(soup, pts, V3(-sa, 0, ca), 0.0070, hex(0x4f7d32), hex(0x9cb556), { segs: 6, twist: (R() - 0.5) * 1.8, windBase: 0, windTip: 1, taper: 0.8, rib: hex(0xb7cb6e) });
  }
  list.push(soup.geometry());
  const geometry = assemble(list, ['wind'], 0);
  shade(geometry, (p, n) => lerp(0.62, 1, sstep(0.0, 0.06, p.y)) * (0.92 + 0.08 * n.y));
  return { geometry };
}

/* ============================================================
 * 睡莲叶（可带花）
 * ============================================================ */
export function lilyPad(seed = 1, flower = false) {
  const R = mulberry32(seed * 4157 + 19);
  const soup = new Soup(['wind']);
  const RAD = 0.025, SP = 56, RN = 6;
  const notch = 0.36 + 0.14 * R(), a0 = R() * TAU;
  const leafA = hex(0x2f7a3c), leafB = hex(0x4f9b4b), leafC = hex(0x7fb56a), rimC = hex(0x6aa845), under = hex(0x6b3a52);
  const outR = (a) => RAD * (1 + 0.035 * (fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2, 1.3, seed, 2) - 0.5) * 2);
  const hAt = (r, a) => {
    const rho = r / RAD;
    return 0.0004 + 0.0004 * Math.sin(a * 3 + seed) * rho + 0.0012 * (fbm(Math.cos(a) * r * 90, Math.sin(a) * r * 90, seed, seed, 2) - 0.5) * rho + 0.0016 * sstep(0.78, 1.0, rho) ** 1.4 - 0.0005 * (1 - rho) * 0;
  };
  const vtx = (m, i) => {
    const a = a0 + notch / 2 + ((TAU - notch) * i) / (SP - 1), rho = m / RN, r = outR(a) * rho;
    const p = [Math.cos(a) * r, hAt(r, a), Math.sin(a) * r];
    const vein = i % 4 === 0 ? 1 : 0;
    const col = leafA.clone().lerp(leafB, 0.5 * (1 - rho) + 0.25 * fbm(p[0] * 120, p[2] * 120, seed, seed + 2, 2)).lerp(leafC, vein * 0.55 * sstep(0.08, 0.5, rho) * (1 - sstep(0.85, 1, rho) * 0.6));
    col.lerp(rimC, 0.5 * sstep(0.82, 1.0, rho)).multiplyScalar(0.92 + 0.12 * vnoise(p[0] * 300, p[2] * 300, seed, 5));
    return sv(p, col, { wind: 0 });
  };
  const centre = sv([0, 0.0004, 0], mixC(leafB, hex(0xd9e08a), 0.3), { wind: 0 });
  const o = { soft: 0.2, backCol: under };
  for (let i = 0; i < SP - 1; i++) soup.tri(centre, vtx(1, i), vtx(1, i + 1), o);
  for (let m = 1; m < RN; m++) for (let i = 0; i < SP - 1; i++) soup.quad(vtx(m, i), vtx(m + 1, i), vtx(m + 1, i + 1), vtx(m, i + 1), o);
  const list = [soup.geometry()];
  if (flower) {
    const fx = 0.004 * Math.cos(a0 + Math.PI), fz = 0.004 * Math.sin(a0 + Math.PI), y0 = 0.0030;
    const stem = tube([[fx, 0.0, fz], [fx, 0.0016, fz], [fx, y0 + 0.001, fz]], [0.0011, 0.0010, 0.0009], { segs: 5, sub: 2, capN: 0, capS: 0.3, capE: 0.3, wind: (t) => 0.5 * t });
    solid(stem, hex(0x5d8e3a)); list.push(stem);
    const ps = new Soup(['wind']);
    const layers = [{ n: 8, L: 0.0150, e: 0.18, w: 0.0062, off: 0.0016, up: 0.0 }, { n: 7, L: 0.0125, e: 0.52, w: 0.0056, off: 0.0012, up: 0.0014 }, { n: 6, L: 0.0098, e: 0.95, w: 0.0050, off: 0.0008, up: 0.0030 }];
    const pw = hex(0xfbf1f2), pp = hex(0xf2a3c3), pb = hex(0xf8dfa0);
    layers.forEach((ly, li) => {
      for (let i = 0; i < ly.n; i++) {
        const a = (i / ly.n) * TAU + li * 0.4 + (R() - 0.5) * 0.15, ca = Math.cos(a), sa = Math.sin(a);
        const dir = V3(ca, 0, sa), side = V3(-sa, 0, ca);
        const base = V3(fx, y0 + ly.up, fz).addScaledVector(dir, ly.off);
        const e1 = ly.e, e2 = ly.e + 0.55;
        const m = base.clone().addScaledVector(dir, Math.cos(e1) * ly.L * 0.55).add(V3(0, Math.sin(e1) * ly.L * 0.55, 0));
        const t = m.clone().addScaledVector(dir, Math.cos(e2) * ly.L * 0.45).add(V3(0, Math.sin(e2) * ly.L * 0.45, 0));
        const wv = (y) => ({ wind: 0.55 + 0.45 * clamp((y - y0) / 0.011) });
        const A = sv(base.clone().addScaledVector(side, -ly.w * 0.22), pb, wv(base.y)), B = sv(base.clone().addScaledVector(side, ly.w * 0.22), pb, wv(base.y));
        const M1 = sv(m.clone().addScaledVector(side, -ly.w * 0.5), mixC(pw, pp, 0.12 + 0.1 * li), wv(m.y)), M2 = sv(m.clone().addScaledVector(side, ly.w * 0.5), mixC(pw, pp, 0.12 + 0.1 * li), wv(m.y));
        const TP = sv(t, mixC(pw, pp, 0.7 - 0.12 * li), wv(t.y));
        const po = { ref: [-0.0, 0.2, 0.0], soft: 0.3, backMul: 0.92 };
        // 正面朝花心外侧：用径向法线参考
        po.ref = [dir.x * 0.4, 0.9, dir.z * 0.4];
        ps.tri(A, B, M2, po); ps.tri(A, M2, M1, po); ps.tri(M1, M2, TP, po);
      }
    });
    list.push(ps.geometry());
    const core = blob([0.0030, 0.0018, 0.0030], [fx, y0 + 0.0014, fz], [0, 0, 0], 9, 5);
    paint(core, (p, n, c) => c.copy(hex(0xf0bf2a)).lerp(hex(0xffe27a), 0.5 * sstep(0.2, 0.9, n.y)));
    setAttr(core, 'wind', () => 0.8); list.push(core);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, st = tube([[fx + Math.cos(a) * 0.0012, y0 + 0.001, fz + Math.sin(a) * 0.0012], [fx + Math.cos(a) * 0.0024, y0 + 0.0042, fz + Math.sin(a) * 0.0024]], [0.00035, 0.00028], { segs: 4, sub: 1, capN: 1, capS: 0, capE: 1.0, wind: () => 1 });
      solid(st, hex(0xf6cc3a)); list.push(st);
    }
  }
  const geometry = assemble(list, ['wind'], null);
  return { geometry };
}
