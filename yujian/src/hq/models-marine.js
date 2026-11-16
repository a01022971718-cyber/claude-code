// 《屿见》高画质版：程序化海洋生物与珊瑚（风格化写实）。
// 只依赖 three 与 BufferGeometryUtils；不使用 DOM / Math.random（随机数由 seed 决定，可复现）。
// 每个导出函数：(seed = 1, ...) => { geometry, parts?, anchors? }
//   geometry：非索引合并几何，带 position / normal / color（线性 RGB，已乘入烘焙 AO）+ 动画属性
//   bend：鱼/海豚/鲸，头 0 → 尾 1（按 z 线性）；rim/tent：水母；sway：海带/海扇/海葵/珊瑚（硬珊瑚为 0）
//   坐标：y 向上，头/正面朝 +z；游泳动物原点在身体中心，固着生物原点在底部中心（底面 y=0）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ============================================================
 * 基础：数学 / 噪声 / 随机
 * ============================================================ */
const hx = (h) => new THREE.Color(h);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
function sstep(a, b, x) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);
const fract = (x) => x - Math.floor(x);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngOf = (seed, salt = 0) => mulberry32(Math.floor(seed * 7919) + salt * 104729 + 12345);
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

/* ============================================================
 * 几何工具：参数网格（索引、不焊接）→ tidy（法线/极点/退化面）
 * ============================================================ */
function mkGrid(cols, rows, fn, wrap = true) {
  const pos = new Float32Array(cols * rows * 3), v = [0, 0, 0];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { fn(i, j, v); pos.set(v, (j * cols + i) * 3); }
  const idx = [], qi = wrap ? cols : cols - 1;
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < qi; i++) {
    const i1 = (i + 1) % cols;
    const a = j * cols + i, b = j * cols + i1, c = (j + 1) * cols + i, d = (j + 1) * cols + i1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.userData = { cols, rows, wrap };
  return g;
}
function flipIdx(g) {
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.index.needsUpdate = true;
}
/** 计算平滑法线、去掉零面积三角形、把收拢成一点的圈（极点）的法线取平均 */
function tidy(g) {
  const { cols, rows, wrap } = g.userData;
  g.computeVertexNormals();
  const P = g.attributes.position, ix = g.index.array, keep = [];
  const a = V3(), b = V3(), c = V3();
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(P, ix[i]); b.fromBufferAttribute(P, ix[i + 1]); c.fromBufferAttribute(P, ix[i + 2]);
    b.sub(a); c.sub(a);
    if (b.cross(c).lengthSq() > 1e-18) keep.push(ix[i], ix[i + 1], ix[i + 2]);
  }
  g.setIndex(keep);
  if (wrap) {
    const N = g.attributes.normal, s = V3();
    for (let j = 0; j < rows; j++) {
      const b0 = j * cols;
      let collapsed = true;
      for (let i = 1; i < cols; i++) {
        const dx = P.getX(b0 + i) - P.getX(b0), dy = P.getY(b0 + i) - P.getY(b0), dz = P.getZ(b0 + i) - P.getZ(b0);
        if (dx * dx + dy * dy + dz * dz > 1e-12) { collapsed = false; break; }
      }
      if (!collapsed) continue;
      s.set(0, 0, 0);
      for (let i = 0; i < cols; i++) s.add(a.fromBufferAttribute(N, b0 + i));
      if (s.lengthSq() < 1e-12) continue;
      s.normalize();
      for (let i = 0; i < cols; i++) N.setXYZ(b0 + i, s.x, s.y, s.z);
    }
  }
  return g;
}
/** 如果大部分三角形法线背离 center 则翻转（封闭体 / 穹顶用） */
function orientOut(g, cx = 0, cy = 0, cz = 0) {
  const P = g.attributes.position, ix = g.index.array;
  const a = V3(), b = V3(), d = V3(); let s = 0;
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(P, ix[i]); b.fromBufferAttribute(P, ix[i + 1]); d.fromBufferAttribute(P, ix[i + 2]);
    const cen = V3((a.x + b.x + d.x) / 3 - cx, (a.y + b.y + d.y) / 3 - cy, (a.z + b.z + d.z) / 3 - cz);
    b.sub(a); d.sub(a);
    s += b.cross(d).dot(cen);
  }
  if (s < 0) flipIdx(g);
}
/** 让开放曲面朝向 dir（平面薄片用） */
function faceDir(g, dir) {
  const N = g.attributes.normal; let s = 0;
  for (let i = 0; i < N.count; i++) s += N.getX(i) * dir.x + N.getY(i) * dir.y + N.getZ(i) * dir.z;
  if (s < 0) { flipIdx(g); g.computeVertexNormals(); }
}

const sp = (x, e) => (e === 1 ? x : Math.sign(x) * Math.pow(Math.abs(x), e));
/** 沿一串截面放样。frames: {c:Vector3,u,v:Vector3,ru,rv}；angles 为数量或角度数组（0 在 +u 方向）。 */
function loft(frames, colsOrAngles, e = 1) {
  const angles = Array.isArray(colsOrAngles) ? colsOrAngles : Array.from({ length: colsOrAngles }, (_, i) => (i / colsOrAngles) * TAU);
  const cols = angles.length;
  const g = mkGrid(cols, frames.length, (i, j, o) => {
    const f = frames[j], a = angles[i];
    const cu = sp(Math.cos(a), e) * f.ru, cv = sp(Math.sin(a), e) * f.rv;
    o[0] = f.c.x + f.u.x * cu + f.v.x * cv;
    o[1] = f.c.y + f.u.y * cu + f.v.y * cv;
    o[2] = f.c.z + f.u.z * cu + f.v.z * cv;
  });
  const m = frames[Math.floor(frames.length / 2)];
  const A = frames[frames.length - 1].c.clone().sub(frames[0].c);
  if (V3().crossVectors(m.u, m.v).dot(A) < 0) flipIdx(g);
  g.userData.angles = angles;
  return tidy(g);
}
/** 沿弯曲轴的肢体 / 枝条。rings: [s, 半弦宽, 半厚, 弦向偏移]；up 决定厚度方向参考。 */
function limb({ root, dir, up = Y, len, rings, bendVec = null, bendAmt = 0, cols = 8, e = 1, bendPow = 1.5 }) {
  const A0 = dir.clone().normalize();
  const bv = bendVec ? bendVec.clone() : V3();
  const dirAt = (s) => A0.clone().addScaledVector(bv, bendAmt * Math.pow(s, bendPow)).normalize();
  const frames = [], c = root.clone();
  let prevS = rings[0][0];
  for (let k = 0; k < rings.length; k++) {
    const [s, wc, ht, oc = 0] = rings[k];
    if (k > 0) { c.addScaledVector(dirAt((s + prevS) / 2), (s - prevS) * len); prevS = s; }
    const A = dirAt(s);
    const C = V3().crossVectors(up, A).normalize();
    const T = V3().crossVectors(A, C).normalize();
    frames.push({ c: c.clone().addScaledVector(C, oc), u: T, v: C, ru: ht, rv: wc });
  }
  const g = loft(frames, cols, e);
  g.userData.sArr = rings.map((r) => r[0]);
  return g;
}
/** 圆管：p0→p1 直线，半径 r0→r1（可多段） */
function tubeSeg(p0, p1, r0, r1, cols = 4, mids = 0) {
  const d = V3().subVectors(p1, p0), len = d.length();
  const rings = [];
  const n = mids + 1;
  for (let k = 0; k <= n; k++) { const s = k / n; const r = lerp(r0, r1, s); rings.push([s, r, r, 0]); }
  const up = Math.abs(d.y / (len || 1)) < 0.9 ? Y : X;
  return limb({ root: p0, dir: d, up, len, rings, cols });
}
function ellipsoid(rx, ry, rz, cols = 8, rows = 5) {
  const frames = [];
  for (let j = 0; j < rows; j++) {
    const a = (j / (rows - 1)) * Math.PI;
    frames.push({ c: V3(0, 0, rz * Math.cos(a)), u: Y, v: X, ru: ry * Math.sin(a), rv: rx * Math.sin(a) });
  }
  return loft(frames, cols);
}
/** 旋转体，profile=[[r,y],...]；tweak(a,j,o) 可改点 */
function lathe(profile, cols, tweak = null) {
  const g = mkGrid(cols, profile.length, (i, j, o) => {
    const a = (i / cols) * TAU, pr = profile[j];
    o[0] = Math.sin(a) * pr[0]; o[1] = pr[1]; o[2] = Math.cos(a) * pr[0];
    if (tweak) tweak(a, j, o, pr[0], pr[1]);
  });
  let my = 0; for (const p of profile) my += p[1];
  orientOut(g, 0, my / profile.length, 0);
  return tidy(g);
}
/** 薄片变成有厚度的双面片 */
function thin(g, t) {
  const A = g.index ? g.toNonIndexed() : g;
  const names = Object.keys(A.attributes);
  const n = A.attributes.position.count;
  const front = new THREE.BufferGeometry(), back = new THREE.BufferGeometry();
  for (const nm of names) {
    const src = A.attributes[nm], sz = src.itemSize;
    const fa = new Float32Array(n * sz), ba = new Float32Array(n * sz);
    for (let tri = 0; tri < n; tri += 3) {
      for (let v = 0; v < 3; v++) {
        const bv = v === 0 ? 0 : v === 1 ? 2 : 1;
        for (let k = 0; k < sz; k++) {
          fa[(tri + v) * sz + k] = src.array[(tri + v) * sz + k];
          ba[(tri + v) * sz + k] = src.array[(tri + bv) * sz + k];
        }
      }
    }
    front.setAttribute(nm, new THREE.BufferAttribute(fa, sz));
    back.setAttribute(nm, new THREE.BufferAttribute(ba, sz));
  }
  const fp = front.attributes.position, fn = front.attributes.normal, bp = back.attributes.position, bn = back.attributes.normal;
  for (let i = 0; i < n; i++) {
    fp.setXYZ(i, fp.getX(i) + fn.getX(i) * t, fp.getY(i) + fn.getY(i) * t, fp.getZ(i) + fn.getZ(i) * t);
    bp.setXYZ(i, bp.getX(i) - bn.getX(i) * t, bp.getY(i) - bn.getY(i) * t, bp.getZ(i) - bn.getZ(i) * t);
    bn.setXYZ(i, -bn.getX(i), -bn.getY(i), -bn.getZ(i));
  }
  return mergeGeometries([front, back], false);
}
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _t = new THREE.Vector3(), _s = new THREE.Vector3();
function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_t.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}

/* ---- 上色 / 属性 ---- */
function paintG(g, fn) {
  const P = g.attributes.position, N = g.attributes.normal, cols = g.userData.cols || 1;
  let C = g.attributes.color; const had = !!C;
  if (!had) { C = new THREE.BufferAttribute(new Float32Array(P.count * 3), 3); g.setAttribute('color', C); }
  const p = V3(), n = V3(), c = new THREE.Color();
  for (let k = 0; k < P.count; k++) {
    p.fromBufferAttribute(P, k); n.fromBufferAttribute(N, k);
    if (had) c.fromBufferAttribute(C, k); else c.setRGB(1, 1, 1);
    fn(p, n, c, k % cols, Math.floor(k / cols), k);
    C.setXYZ(k, c.r, c.g, c.b);
  }
  return g;
}
function shadeG(g, fn) {
  const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, cols = g.userData.cols || 1;
  const p = V3(), n = V3();
  for (let k = 0; k < P.count; k++) {
    p.fromBufferAttribute(P, k); n.fromBufferAttribute(N, k);
    const s = fn(p, n, k % cols, Math.floor(k / cols), k);
    C.setXYZ(k, C.getX(k) * s, C.getY(k) * s, C.getZ(k) * s);
  }
  return g;
}
function setAttr(g, name, fn) {
  const P = g.attributes.position, cols = g.userData.cols || 1, arr = new Float32Array(P.count), p = V3();
  for (let k = 0; k < P.count; k++) { p.fromBufferAttribute(P, k); arr[k] = fn(p, k % cols, Math.floor(k / cols), k); }
  g.setAttribute(name, new THREE.BufferAttribute(arr, 1));
  return g;
}
function displaceG(g, fn) {
  const P = g.attributes.position, N = g.attributes.normal, cols = g.userData.cols || 1, p = V3(), n = V3();
  for (let k = 0; k < P.count; k++) {
    p.fromBufferAttribute(P, k); n.fromBufferAttribute(N, k);
    const d = fn(p, n, k % cols, Math.floor(k / cols), k);
    P.setXYZ(k, p.x + n.x * d, p.y + n.y * d, p.z + n.z * d);
  }
  return tidy(g);
}
const mixC = (c, a, b, t) => c.copy(a).lerp(b, clamp(t));
const groundAO = (y, h = 0.05, k = 0.3) => 1 - k * (1 - sstep(0, h, y));

/** 合并：统一非索引，只保留 position/normal/color + attrs（缺的补 0） */
function assemble(parts, attrs = []) {
  const keep = new Set(['position', 'normal', 'color', ...attrs]);
  const list = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (!keep.has(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.color) throw new Error('part without color');
    for (const a of attrs) if (!g.attributes[a]) g.setAttribute(a, new THREE.BufferAttribute(new Float32Array(n), 1));
    g.clearGroups(); g.userData = {};
    return g;
  });
  const g = mergeGeometries(list, false);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}
function bbox(g) { g.computeBoundingBox(); return g.boundingBox; }
/** 统一缩放（及平移）整个几何，使某轴包围盒尺寸 = size */
function fitAxis(g, axis, size) {
  const b = bbox(g), k = size / (b.max[axis] - b.min[axis]);
  g.scale(k, k, k);
  return k;
}
function setBendZ(g) {
  const b = bbox(g), P = g.attributes.position, arr = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) arr[i] = clamp((b.max.z - P.getZ(i)) / (b.max.z - b.min.z));
  g.setAttribute('bend', new THREE.BufferAttribute(arr, 1));
}
function setSwayY(g, y0 = 0, y1 = null) {
  const b = bbox(g), P = g.attributes.position, arr = new Float32Array(P.count);
  const top = y1 === null ? b.max.y : y1;
  for (let i = 0; i < P.count; i++) arr[i] = clamp((P.getY(i) - y0) / (top - y0));
  g.setAttribute('sway', new THREE.BufferAttribute(arr, 1));
}

/* ============================================================
 * 鱼
 * ============================================================ */
// rings: [t(0 头→1 尾柄), 半高, 半宽, 中心 y]，z = 0.5 - t*lb
const FISH = {
  tang: {
    cols: 8, len: 0.06, lb: 0.78,
    rings: [[0, 0, 0, -0.012], [0.03, 0.04, 0.024, -0.014], [0.09, 0.09, 0.046, -0.005], [0.18, 0.155, 0.065, 0], [0.3, 0.19, 0.076, 0.005],
      [0.43, 0.205, 0.078, 0.01], [0.56, 0.185, 0.07, 0.01], [0.69, 0.14, 0.055, 0.005], [0.82, 0.085, 0.04, 0], [0.95, 0.05, 0.028, 0], [1.0, 0.042, 0.024, 0], [1.03, 0, 0, 0]],
    eye: { t: 0.11, r: 0.026 },
    dorsal: { t0: 0.17, t1: 0.9, hs: [0.55, 1, 0.95, 0.5], rise: 0.12, sweep: 0.05, c: [0xf0b000, 0xffe45a] },
    anal: { t0: 0.52, t1: 0.9, hs: [0.55, 1, 0.5], rise: 0.08, sweep: 0.04, c: [0xf0b000, 0xffe45a] },
    tail: { half: 0.046, lens: [0.21, 0.12, 0.12, 0.21], spread: 2.3, c: [0xf2b400, 0xffe86a] },
    pect: { t: 0.27, len: 0.1, drop: 0.03, c: [0xffd940, 0xfff0a8] },
    body(c, t, v, n) {
      mixC(c, hx(0xffd84a), hx(0xffc400), sstep(-0.9, 0.1, v));
      mixC(c, c, hx(0xefb000), sstep(0.35, 1.0, v) * 0.8);
      mixC(c, c, hx(0xd99a00), (1 - sstep(0.0, 0.07, t)) * 0.7);
      const spot = sstep(0.82, 0.88, t) * (1 - sstep(0.94, 0.99, t)) * (1 - sstep(0.4, 0.8, Math.abs(v))) * sstep(0.2, 0.6, Math.abs(n.x));
      mixC(c, c, hx(0xfff8e0), spot);
      return 1 - 0.18 * (1 - sstep(-1, -0.3, v)) * 0.5;
    },
  },
  blue: {
    cols: 8, len: 0.06, lb: 0.78,
    rings: [[0, 0, 0, -0.012], [0.03, 0.04, 0.024, -0.014], [0.09, 0.085, 0.044, -0.006], [0.18, 0.145, 0.062, 0], [0.3, 0.2, 0.074, 0.005],
      [0.43, 0.21, 0.078, 0.01], [0.56, 0.19, 0.07, 0.01], [0.69, 0.135, 0.054, 0.005], [0.82, 0.08, 0.038, 0], [0.95, 0.045, 0.026, 0], [1.0, 0.038, 0.022, 0], [1.03, 0, 0, 0]],
    eye: { t: 0.11, r: 0.025 },
    dorsal: { t0: 0.2, t1: 0.9, hs: [0.6, 1, 0.9, 0.5], rise: 0.1, sweep: 0.05, c: [0x1a3fb8, 0x0e1a60] },
    anal: { t0: 0.52, t1: 0.9, hs: [0.55, 1, 0.5], rise: 0.07, sweep: 0.04, c: [0x2d62d8, 0x15277a] },
    tail: { half: 0.04, lens: [0.25, 0.12, 0.12, 0.25], spread: 2.5, c: [0xffd020, 0xffe66a] },
    pect: { t: 0.27, len: 0.1, drop: 0.03, c: [0x3a70e0, 0xffe060] },
    body(c, t, v, n) {
      mixC(c, hx(0x3f82f4), hx(0x1b50dc), sstep(-0.9, 0.2, v));
      const vc = 0.3 + 0.5 * Math.sin(clamp((t - 0.2) / 0.72) * Math.PI);
      const m = (1 - sstep(0.2, 0.36, Math.abs(v - vc))) * sstep(0.18, 0.3, t) * (1 - sstep(0.9, 0.97, t));
      mixC(c, c, hx(0x070a24), m);
      mixC(c, c, hx(0xffd020), sstep(0.88, 0.97, t));
      return 1;
    },
  },
  clown: {
    cols: 6, len: 0.06, lb: 0.78,
    rings: [[0, 0, 0, -0.01], [0.05, 0.075, 0.07, -0.01], [0.14, 0.15, 0.115, 0], [0.2, 0.18, 0.125, 0.005], [0.245, 0.195, 0.128, 0.01], [0.29, 0.2, 0.128, 0.01],
      [0.37, 0.205, 0.125, 0.012], [0.44, 0.195, 0.12, 0.01], [0.485, 0.185, 0.115, 0.01], [0.53, 0.175, 0.108, 0.008], [0.62, 0.15, 0.092, 0.005],
      [0.72, 0.115, 0.07, 0.002], [0.77, 0.1, 0.062, 0], [0.82, 0.088, 0.055, 0], [0.9, 0.075, 0.048, 0], [0.97, 0.07, 0.044, 0], [1.03, 0, 0, 0]],
    eye: { t: 0.1, r: 0.03 },
    dorsal: { t0: 0.2, t1: 0.85, hs: [0.8, 1, 0.55], rise: 0.09, sweep: 0.03, c: [0xff6a10, 0x2a1208] },
    anal: { t0: 0.6, t1: 0.88, hs: [0.8, 0.8], rise: 0.05, sweep: 0.02, c: [0xff6a10, 0x2a1208] },
    tail: { half: 0.06, lens: [0.1, 0.18, 0.18, 0.1], spread: 1.35, c: [0xff7a18, 0x1a0c06] },
    pect: { t: 0.3, len: 0.09, drop: 0.03, c: [0xff7a18, 0xff9a40] },
    body(c, t, v) {
      c.copy(hx(0xff6410));
      mixC(c, c, hx(0xff8a2a), sstep(-1, -0.2, -v) * 0.25);
      let k = 0, w = 0;
      for (const cc of [0.245, 0.485, 0.77]) {
        const d = Math.abs(t - cc);
        w = Math.max(w, 1 - sstep(0.012, 0.035, d));
        k = Math.max(k, 1 - sstep(0.035, 0.075, d));
      }
      mixC(c, c, hx(0x150a05), k);
      mixC(c, c, hx(0xf8f4ec), w);
      return 1;
    },
  },
  sardine: {
    cols: 8, len: 0.045, lb: 0.8,
    rings: [[0, 0, 0, 0], [0.02, 0.03, 0.025, 0], [0.1, 0.066, 0.052, 0], [0.2, 0.088, 0.066, 0], [0.3, 0.095, 0.07, 0], [0.4, 0.095, 0.07, 0], [0.5, 0.088, 0.066, 0],
      [0.6, 0.078, 0.058, 0], [0.7, 0.062, 0.046, 0], [0.8, 0.048, 0.035, 0], [0.9, 0.036, 0.026, 0], [0.97, 0.03, 0.02, 0], [1.02, 0, 0, 0]],
    eye: { t: 0.08, r: 0.03 },
    dorsal: { t0: 0.38, t1: 0.55, hs: [0.7, 1, 0.4], rise: 0.085, sweep: 0.04, c: [0x3a6a78, 0x8fb0ba] },
    anal: { t0: 0.7, t1: 0.82, hs: [0.8, 0.5], rise: 0.04, sweep: 0.02, c: [0xb0c8d0, 0xd8e6ea] },
    tail: { half: 0.032, lens: [0.2, 0.1, 0.1, 0.2], spread: 2.7, c: [0x4a6e7a, 0x2a4450] },
    pect: { t: 0.2, len: 0.06, drop: 0.02, c: [0xc0d4da, 0xe6eff2] },
    body(c, t, v, n) {
      mixC(c, hx(0xf0f6f7), hx(0xa9c8d1), sstep(-1.0, 0.0, v));
      mixC(c, c, hx(0x2a808d), sstep(0.15, 0.75, v));
      let m = 0;
      for (const cc of [0.2, 0.4, 0.6, 0.8]) m = Math.max(m, 1 - sstep(0.02, 0.07, Math.abs(t - cc)));
      m *= sstep(0.25, 0.7, Math.abs(n.x)) * (1 - sstep(0.3, 0.7, Math.abs(v - 0.2)));
      mixC(c, c, hx(0x112c38), m * 0.85);
      return 1;
    },
  },
};
function envAt(R, t) {
  t = clamp(t, 0, 1.03);
  let k = 0; while (k < R.length - 2 && t > R[k + 1][0]) k++;
  const a = R[k], b = R[k + 1], f = clamp((t - a[0]) / (b[0] - a[0] || 1));
  return { hh: lerp(a[1], b[1], f), hw: lerp(a[2], b[2], f), cy: lerp(a[3], b[3], f) };
}
function finStrip(root, tip, cR, cT, thick) {
  const n = root.length;
  const g = mkGrid(n, 2, (i, j, o) => { const p = j ? tip[i] : root[i]; o[0] = p.x; o[1] = p.y; o[2] = p.z; }, false);
  tidy(g);
  paintG(g, (p, nn, c, i, j) => { c.copy(j ? cT : cR); });
  return thin(g, thick);
}
function fishBuild(key) {
  const S = FISH[key], LB = S.lb, R = S.rings;
  const zAt = (t) => 0.5 - t * LB;
  const frames = R.map(([t, hh, hw, cy]) => ({ c: V3(0, cy, zAt(t)), u: Y, v: X, ru: hh, rv: hw }));
  const body = loft(frames, S.cols);
  paintG(body, (p, n, c) => {
    const t = clamp((0.5 - p.z) / LB, 0, 1.03), e = envAt(R, t);
    const v = clamp((p.y - e.cy) / Math.max(e.hh, 0.02), -1.2, 1.2);
    const ao = S.body(c, t, v, n);
    c.multiplyScalar(ao);
  });
  const parts = [body];
  const EYE = hx(0x08080c);
  for (const s of [1, -1]) {
    const e = envAt(R, S.eye.t);
    const g = ellipsoid(S.eye.r * 0.6, S.eye.r, S.eye.r, 5, 3);
    place(g, s * e.hw * 0.86, e.cy + e.hh * 0.25, zAt(S.eye.t));
    paintG(g, (p, n, c) => c.copy(EYE));
    parts.push(g);
  }
  const TH = 0.0028;
  const fin = (F, sign) => {
    const n = F.hs.length, root = [], tip = [];
    for (let k = 0; k < n; k++) {
      const t = lerp(F.t0, F.t1, k / (n - 1)), e = envAt(R, t), z = zAt(t);
      const y = e.cy + sign * e.hh * 0.9;
      root.push(V3(0, y, z)); tip.push(V3(0, y + sign * F.rise * F.hs[k], z - F.sweep * F.hs[k]));
    }
    return finStrip(root, tip, hx(F.c[0]), hx(F.c[1]), TH);
  };
  parts.push(fin(S.dorsal, 1), fin(S.anal, -1));
  // 尾鳍
  {
    const T = S.tail, n = T.lens.length, ze = zAt(1.0) + 0.012, root = [], tip = [];
    for (let k = 0; k < n; k++) {
      const y = lerp(-T.half, T.half, k / (n - 1));
      root.push(V3(0, y, ze)); tip.push(V3(0, y * T.spread, ze - T.lens[k]));
    }
    parts.push(finStrip(root, tip, hx(T.c[0]), hx(T.c[1]), TH));
  }
  // 胸鳍
  for (const s of [1, -1]) {
    const P = S.pect, e = envAt(R, P.t), y0 = e.cy - e.hh * 0.25;
    const z1 = zAt(P.t - 0.03), z2 = zAt(P.t + 0.03);
    const root = [V3(s * e.hw * 0.9, y0 + 0.012, z1), V3(s * e.hw * 0.9, y0 - 0.012, z2)];
    const tip = [V3(s * (e.hw + P.len * 0.7), y0 + 0.01 - P.drop, z1 - P.len), V3(s * (e.hw + P.len * 0.7), y0 - 0.02 - P.drop, z1 - P.len * 0.8)];
    const g = finStrip(root, tip, hx(P.c[0]), hx(P.c[1]), TH);
    parts.push(g);
  }
  const g = assemble(parts, ['bend']);
  const b = bbox(g);
  const k = S.len / (b.max.z - b.min.z);
  g.scale(k, k, k);
  const b2 = bbox(g);
  g.translate(0, 0, -(b2.max.z + b2.min.z) / 2);
  setBendZ(g);
  return g;
}
export function fish(seed = 1, species = 'tang') {
  const key = FISH[species] ? species : 'tang';
  return { geometry: fishBuild(key) };
}

/* ============================================================
 * 海龟
 * ============================================================ */
const SC_SEEDS = [[0, 0.3], [0, 0.15], [0, 0], [0, -0.14], [0, -0.28], [0.2, 0.24], [0.2, 0.08], [0.2, -0.09], [0.2, -0.26],
  [-0.2, 0.24], [-0.2, 0.08], [-0.2, -0.09], [-0.2, -0.26]];
function turtleOutline(th) {
  const c = Math.cos(th), s = Math.sin(th);
  const a = 0.4 * (1 + 0.07 * c), b = c >= 0 ? 0.47 : 0.5;
  return (1 / Math.sqrt((s / a) ** 2 + (c / b) ** 2)) * (1 + 0.05 * Math.pow(Math.max(0, -c), 4));
}
export function turtle(seed = 1) {
  const rng = rngOf(seed, 3);
  const seeds = SC_SEEDS.map(([x, z]) => [x + (rng() - 0.5) * 0.02, z + (rng() - 0.5) * 0.02, rng()]);
  const COLS = 48, H = 0.2;
  const topU = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.78, 0.85, 0.91, 0.95, 0.98, 1.0];
  const prof = topU.map((u) => [u, H * Math.pow(Math.max(0, 1 - u * u), 0.4)]);
  prof.push([1.012, -0.03], [1.0, -0.055], [0.93, -0.078], [0.8, -0.098], [0.6, -0.112], [0.3, -0.12], [0, -0.123]);
  const TOPROWS = topU.length;
  const shell = lathe(prof, COLS, (a, j, o, r) => { const R = turtleOutline(a); o[0] = Math.sin(a) * r * R; o[2] = Math.cos(a) * r * R; });
  const OLIVE = hx(0x4d5326), BROWN = hx(0x80522a), SEAM = hx(0x1c2210), EDGE = hx(0xa89a58), MA = hx(0xb4a35c), MB = hx(0x8a7a3e);
  const CREAM = hx(0xe4d8a2), LIP = hx(0x8a8348);
  const info = (x, z) => {
    let f1 = 9, f2 = 9, id = 0;
    for (let k = 0; k < seeds.length; k++) {
      const d = Math.hypot(x - seeds[k][0], z - seeds[k][1]);
      if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
    }
    return { s: (f2 - f1) * 0.5, f1, id };
  };
  const scute = (p) => {
    const r = Math.hypot(p.x, p.z), th = Math.atan2(p.x, p.z), R = turtleOutline(th), u = r / R;
    let s, h, dk, ang = 0;
    if (u > 0.86) {
      const N = 26, a = fract(((th + TAU) % TAU) * N / TAU), sAng = Math.min(a, 1 - a) * (TAU / N) * r, sRad = (u - 0.86) * R;
      s = Math.min(sAng, sRad); h = hashId(Math.floor(((th + TAU) % TAU) * N / TAU));
    } else {
      const q = info(p.x, p.z); s = Math.min(q.s, (0.86 - u) * R); h = seeds[q.id][2];
      ang = Math.atan2(p.x - seeds[q.id][0], p.z - seeds[q.id][1]);
      s = Math.min(s, 9);
    }
    dk = 1 - sstep(0, 0.028, s);
    return { u, s, h, dk, ang };
  };
  function hashId(i) { return hash3(i, 3, 7, seed); }
  displaceG(shell, (p, n, i, j) => {
    if (j >= TOPROWS) return 0;
    const q = scute(p);
    return (-0.014 * q.dk + 0.007 * sstep(0.02, 0.09, q.s)) * (1 - sstep(0.93, 1.0, q.u));
  });
  paintG(shell, (p, n, c, i, j) => {
    if (j >= TOPROWS + 3) { mixC(c, CREAM, hx(0xc9bc82), sstep(0.2, 0.9, Math.hypot(p.x, p.z) / 0.4)); return; }
    if (j >= TOPROWS) { c.copy(LIP); return; }
    const q = scute(p);
    if (q.u > 0.86) {
      c.copy(q.h > 0.5 ? MA : MB);
      mixC(c, c, hx(0x5a4a22), 0.3 * vnoise(p.x * 9, p.z * 9, 1, seed));
    } else {
      const streak = 0.5 + 0.5 * Math.sin(q.ang * 7 + q.h * 20);
      const nz = fbm(p.x * 6 + q.h * 10, p.z * 6, 2, seed);
      mixC(c, OLIVE, BROWN, 0.1 + 0.5 * streak * sstep(0.02, 0.1, q.s) + 0.5 * nz * q.h);
      mixC(c, c, hx(0x6f7436), 0.35 * (1 - sstep(0.3, 0.6, nz)));
    }
    mixC(c, c, SEAM, q.dk * 0.85);
    mixC(c, c, EDGE, sstep(0.93, 0.995, q.u) * 0.3);
  });
  shadeG(shell, (p, n, i, j) => (j >= TOPROWS + 3 ? 0.78 : j >= TOPROWS ? 0.85 : 1 - 0.12 * sstep(0.94, 1.0, Math.hypot(p.x, p.z) / turtleOutline(Math.atan2(p.x, p.z)))));
  const bs = bbox(shell);
  const zc = (bs.max.z + bs.min.z) / 2, K = 0.14 / (bs.max.z - bs.min.z);

  // 头
  const hr = [[0.715, -0.03, 0, 0], [0.703, -0.03, 0.016, 0.02], [0.675, -0.03, 0.038, 0.044], [0.635, -0.025, 0.058, 0.062], [0.585, -0.02, 0.067, 0.07],
    [0.53, -0.025, 0.064, 0.066], [0.47, -0.03, 0.06, 0.062], [0.4, -0.035, 0.06, 0.06]];
  const head = loft(hr.map(([z, cy, ru, rv]) => ({ c: V3(0, cy, z), u: Y, v: X, ru: ru * 1.25, rv: rv * 1.25 })), 12);
  paintG(head, (p, n, c) => {
    const k = sstep(-0.6, 0.3, n.y);
    mixC(c, hx(0xd8cc8e), hx(0x6a5b2c), k);
    mixC(c, c, hx(0xbaa85a), (1 - Math.abs(n.y)) * 0.3);
    c.multiplyScalar(0.8 + 0.3 * fbm(p.x * 40, p.y * 40, p.z * 40, seed));
    c.multiplyScalar(0.7 + 0.3 * sstep(0.4, 0.55, p.z));
  });
  const eyes = [];
  for (const s of [1, -1]) {
    const g = ellipsoid(0.01, 0.014, 0.014, 6, 4); place(g, s * 0.062, -0.005, 0.615);
    paintG(g, (p, n, c) => c.set(0x07070a));
    eyes.push(g);
  }
  const headG = assemble([head, ...eyes]);

  // 鳍
  const FLIP = hx(0x363c1c), FLIPLT = hx(0xc9b86a), UND = hx(0xdccf92);
  const flipPaint = (g, rootDark) => paintG(g, (p, n, c, i, j) => {
    const s = g.userData.sArr[j];
    mixC(c, FLIP, hx(0x7a5a2a), 0.5 * fbm(p.x * 25, p.y * 25, p.z * 25, seed));
    mixC(c, c, FLIPLT, 1 - sstep(0.1, 0.8, Math.abs(n.y)) + 0.0);
    mixC(c, c, UND, sstep(-0.1, -0.7, n.y));
    c.multiplyScalar(rootDark ? 0.55 + 0.45 * sstep(0, 0.3, s) : 1);
  });
  const mkFlip = (side, front) => {
    const upv = side > 0 ? Y : V3(0, -1, 0);
    let g, pivot;
    if (front) {
      pivot = V3(side * 0.28, -0.04, 0.2);
      g = limb({
        root: pivot, dir: V3(side * 0.85, -0.2, -0.4), up: upv, len: 0.55, cols: 10, bendVec: V3(0, 0.25, -0.5), bendAmt: 0.9,
        rings: [[0, 0.09, 0.05, 0], [0.1, 0.115, 0.04, 0.01], [0.25, 0.125, 0.032, 0.025], [0.45, 0.115, 0.027, 0.025], [0.65, 0.09, 0.022, 0.022], [0.82, 0.058, 0.016, 0.016], [0.94, 0.025, 0.009, 0.01], [1, 0, 0, 0]],
      });
    } else {
      pivot = V3(side * 0.22, -0.05, -0.36);
      g = limb({
        root: pivot, dir: V3(side * 0.55, -0.05, -0.85), up: upv, len: 0.26, cols: 8,
        rings: [[0, 0.05, 0.035, 0], [0.15, 0.075, 0.028, 0.005], [0.4, 0.08, 0.02, 0.01], [0.65, 0.066, 0.015, 0.01], [0.85, 0.042, 0.011, 0.006], [0.96, 0.015, 0.006, 0], [1, 0, 0, 0]],
      });
    }
    flipPaint(g, true);
    return { g, pivot };
  };
  const fl = { FL: mkFlip(1, true), FR: mkFlip(-1, true), BL: mkFlip(1, false), BR: mkFlip(-1, false) };
  // FL = +x 侧
  const tail = limb({ root: V3(0, -0.04, -0.46), dir: V3(0, -0.1, -1), len: 0.12, cols: 6, rings: [[0, 0.035, 0.035, 0], [0.5, 0.025, 0.025, 0], [1, 0, 0, 0]] });
  paintG(tail, (p, n, c) => c.copy(hx(0x5a5a2c)));

  const bodyG = assemble([shell, tail]);
  const finish = (g) => { g.translate(0, 0, -zc); g.scale(K, K, K); return g; };
  const fin = {};
  for (const k of Object.keys(fl)) fin[k] = finish(assemble([fl[k].g]));
  finish(bodyG); finish(headG);
  const pv = (v) => [v.x, v.y, v.z - zc].map((q) => q * K);
  const parts = {
    body: { geometry: bodyG, pivot: [0, 0, 0] },
    head: { geometry: headG, pivot: pv(V3(0, -0.03, 0.42)) },
    flipperFL: { geometry: fin.FL, pivot: pv(fl.FL.pivot) },
    flipperFR: { geometry: fin.FR, pivot: pv(fl.FR.pivot) },
    flipperBL: { geometry: fin.BL, pivot: pv(fl.BL.pivot) },
    flipperBR: { geometry: fin.BR, pivot: pv(fl.BR.pivot) },
  };
  const geometry = mergeGeometries(Object.values(parts).map((p) => p.geometry), false);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, parts };
}

/* ============================================================
 * 海豚
 * ============================================================ */
function foilHalf(side, root, hs, chordFn, thick, sweepFn, rise, cols = 8, nR = 9, serr = null) {
  const rings = [];
  for (let k = 0; k < nR; k++) {
    const s = k / (nR - 1);
    if (k === nR - 1) { rings.push([1, 0, 0, 0]); continue; }
    const sc = Math.min(s, 0.97);
    let ch = chordFn(sc), le = sweepFn(sc), te = le + ch;
    if (serr) te += serr(sc);
    rings.push([s, (te - le) / 2, thick(sc), (te + le) / 2]);
  }
  // oc 沿 C（向后）为正
  return limb({ root, dir: V3(side, 0, 0), up: side > 0 ? Y : V3(0, -1, 0), len: hs, rings, bendVec: V3(0, 1, 0), bendAmt: rise, cols });
}
export function dolphin(seed = 1) {
  const LB = 0.88, zAt = (t) => 0.5 - t * LB;
  const R = [[0, 0, 0, -0.018], [0.012, 0.01, 0.011, -0.019], [0.05, 0.021, 0.025, -0.02], [0.1, 0.028, 0.033, -0.021], [0.14, 0.036, 0.04, -0.016],
    [0.18, 0.062, 0.054, -0.003], [0.24, 0.088, 0.07, 0.006], [0.32, 0.108, 0.082, 0.01], [0.42, 0.118, 0.088, 0.012], [0.52, 0.114, 0.084, 0.01],
    [0.62, 0.096, 0.07, 0.005], [0.72, 0.072, 0.052, 0], [0.82, 0.05, 0.036, -0.002], [0.91, 0.036, 0.022, -0.003], [0.97, 0.03, 0.016, -0.003], [1.01, 0, 0, -0.003]];
  const body = loft(R.map(([t, hh, hw, cy]) => ({ c: V3(0, cy, zAt(t)), u: Y, v: X, ru: hh, rv: hw })), 20);
  const BELLY = hx(0xe9eff0), LOW = hx(0xb4c3cc), UP = hx(0x7f98a8), BACK = hx(0x4b6274);
  paintG(body, (p, n, c) => {
    const t = (0.5 - p.z) / LB;
    const k = n.y * 0.5 + 0.5 + 0.06 * Math.sin(t * 5);
    mixC(c, BELLY, LOW, sstep(0.22, 0.42, k));
    mixC(c, c, UP, sstep(0.42, 0.62, k));
    mixC(c, c, BACK, sstep(0.68, 0.9, k));
    mixC(c, c, hx(0xd4dde0), (1 - sstep(0.1, 0.16, t)) * 0.3);
  });
  shadeG(body, (p, n) => 1 - 0.1 * (1 - sstep(-0.9, -0.3, n.y)) * sstep(0.6, 0.95, (0.5 - p.z) / LB));
  const FINC = hx(0x41556a), FINU = hx(0x8a9ba8);
  const finPaint = (g) => paintG(g, (p, n, c) => { mixC(c, FINU, FINC, sstep(-0.3, 0.4, n.y)); });
  const parts = [body];
  // 眼
  for (const s of [1, -1]) {
    const g = ellipsoid(0.005, 0.007, 0.007, 6, 4); place(g, s * 0.056, 0.012, zAt(0.2));
    paintG(g, (p, n, c) => c.set(0x0b0e12)); parts.push(g);
  }
  // 背鳍
  {
    const g = limb({
      root: V3(0, 0.1, zAt(0.5) + 0.02), dir: V3(0, 1, -0.5), up: X, len: 0.115, cols: 8, bendVec: V3(0, 0, -1), bendAmt: 0.55,
      rings: [[0, 0.06, 0.016, 0], [0.15, 0.056, 0.014, 0], [0.4, 0.045, 0.011, 0], [0.65, 0.032, 0.008, 0], [0.85, 0.018, 0.005, 0], [0.96, 0.007, 0.003, 0], [1, 0, 0, 0]],
    });
    finPaint(g); parts.push(g);
  }
  // 胸鳍
  for (const s of [1, -1]) {
    const g = limb({
      root: V3(s * 0.07, -0.075, zAt(0.28)), dir: V3(s * 0.6, -0.55, -0.55), up: s > 0 ? Y : V3(0, -1, 0), len: 0.15, cols: 8, bendVec: V3(0, 0, -1), bendAmt: 0.6,
      rings: [[0, 0.03, 0.012, 0], [0.12, 0.04, 0.01, 0.006], [0.35, 0.042, 0.008, 0.01], [0.6, 0.034, 0.006, 0.012], [0.82, 0.02, 0.004, 0.01], [0.95, 0.007, 0.002, 0.005], [1, 0, 0, 0]],
    });
    finPaint(g); parts.push(g);
  }
  // 尾鳍（水平）
  for (const s of [1, -1]) {
    const g = foilHalf(s, V3(0, -0.003, zAt(0.97)), 0.135,
      (u) => 0.02 + 0.07 * Math.pow(1 - Math.pow(u, 1.6), 0.9) * (0.65 + 0.35 * sstep(0, 0.25, u)),
      (u) => 0.014 * (1 - u * 0.8), (u) => 0.07 * Math.pow(u, 1.3), 0.08, 8, 9);
    finPaint(g); parts.push(g);
  }
  const g = assemble(parts, ['bend']);
  fitAxis(g, 'z', 0.32);
  const b = bbox(g); g.translate(0, 0, -(b.max.z + b.min.z) / 2);
  setBendZ(g);
  return { geometry: g };
}

/* ============================================================
 * 座头鲸
 * ============================================================ */
export function whale(seed = 1) {
  const rng = rngOf(seed, 5);
  const LB = 0.84, zAt = (t) => 0.5 - t * LB;
  const R = [[0, 0, 0, -0.012], [0.015, 0.02, 0.032, -0.015], [0.05, 0.045, 0.068, -0.017], [0.1, 0.068, 0.09, -0.013], [0.17, 0.088, 0.103, -0.008],
    [0.26, 0.106, 0.113, -0.002], [0.38, 0.118, 0.118, 0.003], [0.5, 0.12, 0.116, 0.005], [0.62, 0.108, 0.103, 0.005], [0.72, 0.086, 0.082, 0.006],
    [0.81, 0.062, 0.058, 0.008], [0.89, 0.043, 0.038, 0.01], [0.95, 0.032, 0.026, 0.01], [0.985, 0.026, 0.02, 0.01], [1.01, 0, 0, 0.01]];
  // 腹部加密的角度表
  const angles = [], bstep = (2.5 / 28);
  const outer = (Math.PI - 1.25) / 9;
  for (let m = 0; m < 9; m++) angles.push(m * outer);
  for (let k = -14; k <= 14; k++) angles.push(Math.PI + k * bstep);
  for (let m = 0; m < 9; m++) angles.push(Math.PI + 1.25 + m * outer);
  const body = loft(R.map(([t, hh, hw, cy]) => ({ c: V3(0, cy, zAt(t)), u: Y, v: X, ru: hh, rv: hw })), angles, 0.9);
  const pleatW = (t) => sstep(0.04, 0.12, t) * (1 - sstep(0.52, 0.66, t));
  displaceG(body, (p, n, i) => {
    if (i < 9 || i > 37) return 0;
    const t = (0.5 - p.z) / LB;
    return ((i - 9) % 2 ? -0.0038 : 0.0022) * pleatW(t);
  });
  const DORS = hx(0x1f2b39), FLK = hx(0x34465a), PL = hx(0xd2dae0), PD = hx(0x4a5b6d), PLAIN = hx(0x8f9dac);
  paintG(body, (p, n, c, i) => {
    const t = (0.5 - p.z) / LB, a = angles[i], at = Math.min(a, TAU - a);
    mixC(c, DORS, FLK, sstep(0.3, 1.8, at));
    mixC(c, c, hx(0x4d6074), 0.5 * (fbm(p.x * 12, p.y * 12, p.z * 8, seed) - 0.4));
    const wB = sstep(1.7, 2.3, at);
    const par = (i - 9) % 2 ? 1 : 0;
    const pc = new THREE.Color().copy(par ? PL : PD);
    mixC(pc, pc, PLAIN, 1 - pleatW(t));
    mixC(pc, pc, hx(0xeef2f4), sstep(0.62, 0.9, fbm(p.x * 10, p.y * 10, p.z * 10, seed + 5)) * 0.8);
    mixC(c, c, pc, wB);
    mixC(c, c, hx(0x9aa6b2), (1 - sstep(0.0, 0.1, t)) * 0.2);
  });
  shadeG(body, (p, n) => 1 - 0.12 * (1 - sstep(-0.8, 0.2, n.y)));
  const parts = [body];
  // 头部结节
  for (let k = 0; k < 14; k++) {
    const t = 0.02 + rng() * 0.14, e = envAt(R, t);
    const x = (rng() - 0.5) * e.hw * (k < 8 ? 0.7 : 1.7);
    const y = e.cy + e.hh * Math.sqrt(Math.max(0.05, 1 - (x / e.hw) ** 2));
    const g = ellipsoid(0.013, 0.012, 0.013, 8, 5); place(g, x, y - 0.004, zAt(t));
    paintG(g, (p, n, c) => c.copy(hx(0x7c8994)));
    parts.push(g);
  }
  for (const s of [1, -1]) {
    const g = ellipsoid(0.006, 0.008, 0.008, 6, 4); place(g, s * 0.093, 0.0, zAt(0.2));
    paintG(g, (p, n, c) => c.set(0x10151c)); parts.push(g);
    // 眼周
  }
  // 背小驼峰
  {
    const g = limb({
      root: V3(0, 0.108, zAt(0.72)), dir: V3(0, 1, -0.7), up: X, len: 0.032, cols: 8,
      rings: [[0, 0.05, 0.028, 0], [0.4, 0.034, 0.018, 0], [0.8, 0.015, 0.009, 0], [1, 0, 0, 0]],
    });
    paintG(g, (p, n, c) => c.copy(DORS)); parts.push(g);
  }
  // 超长胸鳍
  const WHITE = hx(0xeaf0f3);
  for (const s of [1, -1]) {
    const rings = [];
    const nR = 14;
    for (let k = 0; k < nR; k++) {
      const u = k / (nR - 1);
      if (k === nR - 1) { rings.push([1, 0, 0, 0]); continue; }
      const base = [0.03, 0.036, 0.036, 0.03, 0.02, 0.01][Math.min(5, Math.floor(u * 5.4))];
      const w = lerp(0.03, 0.036, sstep(0, 0.15, u)) * (1 - 0.7 * sstep(0.35, 0.95, u)) + 0.002;
      const m = 0.18 * (0.5 + 0.5 * Math.sin(u * TAU * 4)) * sstep(0.1, 0.5, u);
      const th = 0.014 * (1 - 0.8 * u) + 0.002;
      rings.push([u, w * (1 + m / 2), th, 0.008 * Math.sin(u * 3) - w * m / 2 * 0 - w * m / 2]);
      void base;
    }
    const g = limb({ root: V3(s * 0.095, -0.06, zAt(0.3)), dir: V3(s * 0.9, -0.4, -0.35), up: s > 0 ? Y : V3(0, -1, 0), len: 0.3, rings, cols: 8, bendVec: V3(0, 0.1, -1), bendAmt: 0.6 });
    paintG(g, (p, n, c, i, j) => {
      const u = g.userData.sArr[j];
      mixC(c, hx(0xf2f6f8), hx(0xd6dee4), sstep(0.2, -0.8, n.y) * 0.5);
      mixC(c, c, hx(0x55677a), (1 - sstep(0.05, 0.3, u)) * 0.9 + 0.3 * sstep(0.1, 0.5, n.y) * sstep(0.55, 0.62, vnoise(p.x * 14, p.y * 14, p.z * 14, seed)));
    });
    parts.push(g);
  }
  // 尾鳍
  for (const s of [1, -1]) {
    const g = foilHalf(s, V3(0, 0.008, zAt(0.985)), 0.16,
      (u) => 0.03 + 0.1 * Math.pow(1 - Math.pow(u, 1.7), 0.9) * (0.7 + 0.3 * sstep(0, 0.2, u)),
      (u) => 0.022 * (1 - u * 0.75), (u) => 0.06 * Math.pow(u, 1.3), 0.3, 8, 15,
      (u) => 0.008 * Math.sin(u * TAU * 3.5) * sstep(0.1, 0.5, u));
    paintG(g, (p, n, c) => {
      const w = fbm(p.x * 9, p.y * 9, p.z * 9, seed + 9);
      if (n.y > 0.05) { mixC(c, DORS, hx(0x2e3e50), 0.5); return; }
      mixC(c, hx(0xf0f4f6), hx(0x2b3744), sstep(0.5, 0.62, w) * 0.85 * sstep(-0.3, -0.8, n.y));
      mixC(c, c, hx(0x2b3744), 0.35 * (1 - sstep(0.2, 0.9, Math.abs(p.x) / 0.16)) * sstep(-0.1, -0.5, n.y));
    });
    parts.push(g);
  }
  void WHITE;
  const g = assemble(parts, ['bend']);
  fitAxis(g, 'z', 1.6);
  const b = bbox(g); g.translate(0, 0, -(b.max.z + b.min.z) / 2);
  setBendZ(g);
  return { geometry: g };
}

/* ============================================================
 * 水母
 * ============================================================ */
export function jelly(seed = 1) {
  const rng = rngOf(seed, 7);
  const outer = [[0, 0.33], [0.08, 0.327], [0.16, 0.315], [0.24, 0.29], [0.32, 0.25], [0.39, 0.195], [0.44, 0.13], [0.475, 0.075], [0.495, 0.035], [0.5, 0.018]];
  const inner = [[0.495, 0.005], [0.45, 0.03], [0.4, 0.08], [0.32, 0.13], [0.22, 0.165], [0.11, 0.18], [0, 0.185]];
  const prof = outer.concat(inner);
  const bellY = (r) => {
    for (let k = 0; k < outer.length - 1; k++) if (r <= outer[k + 1][0]) return lerp(outer[k][1], outer[k + 1][1], (r - outer[k][0]) / (outer[k + 1][0] - outer[k][0]));
    return outer[outer.length - 1][1];
  };
  const NO = outer.length;
  const bell = lathe(prof, 40, (a, j, o, r, y) => {
    const f = sstep(0.43, 0.5, r) * (j < NO ? 1 : 0.6);
    const lobe = 0.5 + 0.5 * Math.cos(a * 8);
    const rr = r * (1 + 0.02 * (lobe - 0.5) * f * 2);
    o[0] = Math.sin(a) * rr; o[2] = Math.cos(a) * rr; o[1] = y - 0.016 * lobe * f;
  });
  const BC = hx(0xd6dff5), BT = hx(0xb4c3f0), BR = hx(0xb7a2e8), BI = hx(0xece6fb);
  paintG(bell, (p, n, c, i, j) => {
    const r = Math.hypot(p.x, p.z) / 0.5;
    if (j < NO) { mixC(c, BT, BC, sstep(0, 0.5, r)); mixC(c, c, BR, sstep(0.75, 1, r) * 0.8); }
    else { mixC(c, BI, BR, sstep(0.6, 1, r) * 0.7); c.multiplyScalar(0.85 + 0.15 * sstep(0, 0.4, r)); }
  });
  setAttr(bell, 'rim', (p) => clamp(Math.hypot(p.x, p.z) / 0.5));
  const parts = [bell];
  // 生殖腺：四个马蹄形环
  for (let k = 0; k < 4; k++) {
    const phi = Math.PI / 4 + k * Math.PI / 2, rc = 0.2, rho = 0.1;
    const cx = Math.sin(phi) * rc, cz = Math.cos(phi) * rc, toC = Math.atan2(-cz, -cx);
    const N = 14, frames = [];
    for (let m = 0; m < N; m++) {
      const psi = toC + 0.55 + (m / (N - 1)) * (TAU - 1.1);
      const x = cx + Math.cos(psi) * rho, z = cz + Math.sin(psi) * rho, r = Math.hypot(x, z);
      const y = bellY(r) + 0.003;
      const sl = (bellY(r + 0.01) - bellY(Math.max(0, r - 0.01))) / 0.02;
      const rh = V3(x / (r || 1), 0, z / (r || 1));
      const nrm = V3().copy(rh).multiplyScalar(-sl).add(Y).normalize();
      const tan = V3(-Math.sin(psi), 0, Math.cos(psi));
      const rad = 0.012 * Math.sin(Math.PI * clamp(m / (N - 1))) ** 0.5;
      frames.push({ c: V3(x, y, z), u: nrm, v: V3().crossVectors(tan, nrm).normalize(), ru: Math.max(rad * 0.8, 0), rv: rad });
    }
    const g = loft(frames, 5);
    paintG(g, (p, n, c) => c.copy(hx(0xf3a3c6)));
    setAttr(g, 'rim', (p) => clamp(Math.hypot(p.x, p.z) / 0.5));
    parts.push(g);
  }
  // 缘触手
  const NT = 56;
  for (let k = 0; k < NT; k++) {
    const th = (k / NT) * TAU + (rng() - 0.5) * 0.05, L = 0.13 + rng() * 0.07;
    const root = V3(Math.sin(th) * 0.497, 0.012, Math.cos(th) * 0.497);
    const r0 = 0.0055;
    const g = limb({
      root, dir: V3(Math.sin(th) * 0.25, -1, Math.cos(th) * 0.25), up: X, len: L, cols: 3, bendVec: V3((rng() - 0.5) * 1.2, 0, (rng() - 0.5) * 1.2), bendAmt: 0.5,
      rings: [[0, r0, r0, 0], [0.35, r0 * 0.85, r0 * 0.85, 0], [0.7, r0 * 0.6, r0 * 0.6, 0], [1, 0, 0, 0]],
    });
    paintG(g, (p, n, c, i, j) => { mixC(c, hx(0xbdaef0), hx(0xeae2fb), j / 3); });
    setAttr(g, 'rim', () => 1); setAttr(g, 'tent', (p, i, j) => j / 3);
    parts.push(g);
  }
  // 口腕
  for (let k = 0; k < 4; k++) {
    const phi = Math.PI / 4 + k * Math.PI / 2 + (rng() - 0.5) * 0.2;
    const rh = V3(Math.sin(phi), 0, Math.cos(phi)), tg = V3(-rh.z, 0, rh.x);
    const NR = 12, L = 0.9 + rng() * 0.15, ph = rng() * TAU;
    const g = mkGrid(3, NR, (i, j, o) => {
      const s = j / (NR - 1);
      const base = V3(rh.x * 0.06, 0.17, rh.z * 0.06);
      const sway = 0.04 * Math.sin(s * 7 + ph) * s;
      const c0 = base.clone().addScaledVector(rh, 0.06 * s).addScaledVector(tg, sway).add(V3(0, -s * L, 0));
      const w = 0.04 * (1 - 0.55 * s) * (0.8 + 0.35 * Math.sin(s * 21 + ph));
      const e = i - 1;
      c0.addScaledVector(tg, e * w).addScaledVector(rh, (e === 0 ? -0.012 : 0.01 * Math.sin(s * 17 + e * 2)));
      o[0] = c0.x; o[1] = c0.y; o[2] = c0.z;
    }, false);
    tidy(g);
    paintG(g, (p, n, c, i, j) => { mixC(c, hx(0xf1e4f4), hx(0xe4bfe2), j / (NR - 1)); if (i !== 1) mixC(c, c, hx(0xd6a3e2), 0.5); });
    setAttr(g, 'rim', () => 1); setAttr(g, 'tent', (p, i, j) => j / (NR - 1));
    parts.push(thin(g, 0.004));
  }
  const g = assemble(parts, ['rim', 'tent']);
  const k = fitAxis(g, 'x', 0.06);
  void k;
  g.translate(0, -0.02 * 0.06, 0);
  return { geometry: g };
}

/* ============================================================
 * 珊瑚
 * ============================================================ */
const CORAL_PAL = {
  pink: [0x9a3a62, 0xe0709a, 0xfbd0e0], purple: [0x5e2f8e, 0x9a5bd0, 0xe0c4f8], orange: [0xb24a14, 0xee8a2a, 0xffdc90],
};
export function branchCoral(seed = 1, color = 'pink') {
  const rng = rngOf(seed, 11);
  const pal = (CORAL_PAL[color] || CORAL_PAL.pink).map(hx);
  const segs = [];
  const MAXD = 4;
  const rot = (d, ang, az) => {
    const a = Math.abs(d.y) < 0.95 ? Y : X;
    const p1 = V3().crossVectors(d, a).normalize(), p2 = V3().crossVectors(d, p1).normalize();
    const ax = p1.clone().multiplyScalar(Math.cos(az)).addScaledVector(p2, Math.sin(az));
    return d.clone().applyAxisAngle(ax, ang);
  };
  function grow(p, d, len, r, depth) {
    const r1 = r * 0.62;
    const bendV = V3((rng() - 0.5) * 0.5, 0.7, (rng() - 0.5) * 0.5);
    const seg = { p: p.clone(), d: d.clone(), len, r, depth, bendV, terminal: false };
    segs.push(seg);
    const at = (s) => {
      const pp = p.clone(), dd = d.clone();
      const N = 8;
      for (let k = 0; k < N * s; k++) { const sk = (k + 0.5) / N; const dir = d.clone().addScaledVector(bendV, 0.5 * sk).normalize(); pp.addScaledVector(dir, len / N); dd.copy(dir); }
      return { p: pp, d: dd };
    };
    if (depth >= MAXD) { seg.terminal = true; return; }
    const e = at(0.88);
    const nc = depth === 0 ? 3 : (rng() < 0.18 && depth < 3 ? 3 : 2);
    const az0 = rng() * TAU;
    for (let k = 0; k < nc; k++) {
      const ang = 0.45 + rng() * 0.45;
      let nd = rot(e.d, ang, az0 + (k / nc) * TAU + (rng() - 0.5) * 0.6);
      nd.addScaledVector(Y, 0.25).normalize();
      grow(e.p, nd, len * (0.9 + rng() * 0.15), r1 * 0.9, depth + 1);
    }
    if (depth >= 1 && depth < MAXD - 1 && rng() < 0.45) {
      const m = at(0.5);
      let nd = rot(m.d, 0.9 + rng() * 0.4, rng() * TAU); nd.addScaledVector(Y, 0.3).normalize();
      grow(m.p, nd, len * 0.6, r * 0.5, depth + 1);
    }
  }
  grow(V3(0, 0.02, 0), V3((rng() - 0.5) * 0.1, 1, (rng() - 0.5) * 0.1), 0.14, 0.036, 0);
  const parts = [];
  // 基座
  {
    const g = lathe([[0, 0], [0.085, 0], [0.07, 0.015], [0.05, 0.035], [0.04, 0.05]], 10);
    paintG(g, (p, n, c) => c.copy(pal[0]).multiplyScalar(0.6));
    parts.push(g);
  }
  const SH = 1.0;
  for (const sg of segs) {
    const rings = [[0, sg.r, sg.r], [0.35, lerp(sg.r, sg.r * 0.62, 0.35), lerp(sg.r, sg.r * 0.62, 0.35)], [0.7, lerp(sg.r, sg.r * 0.62, 0.7), lerp(sg.r, sg.r * 0.62, 0.7)],
      [0.92, sg.r * 0.55, sg.r * 0.55], [1, 0, 0]];
    const cols = sg.depth <= 1 ? 7 : sg.depth === 2 ? 6 : 5;
    const g = limb({ root: sg.p, dir: sg.d, up: Math.abs(sg.d.y) < 0.9 ? Y : X, len: sg.len, rings, cols, bendVec: sg.bendV, bendAmt: 0.5 });
    paintG(g, (p, n, c, i, j) => {
      const s = g.userData.sArr[j], h = clamp(p.y / SH);
      if (h < 0.5) mixC(c, pal[0], pal[1], h / 0.5); else mixC(c, pal[1], pal[2], (h - 0.5) / 0.5 * 0.6);
      if (sg.terminal) mixC(c, c, pal[2], sstep(0.4, 1, s) * 0.85);
      c.multiplyScalar(0.88 + 0.2 * vnoise(p.x * 60, p.y * 60, p.z * 60, seed));
    });
    shadeG(g, (p, n, i, j) => groundAO(p.y, 0.15, 0.4) * (sg.depth > 0 ? 0.82 + 0.18 * sstep(0, 0.2, g.userData.sArr[j]) : 1));
    parts.push(g);
  }
  const g = assemble(parts, ['sway']);
  const hT = 0.1 + rng() * 0.03;
  fitAxis(g, 'y', hT);
  return { geometry: g };
}

export function brainCoral(seed = 1) {
  const rng = rngOf(seed, 13);
  const Hq = 0.62, NR = 26, prof = [];
  for (let j = 0; j < NR; j++) { const a = (j / (NR - 1)) * (Math.PI / 2); prof.push([Math.sin(a), Hq * Math.cos(a) + 0.05]); }
  prof.push([1.02, 0.03], [0.99, 0.0], [0.5, 0.0], [0, 0.0]);
  const ox = rng() * 50;
  const ridge = (p) => {
    const w = fbm(p.x * 1.6 + ox, p.y * 1.6, p.z * 1.6, seed + 3, 2);
    const q = fbm(p.x * 2.0 + w * 1.5 + ox, p.y * 2.0, p.z * 2.0 + w * 1.5, seed, 2);
    const tri = Math.abs(fract(q * 4.5) * 2 - 1);
    return sstep(0.25, 0.75, tri);
  };
  const g = lathe(prof, 56, (a, j, o) => {
    const s = 1 + 0.07 * (fbm(Math.sin(a) * 1.4 + ox, o[1] * 2, Math.cos(a) * 1.4, seed, 2) - 0.5) * 2;
    o[0] *= s; o[2] *= s;
  });
  displaceG(g, (p, n, i, j) => (j >= NR - 1 ? 0 : (ridge(p) - 0.5) * 0.05));
  const RID = hx(0xb9c44c), GRV = hx(0x4a6126), SKT = hx(0x7a7440);
  paintG(g, (p, n, c, i, j) => {
    if (j >= NR - 1) { c.copy(SKT).multiplyScalar(0.6); return; }
    const rd = ridge(p);
    mixC(c, GRV, RID, rd);
    mixC(c, c, hx(0xc9a24a), 0.3 * sstep(0.5, 0.8, fbm(p.x * 5, p.y * 5, p.z * 5, seed + 9)));
    mixC(c, c, SKT, sstep(0.12, 0.02, p.y) * 0.8);
    c.multiplyScalar(0.55 + 0.45 * rd);
  });
  shadeG(g, (p) => groundAO(p.y, 0.1, 0.4));
  const geo = assemble([g], ['sway']);
  const b = bbox(geo); fitAxis(geo, 'x', 0.08 * (b.max.x - b.min.x) / (b.max.x - b.min.x));
  return { geometry: geo };
}

export function tableCoral(seed = 1) {
  const rng = rngOf(seed, 17);
  const teal = rng() < 0.5;
  const PY = 0.55;
  const topY = (r) => PY + 0.05 * r * r * r - 0.03 * (1 - r) * 0;
  const prof = [];
  for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.93, 1.0]) prof.push([r, topY(r)]);
  prof.push([1.02, PY + 0.04], [1.0, PY + 0.01]);
  for (const r of [0.85, 0.6, 0.35, 0.2]) prof.push([r, PY - 0.03 - 0.1 * (1 - r)]);
  prof.push([0.13, 0.3], [0.13, 0.15], [0.17, 0.04], [0.22, 0.0]);
  const NT = 7 + 2 + 4;
  const ox = rng() * 30;
  const g = lathe(prof, 84, (a, j, o, r) => {
    if (j < NT && j > 0) { const s = 1 + 0.07 * (fbm(Math.sin(a) * 1.5 + ox, 0, Math.cos(a) * 1.5, seed) - 0.5) * 2; o[0] *= s; o[2] *= s; }
  });
  const ang = (p) => Math.atan2(p.x, p.z);
  displaceG(g, (p, n, i, j) => {
    if (j >= 8 || j === 0) return 0;
    const r = Math.hypot(p.x, p.z);
    return 0.014 * Math.sin(ang(p) * 28 + 2 * fbm(p.x, 0, p.z, seed)) * sstep(0.15, 0.4, r);
  });
  const TOPC = teal ? hx(0x35b09a) : hx(0xa8943a), RDG = teal ? hx(0x7fe0c0) : hx(0xd6c25c), EDG = teal ? hx(0xd6f2cc) : hx(0xefe6a4);
  const UNDER = hx(0x4a5a3c), PIL = hx(0x65553d);
  paintG(g, (p, n, c, i, j) => {
    const r = Math.hypot(p.x, p.z);
    if (j >= NT) { c.copy(PIL); return; }
    if (j >= 9) { mixC(c, UNDER, PIL, 1 - r); c.multiplyScalar(0.8 + 0.2 * Math.sin(ang(p) * 28)); return; }
    const l = 0.5 + 0.5 * Math.sin(ang(p) * 28 + 2 * fbm(p.x, 0, p.z, seed));
    mixC(c, TOPC, RDG, l * sstep(0.15, 0.5, r));
    mixC(c, c, EDG, sstep(0.9, 1.0, r) * 0.8);
    c.multiplyScalar(0.8 + 0.25 * fbm(p.x * 8, 0, p.z * 8, seed));
  });
  shadeG(g, (p, n, i, j) => (j >= 9 && j < NT ? 0.7 : j >= NT ? 0.5 + 0.5 * sstep(0, 0.2, p.y) : 1) * (j < 7 ? 1 - 0.15 * (1 - sstep(0.0, 0.3, Math.hypot(p.x, p.z))) : 1));
  const geo = assemble([g], ['sway']);
  fitAxis(geo, 'x', 0.15);
  return { geometry: geo };
}

export function seaFan(seed = 1) {
  const rng = rngOf(seed, 19);
  const segs = [], nodes = [];
  const base = V3(0, 0.12, 0);
  const curv = (x) => 0.18 * x * x;
  let bid = 0;
  function branch(x, y, ang, len, r, depth, id) {
    let px = x, py = y, left = len;
    let sinceFork = 0;
    while (left > 0) {
      const step = 0.08;
      ang += (rng() - 0.5) * 0.25;
      const nx = px + Math.sin(ang) * step, ny = py + Math.cos(ang) * step;
      if (Math.hypot(nx - base.x, ny - base.y) > 1.0) break;
      segs.push({ a: V3(px, py, curv(px)), b: V3(nx, ny, curv(nx)), r, depth });
      nodes.push({ p: V3(nx, ny, curv(nx)), id });
      px = nx; py = ny; left -= step; sinceFork += step;
      if (depth < 3 && sinceFork > 0.17 && rng() < 0.55) {
        sinceFork = 0;
        const sgn = rng() < 0.5 ? 1 : -1;
        branch(px, py, ang + sgn * (0.35 + rng() * 0.2), len * 0.7 * (0.5 + rng() * 0.4) + 0.2, r * 0.82, depth + 1, ++bid);
        ang -= sgn * 0.12;
      }
    }
  }
  const NM = 7;
  for (let k = 0; k < NM; k++) {
    const ang = lerp(-0.85, 0.85, k / (NM - 1)) + (rng() - 0.5) * 0.15;
    branch(base.x, base.y, ang, 0.85, 0.0125, 0, ++bid);
  }
  const links = [];
  for (let a = 0; a < nodes.length && links.length < 70; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const d = nodes[a].p.distanceTo(nodes[b].p);
      if (nodes[a].id !== nodes[b].id && d > 0.04 && d < 0.13 && rng() < 0.12) { links.push([nodes[a].p, nodes[b].p]); break; }
    }
  }
  const parts = [];
  const C0 = hx(0x7a1740), C1 = hx(0xd03f78), C2 = hx(0xf59ab8), STK = hx(0x4a1a30);
  const stalk = limb({ root: V3(0, 0, 0), dir: Y, up: X, len: 0.13, cols: 6, rings: [[0, 0.06, 0.06, 0], [0.08, 0.032, 0.032, 0], [0.6, 0.026, 0.026, 0], [1, 0.022, 0.022, 0]] });
  paintG(stalk, (p, n, c) => c.copy(STK).multiplyScalar(0.7 + 0.3 * sstep(0, 0.1, p.y)));
  parts.push(stalk);
  const colr = (p, c, w) => {
    const rr = Math.hypot(p.x - base.x, p.y - base.y);
    mixC(c, C0, C1, sstep(0.05, 0.6, rr)); mixC(c, c, C2, sstep(0.6, 1.0, rr) * 0.8);
    c.multiplyScalar(0.8 + 0.2 * sstep(0, 0.3, rr) + w);
  };
  for (const sg of segs) {
    const g = tubeSeg(sg.a, sg.b, sg.r, sg.r * 0.9, 3);
    paintG(g, (p, n, c) => colr(p, c, 0));
    parts.push(g);
  }
  for (const [a, b] of links) {
    const g = tubeSeg(a, b, 0.006, 0.006, 3);
    paintG(g, (p, n, c) => colr(p, c, 0.05));
    parts.push(g);
  }
  const geo = assemble(parts, ['sway']);
  fitAxis(geo, 'y', 0.14);
  setSwayY(geo);
  return { geometry: geo };
}

export function anemone(seed = 1) {
  const rng = rngOf(seed, 23);
  const prof = [[0, 0], [0.26, 0], [0.3, 0.04], [0.28, 0.15], [0.27, 0.28], [0.31, 0.36], [0.36, 0.4], [0.3, 0.405], [0.2, 0.395], [0.12, 0.385], [0.07, 0.4], [0.04, 0.39], [0, 0.375]];
  const col = lathe(prof, 24);
  const NJ = prof.length;
  paintG(col, (p, n, c, i, j) => {
    const a = Math.atan2(p.x, p.z);
    if (j < 7) { mixC(c, hx(0xd9622b), hx(0xf2a458), 0.5 + 0.5 * Math.sin(a * 12)); mixC(c, c, hx(0xe8d0a0), sstep(0.1, 0.0, p.y) * 0.4); }
    else if (j < 10) mixC(c, hx(0xb83a2c), hx(0xe0603a), sstep(0.12, 0.3, Math.hypot(p.x, p.z)));
    else mixC(c, hx(0x6a1a1a), hx(0xd04a38), 0.5);
    void NJ;
  });
  shadeG(col, (p, n, i, j) => groundAO(p.y, 0.08, 0.35));
  const parts = [col];
  const rings = [[12, 0.15, 0.22], [18, 0.24, 0.32], [24, 0.32, 0.4]];
  for (const [cnt, rr, L] of rings) {
    for (let k = 0; k < cnt; k++) {
      const th = (k / cnt) * TAU + rr * 3 + (rng() - 0.5) * 0.1;
      const rh = V3(Math.sin(th), 0, Math.cos(th)), tg = V3(-rh.z, 0, rh.x);
      const root = V3(rh.x * rr, 0.39, rh.z * rr);
      const dir = V3(0, 1, 0).addScaledVector(rh, 0.4 + rr * 1.2);
      const bendV = rh.clone().multiplyScalar(0.9).addScaledVector(tg, (rng() - 0.5) * 0.8).addScaledVector(Y, -0.3);
      const r0 = 0.028;
      const g = limb({
        root, dir, up: X, len: L * (0.85 + rng() * 0.3), cols: 4, bendVec: bendV, bendAmt: 0.5 + rng() * 0.7,
        rings: [[0, r0, r0, 0], [0.4, r0 * 0.85, r0 * 0.85, 0], [0.8, r0 * 0.62, r0 * 0.62, 0], [0.95, r0 * 0.5, r0 * 0.5, 0], [1, 0, 0, 0]],
      });
      paintG(g, (p, n, c, i, j) => {
        const s = g.userData.sArr[j];
        mixC(c, hx(0xff8a3a), hx(0xff9ec8), sstep(0.2, 0.9, s));
        mixC(c, c, hx(0xffd8e8), sstep(0.85, 1, s) * 0.6);
        c.multiplyScalar(0.7 + 0.3 * sstep(0, 0.3, s));
      });
      setAttr(g, 'sway', (p, i, j) => g.userData.sArr[j]);
      parts.push(g);
    }
  }
  const geo = assemble(parts, ['sway']);
  const b = bbox(geo);
  fitAxis(geo, 'x', 0.06 * Math.max(b.max.x - b.min.x, b.max.z - b.min.z) / (b.max.x - b.min.x));
  return { geometry: geo };
}

export function kelp(seed = 1, h = 1.2) {
  const rng = rngOf(seed, 29);
  const kk = h / 1.2;
  const Ht = h * 0.96;
  const ph1 = rng() * TAU, ph2 = rng() * TAU;
  const sx = (y) => 0.02 * kk * Math.sin(y / kk * 4 + ph1), sz = (y) => 0.02 * kk * Math.sin(y / kk * 3.3 + ph2);
  const N = Math.max(12, Math.round(Ht / 0.06));
  const frames = [];
  for (let k = 0; k < N; k++) {
    const y = (k / (N - 1)) * Ht;
    let r = 0.012 * kk * (1 - 0.35 * y / Ht);
    if (k === 0) r = 0; else if (k === 1) r = 0.03 * kk; else if (k === 2) r = 0.016 * kk;
    if (k === N - 1) r = 0;
    frames.push({ c: V3(sx(y), k === 1 ? 0.01 * kk : y, sz(y)), u: X, v: Z, ru: r, rv: r });
  }
  frames[1].c.y = 0.012 * kk; frames[2].c.y = Math.max(frames[2].c.y, 0.05 * kk);
  const stipe = loft(frames, 5);
  paintG(stipe, (p, n, c) => { mixC(c, hx(0x4e4a18), hx(0x6a6020), clamp(p.y / h)); c.multiplyScalar(groundAO(p.y, 0.1, 0.35)); });
  const parts = [stipe];
  const BLD = hx(0xc4a64a);
  let k = 0;
  for (let y = 0.12 * kk; y < Ht - 0.12 * kk; y += 0.085 * kk, k++) {
    const phi = k * Math.PI + 0.6 * Math.sin(k * 1.9) + rng() * 0.3;
    const out = V3(Math.cos(phi), 0, Math.sin(phi)), sd = V3(-out.z, 0, out.x);
    const sp0 = V3(sx(y), y, sz(y));
    // 气囊
    const bl = ellipsoid(0.016 * kk, 0.022 * kk, 0.016 * kk, 7, 4);
    place(bl, sp0.x + out.x * 0.016 * kk, y + 0.008 * kk, sp0.z + out.z * 0.016 * kk);
    paintG(bl, (p, n, c) => { mixC(c, hx(0x9a8a30), BLD, sstep(-0.5, 0.6, n.y)); });
    parts.push(bl);
    // 叶片
    const Lb = 0.26 * kk * (0.8 + rng() * 0.4), Wb = 0.05 * kk * (0.85 + rng() * 0.3), NR = 9;
    const root = sp0.clone().addScaledVector(out, 0.022 * kk).add(V3(0, 0.018 * kk, 0));
    const pts = [], cur = root.clone();
    const dirs = [];
    for (let r = 0; r < NR; r++) {
      const s = r / (NR - 1);
      const A = out.clone().multiplyScalar(0.8 * (1 - 0.6 * s)).add(V3(0, 0.5 + 1.0 * s, 0)).normalize();
      if (r > 0) cur.addScaledVector(A, Lb / (NR - 1));
      pts.push(cur.clone()); dirs.push(A);
    }
    const ph = rng() * TAU;
    const g = mkGrid(3, NR, (i, j, o) => {
      const s = j / (NR - 1), A = dirs[j];
      const W = sd.clone().addScaledVector(A, -sd.dot(A)).normalize();
      const N2 = V3().crossVectors(A, W).normalize();
      const w = 0.006 * kk + Wb * Math.pow(Math.sin(Math.PI * clamp(s * 0.92 + 0.04)), 0.7);
      const e = i - 1;
      const q = pts[j].clone().addScaledVector(W, e * w).addScaledVector(N2, 0.012 * kk * Math.sin(s * 12 + ph + e * 1.5) * (e === 0 ? 0.3 : 1));
      o[0] = q.x; o[1] = q.y; o[2] = q.z;
    }, false);
    tidy(g);
    paintG(g, (p, n, c, i, j) => {
      const s = j / (NR - 1);
      mixC(c, hx(0x7a7422), hx(0xb48a2a), sstep(0, 0.5, s)); mixC(c, c, hx(0xcca04a), sstep(0.6, 1, s) * 0.6);
      if (i === 1) c.multiplyScalar(0.8); else c.multiplyScalar(1.05);
      c.multiplyScalar(0.7 + 0.3 * sstep(0, 0.25, s));
    });
    parts.push(thin(g, 0.0015 * kk));
  }
  const geo = assemble(parts, ['sway']);
  fitAxis(geo, 'y', h);
  const b = bbox(geo); geo.translate(0, -b.min.y, 0);
  setSwayY(geo, 0, h);
  return { geometry: geo };
}

/* ============================================================
 * 海星 / 海胆
 * ============================================================ */
export function starfish(seed = 1) {
  const rng = rngOf(seed, 31);
  const purple = rng() < 0.4;
  const out = (a) => 0.28 + 0.72 * Math.pow(Math.abs(Math.cos(2.5 * a)), 1.5);
  const prof = [];
  for (const u of [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.88, 0.96]) prof.push([u, 0]);
  prof.push([1.0, 0.0]);
  prof.push([0.99, 0.0], [0.6, 0], [0, 0]);
  const NTOP = 9;
  const ox = rng() * 40;
  const g = lathe(prof, 60, (a, j, o, r) => {
    const R = out(a), rr = r * R;
    const u = r;
    let y = 0;
    if (j < NTOP) y = 0.5 * Math.sqrt(Math.max(0, 1 - u * u)) * (0.35 + 0.65 * Math.pow(1 - clamp(rr), 1.2)) + (j === NTOP - 1 ? 0.02 : 0);
    o[0] = Math.sin(a) * rr; o[2] = Math.cos(a) * rr; o[1] = y;
  });
  const dot = (p) => sstep(0.55, 0.8, vnoise(p.x * 9 + ox, p.y * 9, p.z * 9, seed));
  displaceG(g, (p, n, i, j) => (j < NTOP - 1 ? 0.03 * dot(p) : 0));
  const B = purple ? hx(0x8a3f9a) : hx(0xe0502a), D = purple ? hx(0xd49ae0) : hx(0xf5a860), CEN = purple ? hx(0x6a2a7a) : hx(0xc23a1c), UN = purple ? hx(0xc8a0d0) : hx(0xe8b680);
  paintG(g, (p, n, c, i, j) => {
    if (j >= NTOP - 1) { c.copy(UN); return; }
    const r = Math.hypot(p.x, p.z), a = Math.atan2(p.x, p.z);
    c.copy(B);
    mixC(c, c, CEN, 1 - sstep(0.08, 0.28, r));
    mixC(c, c, D, dot(p) * 0.9);
    mixC(c, c, D, (1 - sstep(0.0, 0.1, Math.abs(Math.sin(2.5 * a)))) * 0.0 + sstep(0.93, 1, Math.abs(Math.cos(2.5 * a))) * sstep(0.25, 0.7, r) * 0.45);
    mixC(c, c, B.clone().multiplyScalar(0.7), sstep(0.7, 1.0, r) * 0.4);
  });
  shadeG(g, (p, n) => groundAO(p.y, 0.04, 0.25) * (0.8 + 0.2 * sstep(-0.5, 0.6, n.y)));
  const geo = assemble([g], []);
  const b = bbox(geo);
  fitAxis(geo, 'x', 0.045 * (b.max.x - b.min.x) / Math.max(b.max.x - b.min.x, b.max.z - b.min.z));
  return { geometry: geo };
}

export function seaUrchin(seed = 1) {
  const rng = rngOf(seed, 37);
  const RB = 0.4;
  const body = ellipsoid(RB, RB * 0.86, RB, 14, 9);
  paintG(body, (p, n, c) => { c.copy(hx(0x1a0e26)).multiplyScalar(0.8 + 0.3 * vnoise(p.x * 30, p.y * 30, p.z * 30, seed)); });
  shadeG(body, () => 0.8);
  const parts = [body];
  const NS = 150, ga = Math.PI * (3 - Math.sqrt(5));
  for (let k = 0; k < NS; k++) {
    const yy = 1 - (k + 0.5) / NS * 2, rr = Math.sqrt(1 - yy * yy), th = k * ga;
    const d = V3(Math.cos(th) * rr, yy, Math.sin(th) * rr).normalize();
    const short = k % 3 === 0;
    let L = (short ? 0.3 : 0.55 + rng() * 0.15) * (1 - 0.3 * Math.max(0, -d.y));
    const r0 = short ? 0.014 : 0.018;
    const g = limb({
      root: d.clone().multiplyScalar(RB * 0.85), dir: d, up: Math.abs(d.y) < 0.9 ? Y : X, len: L + RB * 0.15, cols: 4,
      rings: [[0, r0, r0, 0], [0.45, r0 * 0.6, r0 * 0.6, 0], [1, 0, 0, 0]],
    });
    paintG(g, (p, n, c, i, j) => {
      const s = g.userData.sArr[j];
      mixC(c, hx(0x150a22), hx(0x2e1a4a), sstep(0, 0.5, s)); mixC(c, c, hx(0x6a4a8a), sstep(0.6, 1, s) * 0.8);
    });
    shadeG(g, (p, n, i, j) => 0.6 + 0.4 * sstep(0, 0.5, g.userData.sArr[j]));
    parts.push(g);
  }
  const geo = assemble(parts, []);
  const b = bbox(geo);
  const k = 0.035 / Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  geo.scale(k, k, k);
  const b2 = bbox(geo); geo.translate(0, -b2.min.y, 0);
  return { geometry: geo };
}
