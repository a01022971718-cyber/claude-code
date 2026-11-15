// 《屿见》高画质版：程序化道具模型（风格化写实）。
// 只依赖 three 与 BufferGeometryUtils；不使用 DOM / Math.random（噪声与随机数都由 seed 决定，可复现）。
// 每个导出函数：(seed = 1) => { geometry, anchors }
//   geometry：非索引的合并几何，带 position / normal / color（线性 RGB，已乘入烘焙 AO）
//   单位：六边形地块外接圆半径 = 1；原点在模型底部中心，正面朝 +z。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ============================================================
 * 配色（sRGB 十六进制 → three 自动转成线性）
 * ============================================================ */
const hex = (h) => new THREE.Color(h);
const PAL = {
  straw: hex(0xc9a15a), strawDk: hex(0x8f6a35), strawLt: hex(0xe3c27e),
  wood: hex(0x8a5a3c), woodDk: hex(0x5e3b25), cut: hex(0xd9a66b),
  stone: hex(0x8d8a85), stoneDk: hex(0x5f5d5a), moss: hex(0x6f8f3e),
  canvas: hex(0xe9dfc8), red: hex(0xc8432f), white: hex(0xf1ece2),
  metal: hex(0x2f3438), lamp: hex(0xffd98a), rope: hex(0xb8925a),
  // 派生色
  clay: hex(0xb08d62), soot: hex(0x1d1815), ash: hex(0x2a2522), ember: hex(0x5a3624),
  doorDark: hex(0x1a120d),
};

/* ============================================================
 * 随机数 / 噪声
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
/** 3D value noise，返回 0..1 */
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
 * 小数学
 * ============================================================ */
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
function sstep(a, b, x) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
const TAU = Math.PI * 2;

/* ============================================================
 * 几何工具
 * ============================================================ */
/** 参数网格。fn(i, j, out) 填 out=[x,y,z]。wrap=true 时 i 方向首尾相接（绕一圈）。 */
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
/** 旋转体。profile=[[r,y],...]，从底部中心起沿「逆时针」走（向上=朝外的面）。 */
function lathe(profile, segs) {
  return grid(segs, profile.length, (i, j, v) => {
    const a = (i / segs) * TAU, pr = profile[j];
    v[0] = Math.sin(a) * pr[0]; v[1] = pr[1]; v[2] = Math.cos(a) * pr[0];
  });
}
/** 去掉退化三角形 */
function dropDegenerate(g) {
  const ix = g.index.array, out = [];
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i], b = ix[i + 1], c = ix[i + 2];
    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }
  g.setIndex(out);
  return g;
}
/** 焊接顶点 + 平滑法线（有机物体的基础形态） */
function smooth(g) {
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g.clearGroups();
  g = mergeVertices(g, 1e-5);
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
/** 沿法线 / 任意位移。fn(p, n, i)：返回数字=沿法线位移；返回 undefined=自己改了 p。 */
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
/** 上色：fn(p, n, c, i)。c 里已有旧颜色（没有则为白） */
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
/** 解析式球体遮蔽：balls=[[x,y,z,r],...]，返回 0..1 的亮度系数 */
function ballAO(p, n, balls, k = 0.8) {
  let ao = 1;
  for (let b = 0; b < balls.length; b++) {
    const B = balls[b];
    const dx = B[0] - p.x, dy = B[1] - p.y, dz = B[2] - p.z;
    const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2);
    if (d < 1e-6) continue;
    const cosT = (n.x * dx + n.y * dy + n.z * dz) / d;
    if (cosT <= 0) continue;
    ao *= 1 - k * Math.min(1, cosT * (B[3] * B[3]) / d2);
  }
  return ao;
}
const groundAO = (y, h = 0.05, k = 0.26) => 1 - k * (1 - sstep(0, h, y));
/** 半球天光：朝下的面略暗 */
const skyAO = (n, k = 0.16) => 1 - k * (1 - sstep(-0.7, 0.5, n.y));

const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _t = new THREE.Vector3(), _s = new THREE.Vector3();
function place(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_t.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}
/** 把沿 Y 轴居中的几何（长度 L）放到 a→b 这根线段上 */
function between(g, a, b) {
  const d = new THREE.Vector3().subVectors(b, a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** 非索引 + 只保留 position/normal/color */
function finish(g) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  g.clearGroups();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) throw new Error('part without color');
  return g;
}
function assemble(parts, floor = null) {
  const g = mergeGeometries(parts.map(finish), false);
  if (floor !== null) {
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) if (P.getY(i) < floor) P.setY(i, floor);
  }
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/* ============================================================
 * 圆角方块（解析法线）。mid=[mx,my,mz] 为平面区域内部加密的点数
 * ============================================================ */
function roundedBox(w, h, d, r, seg = 2, mid = [0, 0, 0]) {
  const H = [w / 2, h / 2, d / 2];
  r = Math.min(r, H[0] * 0.98, H[1] * 0.98, H[2] * 0.98);
  const coords = H.map((hh, ax) => {
    const inner = hh - r, pos = [];
    for (let k = 1; k <= seg; k++) pos.push(inner + r * Math.tan((k / seg) * Math.PI / 4));
    const arr = [];
    for (let k = seg - 1; k >= 0; k--) arr.push(-pos[k]);
    arr.push(-inner);
    for (let k = 1; k <= mid[ax]; k++) arr.push(-inner + (2 * inner * k) / (mid[ax] + 1));
    arr.push(inner);
    for (let k = 0; k < seg; k++) arr.push(pos[k]);
    return arr;
  });
  // 注意 arr 里 -pos[seg-1]=-hh 是第一个，+pos[seg-1]=hh 是最后一个
  const geos = [];
  for (let a = 0; a < 3; a++) {
    for (const s of [1, -1]) {
      const b = (a + 1) % 3, c = (a + 2) % 3;
      const cb = s > 0 ? coords[b] : coords[b].slice().reverse();
      const cc = coords[c];
      const nrm = new Float32Array(cb.length * cc.length * 3);
      const g = grid(cb.length, cc.length, (i, j, v) => {
        const q = [0, 0, 0]; q[a] = s * H[a]; q[b] = cb[i]; q[c] = cc[j];
        const ip = [0, 0, 0], dl = [0, 0, 0];
        for (let k = 0; k < 3; k++) { const lim = H[k] - r; ip[k] = clamp(q[k], -lim, lim); dl[k] = q[k] - ip[k]; }
        const len = Math.hypot(dl[0], dl[1], dl[2]) || 1;
        for (let k = 0; k < 3; k++) { dl[k] /= len; v[k] = ip[k] + dl[k] * r; }
        nrm.set(dl, (j * cb.length + i) * 3);
      }, false);
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geos.push(g);
    }
  }
  return mergeGeometries(geos, false);
}
/** 圆角方块 → 焊接成平滑形态（可继续变形） */
function softBox(w, h, d, r, seg, mid) { const g = roundedBox(w, h, d, r, seg, mid); return smooth(g); }

/* ============================================================
 * 石块：被噪声揉过的扁球（局部坐标，底部略压平，y 轴 0 点在球心）
 * ============================================================ */
function stoneGeom(rx, ry, rz, seed, o = {}) {
  const g = smooth(new THREE.SphereGeometry(1, o.w ?? 14, o.h ?? 10));
  const amp = o.amp ?? 0.18, fr = o.freq ?? 1.3, sd = seed * 13.7;
  const fb = -ry * (o.flat ?? 0.55);
  displace(g, (p) => {
    const q = fbm(p.x * fr + sd, p.y * fr + sd * 0.7, p.z * fr - sd, seed, 3) - 0.5;
    const q2 = vnoise(p.x * 4 + sd, p.y * 4, p.z * 4, seed + 9) - 0.5;
    const k = 1 + amp * 2 * q + 0.05 * q2;
    p.multiplyScalar(k); p.x *= rx; p.y *= ry; p.z *= rz;
    if (p.y < fb) p.y = fb + (p.y - fb) * 0.22;
  });
  const moss = o.moss ?? 0;
  paint(g, (p, n, c) => {
    const q = fbm(p.x * 22 + sd, p.y * 22, p.z * 22, seed + 3, 3);
    c.copy(PAL.stone).lerp(PAL.stoneDk, sstep(0.56, 0.3, q) * 0.8);
    c.multiplyScalar(0.92 + 0.16 * vnoise(p.x * 6, p.y * 6, p.z * 6, seed + 11));
    if (moss > 0) {
      const m = sstep(0.45, 0.85, n.y + (fbm(p.x * 14 + sd, p.y * 14, p.z * 14, seed + 5, 3) - 0.5) * 1.1) * moss;
      c.lerp(PAL.moss, m * 0.9);
      c.multiplyScalar(1 - 0.12 * m * vnoise(p.x * 30, p.y * 30, p.z * 30, seed + 1));
    }
    c.multiplyScalar(lerp(0.62, 1, sstep(0, ry * 1.1, p.y - fb)));
  });
  g.userData.ry = ry; g.userData.base = fb;
  return g;
}

/* ============================================================
 * 原木：沿 Y 居中的圆木（带倒角、树皮起伏、两端年轮截面色）
 * ============================================================ */
function logGeom(len, rad, seed, o = {}) {
  const seg = o.seg ?? 14, bevF = o.bev ?? 0.22, capN = o.capN ?? 3, bn = o.bn ?? 3;
  const nb = o.nb ?? Math.max(3, Math.round((len / rad) * 0.55));
  const half = len / 2, bev = rad * bevF, xr = rad - bev, dome = o.dome ?? 0.06;
  const tone = o.tone ?? 0.5, charTop = o.char ?? 0;
  const capY = (x, s) => s * (half + dome * rad * (1 - (x / xr) * (x / xr)));
  const pr = [];
  for (let k = 0; k <= capN; k++) { const x = (xr * k) / capN; pr.push([x, capY(x, -1)]); }
  for (let m = 1; m <= bn; m++) { const a = (m / bn) * Math.PI / 2; pr.push([xr + bev * Math.sin(a), -half + bev * (1 - Math.cos(a))]); }
  for (let k = 1; k < nb; k++) pr.push([rad, -half + bev + ((len - 2 * bev) * k) / nb]);
  for (let m = bn; m >= 0; m--) { const a = (m / bn) * Math.PI / 2; pr.push([xr + bev * Math.sin(a), half - bev * (1 - Math.cos(a))]); }
  for (let k = capN - 1; k >= 0; k--) { const x = (xr * k) / capN; pr.push([x, capY(x, 1)]); }
  const g = smooth(lathe(pr, seg));
  const sc = 1 / rad, amp = rad * (o.barkAmp ?? 0.07), sd = seed * 7.3;
  const capW = (ay) => sstep(half - bev * 0.9, half - bev * 0.35, ay);
  displace(g, (p, n) => {
    const w = 1 - capW(Math.abs(p.y));
    const ang = Math.atan2(p.z, p.x);
    const q = fbm(p.x * sc * 1.6 + sd, p.y * sc * 0.5, p.z * sc * 1.6, seed, 3) - 0.5;
    const rid = Math.sin(ang * 5 + 5 * vnoise(p.y * sc * 0.35, ang * 1.3, sd, seed + 2)) * 0.5;
    const capRough = (vnoise(p.x * sc * 4, p.y * 9, p.z * sc * 4, seed + 4) - 0.5) * rad * 0.03;
    return w * amp * (q * 2 + rid * 0.8) + (1 - w) * capRough;
  });
  const woodLt = new THREE.Color().copy(PAL.wood).lerp(PAL.cut, 0.3);
  paint(g, (p, n, c) => {
    const ay = Math.abs(p.y), cw = capW(ay), rr = Math.hypot(p.x, p.z) / rad;
    const q = fbm(p.x * sc * 2.2 + sd, p.y * sc * 0.35, p.z * sc * 2.2, seed + 5, 3);
    c.copy(PAL.wood).lerp(PAL.woodDk, clamp(tone * 0.6 + sstep(0.55, 0.3, q) * 0.8, 0, 1));
    c.lerp(woodLt, sstep(0.6, 0.82, q) * 0.4);
    if (cw > 0) {
      const ring = 0.5 + 0.5 * Math.sin(rr * 22 + 2.2 * fbm(p.x * sc * 3, 0, p.z * sc * 3, seed + 8, 2));
      const cc = new THREE.Color().copy(PAL.cut).lerp(PAL.woodDk, ring * 0.38 + 0.04);
      cc.lerp(PAL.woodDk, sstep(0.16, 0.0, rr) * 0.5);
      cc.lerp(PAL.wood, sstep(0.72, 0.92, rr) * 0.55);
      c.lerp(cc, cw);
    }
    if (charTop > 0 && p.y > half - charTop) c.lerp(PAL.soot, sstep(half - charTop, half - charTop * 0.2, p.y) * 0.85);
  });
  return g;
}

/* ============================================================
 * 1. 茅草屋
 * ============================================================ */
export function strawHut(seed = 1) {
  const rnd = mulberry32(seed * 101 + 7);
  const sd = seed * 3.1;
  const parts = [];
  const WR = 0.19, WH = 0.27;

  // ---- 泥墙 ----
  {
    const prof = [[0, 0], [WR - 0.012, 0]];
    for (let k = 0; k <= 9; k++) {
      const y = (WH * k) / 9;
      prof.push([WR + 0.012 * Math.exp(-y * 28) + 0.006 * Math.sin(y * 9), y]);
    }
    prof.push([WR - 0.04, WH], [0, WH]);
    const g = smooth(lathe(prof, 36));
    displace(g, (p, n) => {
      const q = fbm(p.x * 22 + sd, p.y * 22, p.z * 22 + sd, seed, 3) - 0.5;
      return q * 0.016 + Math.sin(p.y * 90 + q * 6) * 0.0016;
    });
    paint(g, (p, n, c) => {
      const q = fbm(p.x * 14 + sd, p.y * 6, p.z * 14, seed + 2, 3);
      c.copy(PAL.clay).lerp(PAL.strawDk, sstep(0.55, 0.3, q) * 0.55).lerp(PAL.cut, sstep(0.6, 0.8, q) * 0.25);
      c.lerp(PAL.woodDk, (1 - sstep(0, 0.07, p.y)) * 0.45);
      // 屋檐下强烈的暗部 + 贴地
      c.multiplyScalar((0.38 + 0.62 * (1 - sstep(0.03, 0.18, p.y))) * groundAO(p.y, 0.05, 0.2));
    });
    parts.push(g);
  }

  // ---- 门洞（深色拱形）+ 两根木柱 + 门楣 + 门槛石 ----
  {
    const door = (() => {
      const s = new THREE.Shape(), r = 0.05;
      s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, 0.07); s.absarc(0, 0.07, r, 0, Math.PI, false); s.lineTo(-r, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 10 });
      return smooth(g);
    })();
    paint(door, (p, n, c) => {
      c.copy(PAL.doorDark).lerp(PAL.woodDk, 0.3 * (1 - sstep(0, 0.1, p.y)));
      c.multiplyScalar(0.6 + 0.4 * (1 - sstep(0.03, 0.12, p.y)));
    });
    place(door, 0, 0, WR - 0.004);
    parts.push(door);

    for (const sx of [-1, 1]) {
      const post = logGeom(0.16, 0.0125, seed + sx * 3, { seg: 8, nb: 4, bn: 2, capN: 2, bev: 0.3, dome: 0.05, tone: 0.3 });
      place(post, sx * 0.06, 0.08, WR + 0.006 - 0.0006 * sx, 0, 0, sx * 0.02);
      parts.push(post);
    }
    const lintel = logGeom(0.16, 0.0115, seed + 9, { seg: 8, nb: 5, bn: 2, capN: 2, bev: 0.3, tone: 0.4 });
    place(lintel, 0.0, 0.133, WR + 0.006, 0, 0, Math.PI / 2 + 0.03);
    parts.push(lintel);

    const sill = softBox(0.13, 0.014, 0.055, 0.006, 2, [2, 0, 0]);
    displace(sill, (p) => (vnoise(p.x * 40, p.y * 40, p.z * 40, seed) - 0.5) * 0.003);
    paint(sill, (p, n, c) => { c.copy(PAL.stone).lerp(PAL.stoneDk, 0.2 * vnoise(p.x * 30, 0, p.z * 30, seed)); });
    place(sill, 0, 0.007, WR + 0.03, 0, 0.04, 0);
    parts.push(sill);
  }

  // ---- 茅草顶：5 层裙边，每层下沿是一缕缕草穗 ----
  const Y0 = 0.2, H = 0.42, R0 = 0.262, NU = 64, TY = Y0 + H;
  const rS = (s) => R0 * Math.pow(Math.max(0, 1 - s), 0.9) + 0.012 * Math.exp(-s * 9);
  const sb = [0, 0.17, 0.35, 0.55, 0.76];
  const spanOf = (i) => Math.min(1, sb[i] + 0.44) - sb[i];
  const rowsOf = (i) => (i < 4 ? [0, 0.14, 0.27, 0.38, 0.46, 1] : [0, 0.15, 0.3, 0.5, 0.75, 1]);
  const drops = sb.map((_, i) => {
    const a = new Float32Array(NU);
    for (let k = 0; k < NU; k++) {
      const tip = k % 2 === 0;
      a[k] = (tip ? 0.075 * (0.5 + 0.95 * rnd()) : 0.012 * rnd()) * (0.8 + 0.4 * vnoise(k * 0.31, i * 3.7, 0, seed));
    }
    return a;
  });
  const dropAt = (i, th) => {
    let f = (th / TAU) * NU; f -= Math.floor(f / NU) * NU;
    const k0 = Math.floor(f), t = f - k0;
    return lerp(drops[i][k0 % NU], drops[i][(k0 + 1) % NU], t);
  };
  // 里层深色锥体：草穗缝隙里透出的暗部
  {
    const prof = [];
    for (let k = 0; k <= 5; k++) { const s = 0.03 + (0.97 * k) / 5; prof.push([Math.max(0, rS(s) - 0.008), Y0 + s * H]); }
    const g = smooth(lathe(prof, 32));
    paint(g, (p, n, c) => { c.copy(PAL.strawDk).multiplyScalar(0.42); });
    parts.push(g);
  }
  for (let i = 0; i < 5; i++) {
    const span = spanOf(i), ts = rowsOf(i), off = 0.007 * i;
    const g = grid(NU, ts.length, (a, j, v) => {
      const th = (a / NU) * TAU, t = ts[j];
      const wd = Math.pow(Math.max(0, 1 - t / 0.3), 1.3);
      const s = clamp(sb[i] + t * span - wd * drops[i][a], -0.2, 1);
      const tipW = a % 2 === 0 ? 1 : 0;
      const r = Math.max(0, rS(s) + off * Math.pow(Math.max(0, 1 - s), 0.6) + 0.016 * Math.pow(Math.max(0, 1 - t / 0.3), 2) + 0.004 * tipW * wd);
      v[0] = Math.sin(th) * r; v[1] = Y0 + s * H; v[2] = Math.cos(th) * r;
    });
    const sg = smooth(g);
    displace(sg, (p) => (fbm(p.x * 40 + sd, p.y * 8, p.z * 40, seed + i, 3) - 0.5) * 0.012);
    paint(sg, (p, n, c) => {
      const th = Math.atan2(p.x, p.z), s = (p.y - Y0) / H;
      const q = fbm(p.x * 34 + sd, p.y * 7, p.z * 34, seed + i, 3);
      c.copy(PAL.straw);
      c.lerp(PAL.strawLt, sstep(0.52, 0.78, q) * 0.75);
      c.lerp(PAL.strawDk, sstep(0.5, 0.22, q) * 0.7);
      c.lerp(PAL.strawLt, sstep(0.3, 1, s) * 0.22);
      const local = (s - sb[i]) / span;
      let ao = lerp(0.5, 1, sstep(-0.02, 0.22, local));
      if (i < 4) { const e = sb[i + 1] - dropAt(i + 1, th); ao *= 1 - 0.5 * Math.exp(-Math.max(0, e - s) / 0.045); }
      ao *= groundAO(p.y - 0.12, 0.06, 0.12);
      c.multiplyScalar(ao);
    });
    parts.push(sg);
  }
  // ---- 顶部扎起来的草尖 ----
  {
    const prof = [[0, -0.04], [0.026, -0.04], [0.031, -0.018], [0.024, 0.005], [0.017, 0.016], [0.024, 0.028], [0.034, 0.044], [0.027, 0.06], [0.012, 0.073], [0, 0.08]].map(([r, y]) => [r, TY + y]);
    const g = smooth(lathe(prof, 14));
    displace(g, (p) => (fbm(p.x * 90 + sd, p.y * 20, p.z * 90, seed + 21, 2) - 0.5) * 0.008);
    paint(g, (p, n, c) => {
      const q = fbm(p.x * 60 + sd, p.y * 10, p.z * 60, seed + 22, 2);
      c.copy(PAL.straw).lerp(PAL.strawLt, sstep(TY, TY + 0.06, p.y) * 0.8 + sstep(0.5, 0.7, q) * 0.2);
      c.lerp(PAL.strawDk, sstep(0.45, 0.25, q) * 0.5);
      c.multiplyScalar(lerp(0.65, 1, sstep(TY - 0.04, TY + 0.04, p.y)));
    });
    parts.push(g);
    const rope = smooth(new THREE.TorusGeometry(0.0195, 0.0055, 6, 16));
    rope.rotateX(Math.PI / 2);
    paint(rope, (p, n, c) => { c.copy(PAL.rope).lerp(PAL.woodDk, 0.25 + 0.25 * Math.sin(Math.atan2(p.z, p.x) * 9)); });
    place(rope, 0, TY + 0.016, 0);
    parts.push(rope);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + rnd() * 0.6, lean = 0.35 + rnd() * 0.35;
      const st = smooth(new THREE.ConeGeometry(0.0055, 0.06 + rnd() * 0.02, 5, 2, true));
      st.translate(0, 0.035, 0);
      paint(st, (p, n, c) => { c.copy(PAL.strawLt).lerp(PAL.straw, 0.4 * (1 - sstep(0, 0.07, p.y))).multiplyScalar(0.8 + 0.2 * sstep(0, 0.07, p.y)); });
      place(st, Math.sin(a) * 0.012, TY + 0.036, Math.cos(a) * 0.012, lean * Math.cos(a), 0, -lean * Math.sin(a));
      parts.push(st);
    }
  }
  for (const g of parts) shade(g, (p, n) => skyAO(n, 0.1));
  return { geometry: assemble(parts, 0), anchors: { door: [0, 0, 0.29] } };
}

/* ============================================================
 * 2. 营火（不含火焰）
 * ============================================================ */
export function campfire(seed = 1) {
  const rnd = mulberry32(seed * 211 + 5);
  const parts = [];
  const NS = 9, RING = 0.117;
  const balls = []; // 石头遮蔽球，供木柴 / 灰烬使用
  // ---- 圆石 ----
  for (let i = 0; i < NS; i++) {
    const a = ((i + (rnd() - 0.5) * 0.35) / NS) * TAU;
    const rx = 0.047 + rnd() * 0.012, rz = 0.04 + rnd() * 0.007, ry = 0.031 + rnd() * 0.012;
    const g = stoneGeom(rx, ry, rz, seed * 10 + i, { w: 14, h: 10, moss: i % 3 === 0 ? 0.55 : 0.2 });
    const rad = RING + (rnd() - 0.5) * 0.012;
    const x = Math.sin(a) * rad, z = Math.cos(a) * rad, y = -g.userData.base - 0.004;
    place(g, x, y, z, (rnd() - 0.5) * 0.12, a + Math.PI / 2 + (rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.1);
    paint(g, (p, n, c) => {
      // 朝火一侧被熏黑
      const inx = -(p.x * n.x + p.z * n.z) / (Math.hypot(p.x, p.z) || 1);
      c.lerp(PAL.soot, sstep(0.3, 0.9, inx) * 0.55 * (1 - sstep(0.02, 0.07, p.y)));
    });
    balls.push([x, y + ry * 0.4, z, Math.max(rx, rz) * 0.9]);
    parts.push(g);
  }
  // ---- 灰烬 / 焦土 ----
  {
    const prof = [[0, 0], [0.1, 0], [0.108, 0.003], [0.1, 0.007], [0.085, 0.011], [0.06, 0.014], [0.03, 0.017], [0, 0.018]];
    const g = smooth(lathe(prof, 26));
    displace(g, (p) => (fbm(p.x * 30 + seed, p.y * 30, p.z * 30, seed, 3) - 0.5) * 0.007);
    paint(g, (p, n, c) => {
      const r = Math.hypot(p.x, p.z), q = fbm(p.x * 40, p.y * 40, p.z * 40, seed + 1, 3);
      c.copy(PAL.ash).lerp(PAL.soot, sstep(0.05, 0.0, r) * 0.7);
      c.lerp(PAL.ember, sstep(0.62, 0.8, q) * 0.5 * sstep(0.1, 0.03, r));
      c.lerp(PAL.woodDk, sstep(0.06, 0.11, r) * 0.45);
    });
    parts.push(g);
  }
  // ---- 交叉搭起来的木柴 ----
  const NL = 4;
  for (let i = 0; i < NL; i++) {
    const phi = (i / NL) * TAU + 0.35 + (rnd() - 0.5) * 0.4;
    const B = V3(Math.sin(phi) * 0.082, 0.014, Math.cos(phi) * 0.082);
    const side = i % 2 ? 1 : -1, ph2 = phi + Math.PI + side * 0.5;
    const T = V3(Math.sin(ph2) * 0.016, 0.115 + i * 0.011, Math.cos(ph2) * 0.016);
    const dir = new THREE.Vector3().subVectors(T, B).normalize();
    T.addScaledVector(dir, 0.022);
    const len = B.distanceTo(T), rad = 0.0165 + rnd() * 0.004;
    const g = logGeom(len, rad, seed * 20 + i, { seg: 12, nb: 5, bn: 3, capN: 3, tone: 0.3 + rnd() * 0.5, char: 0.05, barkAmp: 0.09 });
    between(g, B, T);
    shade(g, (p, n) => {
      let k = groundAO(p.y, 0.035, 0.3) * ballAO(p, n, balls, 0.5);
      k *= lerp(0.7, 1, sstep(0.0, 0.06, p.y)); // 下方被木柴、灰烬挡住
      return k;
    });
    parts.push(g);
  }
  for (const g of parts) if (!g.userData.done) shade(g, (p, n) => skyAO(n, 0.1));
  // 石头：贴地变暗 + 彼此之间
  for (let i = 0; i < NS; i++) shade(parts[i], (p, n) => groundAO(p.y, 0.035, 0.18) * ballAO(p, n, balls.filter((_, j) => j !== i && Math.hypot(balls[j][0] - balls[i][0], balls[j][2] - balls[i][2]) < 0.11), 0.7));
  return { geometry: assemble(parts, 0), anchors: { fire: [0, 0.02, 0] } };
}

/* ============================================================
 * 3. 原木坐凳
 * ============================================================ */
export function logSeat(seed = 1) {
  const rnd = mulberry32(seed * 313 + 11);
  const parts = [];
  const rad = 0.062, len = 0.32, cy = 0.088, top = 0.046;
  const log = logGeom(len, rad, seed, { seg: 28, nb: 16, bn: 4, capN: 4, bev: 0.14, dome: 0.04, barkAmp: 0.06, tone: 0.35 });
  log.rotateZ(Math.PI / 2);
  displace(log, (p) => { if (p.y > top) p.y = top + (p.y - top) * 0.1; });
  paint(log, (p, n, c) => {
    // 坐面：锯平的浅色木面
    const f = sstep(top - 0.012, top - 0.002, p.y) * sstep(len / 2 - 0.012, len / 2 - 0.03, Math.abs(p.x));
    const cut = new THREE.Color().copy(PAL.cut).lerp(PAL.wood, 0.25 + 0.2 * vnoise(p.x * 60, 0, p.z * 8, seed));
    c.lerp(cut, f);
  });
  place(log, 0, cy, 0, 0, 0.03, 0.01);
  // 小树桩节疤（断枝）
  const stub = logGeom(0.05, 0.011, seed + 4, { seg: 9, nb: 3, bn: 2, capN: 2, bev: 0.25, tone: 0.5 });
  between(stub, V3(0.05, cy - 0.012, 0.055), V3(0.062, cy - 0.003, 0.108));
  parts.push(log, stub);
  // 垫木
  const bal = [[-0.1, 0.017, 0, 0.034], [0.1, 0.017, 0, 0.034]];
  for (const sx of [-1, 1]) {
    const b = softBox(0.058, 0.036, 0.1, 0.009, 2, [1, 0, 1]);
    displace(b, (p) => (fbm(p.x * 50 + sx, p.y * 30, p.z * 50, seed, 3) - 0.5) * 0.006);
    paint(b, (p, n, c) => {
      const q = fbm(p.x * 40, p.y * 6, p.z * 40, seed + sx, 3);
      c.copy(PAL.wood).lerp(PAL.woodDk, 0.5 + sstep(0.6, 0.3, q) * 0.4);
    });
    place(b, sx * 0.1 + (rnd() - 0.5) * 0.01, 0.018, (rnd() - 0.5) * 0.008, 0, sx * 0.12 + (rnd() - 0.5) * 0.1, 0);
    parts.push(b);
  }
  shade(log, (p, n) => {
    const under = sstep(cy - rad * 0.2, cy - rad, p.y); // 圆木底部贴垫木
    return skyAO(n, 0.14) * (1 - 0.35 * under * (Math.abs(Math.abs(p.x) - 0.1) < 0.05 ? 1 : 0.4));
  });
  shade(stub, (p, n) => skyAO(n, 0.1) * lerp(0.6, 1, sstep(0.0, 0.03, Math.hypot(p.x - 0.05, p.z - 0.055) - 0.012)));
  for (const b of parts.slice(2)) shade(b, (p, n) => groundAO(p.y, 0.03, 0.3) * (p.y > 0.028 && n.y > 0.5 ? 0.5 : 1) * skyAO(n, 0.1));
  return { geometry: assemble(parts, 0), anchors: {} };
}

/* ============================================================
 * 4. 柴堆
 * ============================================================ */
export function woodPile(seed = 1) {
  const rnd = mulberry32(seed * 419 + 13);
  const parts = [];
  const rows = [4, 3, 4, 3], D = 0.0475, dy = 0.0412;
  let idx = 0;
  const logs = [];
  rows.forEach((cnt, j) => {
    for (let k = 0; k < cnt; k++) {
      const rad = 0.0225 + rnd() * 0.0028;
      const z = (k - (cnt - 1) / 2) * D * 1.01 + (rnd() - 0.5) * 0.002;
      const y = 0.0235 + j * dy;
      const len = 0.285 + rnd() * 0.03;
      const g = logGeom(len, rad, seed * 40 + idx, { seg: 10, nb: 3, bn: 2, capN: 3, bev: 0.2, dome: 0.03, tone: rnd() * 0.9, barkAmp: 0.06 });
      g.rotateZ(Math.PI / 2);
      place(g, (rnd() - 0.5) * 0.018, y, z, (rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.05, 0);
      logs.push({ g, y, z });
      parts.push(g);
      idx++;
    }
  });
  // 两侧的立桩
  const stakes = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = logGeom(0.172, 0.0085, seed + 70 + sx * 3 + sz, { seg: 7, nb: 3, bn: 2, capN: 1, bev: 0.35, dome: 0.1, tone: 0.8 });
    place(g, sx * 0.108, 0.086, sz * 0.112, 0, 0, sz * 0.025 * -1);
    stakes.push(g); parts.push(g);
  }
  for (const L of logs) shade(L.g, (p, n) => {
    // 上下左右都被相邻的木头夹住：靠近堆内部更暗，两端截面更亮
    const interior = 1 - sstep(0.12, 0.145, Math.abs(p.x));
    return groundAO(p.y, 0.03, 0.3) * skyAO(n, 0.22) * lerp(1, 0.78 + 0.22 * (n.y > 0.3 ? 1 : 0), interior * 0.9);
  });
  for (const g of stakes) shade(g, (p, n) => groundAO(p.y, 0.03, 0.3) * skyAO(n, 0.1));
  return { geometry: assemble(parts, 0), anchors: {} };
}

/* ============================================================
 * 5. 灯塔
 * ============================================================ */
function archShape(w, h) {
  const s = new THREE.Shape(), r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
  return s;
}
function archGeom(w, h, depth, bev, cs = 8, bs = 1) {
  const g = new THREE.ExtrudeGeometry(archShape(w, h), { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: bs, curveSegments: cs });
  return smooth(g);
}

export function lighthouse(seed = 1) {
  const rnd = mulberry32(seed * 523 + 17);
  const sd = seed * 2.3;
  const parts = [];

  // ---- 石砌圆形底座（逐层、错缝的石块起伏） ----
  const PH = 0.2, PR0 = 0.37, PR1 = 0.335, NC = 3, CH = PH / NC, NST = 12, SEG = 48;
  const plinthR = (y) => lerp(PR0, PR1, clamp(y / PH));
  const stoneH = (c, k) => hash3(c, k, 5, seed);
  {
    const prof = [];
    for (let k = 0; k <= NC * 3; k++) { const y = (k * CH) / 3; prof.push([plinthR(y), y]); }
    prof.push([PR1 - 0.012, PH + 0.007], [0.3, PH + 0.011], [0.25, PH + 0.011], [0.2, PH + 0.011]);
    const g = smooth(lathe(prof, SEG));
    displace(g, (p) => {
      if (p.y > PH + 0.002) return (fbm(p.x * 20, 0, p.z * 20, seed, 2) - 0.5) * 0.006;
      const th = Math.atan2(p.x, p.z) + Math.PI;
      const c = clamp(Math.floor(p.y / CH + 1e-4), 0, NC - 1);
      const u = (th / TAU) * NST + (c % 2) * 0.5, sid = Math.floor(u), fu = u - sid;
      const fv = p.y / CH - Math.floor(p.y / CH + 1e-4);
      const du = Math.min(fu, 1 - fu) * ((TAU * plinthR(p.y)) / NST), dv = Math.min(fv, 1 - fv) * CH;
      const b = sstep(0, 0.026, Math.min(du, dv));
      return b * (0.013 + 0.012 * stoneH(c, sid)) + (fbm(p.x * 26, p.y * 26, p.z * 26, seed + 1, 3) - 0.5) * 0.007;
    });
    paint(g, (p, n, c) => {
      const q = fbm(p.x * 16 + sd, p.y * 16, p.z * 16, seed + 2, 3);
      const th = Math.atan2(p.x, p.z) + Math.PI;
      const cc = clamp(Math.floor(p.y / CH + 1e-4), 0, NC - 1);
      const u = (th / TAU) * NST + (cc % 2) * 0.5, sid = Math.floor(u + 1e-6);
      const tone = stoneH(cc, sid);
      c.copy(PAL.stone).lerp(PAL.stoneDk, sstep(0.58, 0.3, q) * 0.6 + (tone - 0.5) * 0.3);
      c.lerp(PAL.cut, (tone > 0.8 ? 0.1 : 0));
      const fv = p.y / CH - Math.floor(p.y / CH + 1e-4);
      const fu = u - Math.floor(u);
      const edge = Math.min(Math.min(fu, 1 - fu) * 2.6, Math.min(fv, 1 - fv) * 1.5);
      const crev = 1 - sstep(0.0, 0.5, edge);
      const mq = fbm(p.x * 9 + sd, p.y * 9, p.z * 9, seed + 3, 3);
      const mossAmt = sstep(0.5, 0.72, mq) * (0.35 + 0.65 * crev) * (0.5 + 0.5 * (1 - sstep(0.0, PH, p.y)));
      c.lerp(PAL.moss, mossAmt * 0.85 * (p.y < PH + 0.01 ? 1 : 0.5));
      c.multiplyScalar(lerp(0.5, 1, 1 - crev * 0.9) * groundAO(p.y, 0.09, 0.3));
      if (p.y > PH + 0.003) c.multiplyScalar(0.92 + 0.15 * q);
    });
    parts.push(g);
  }
  // ---- 脚下的大圆石（门前留空） ----
  const NB = 5;
  for (let i = 0; i < NB; i++) {
    const ang = Math.PI * 0.35 + (i / (NB - 1)) * Math.PI * 1.3 + (rnd() - 0.5) * 0.2;
    const rx = 0.055 + rnd() * 0.03, ry = 0.04 + rnd() * 0.03, rz = 0.05 + rnd() * 0.025;
    const g = stoneGeom(rx, ry, rz, seed * 30 + i, { w: 10, h: 7, moss: 0.5 + rnd() * 0.3, amp: 0.2 });
    const rad = PR0 + 0.012 + (rnd() - 0.5) * 0.02;
    const x = Math.sin(ang + Math.PI) * rad, z = Math.cos(ang + Math.PI) * rad;
    place(g, x, -g.userData.base - 0.006, z, 0, ang + (rnd() - 0.5) * 0.6, 0);
    shade(g, (p, n) => groundAO(p.y, 0.05, 0.2));
    parts.push(g);
  }
  // ---- 门前台阶 ----
  for (const [w, h, d, z, y] of [[0.21, 0.068, 0.15, 0.455, 0.034], [0.17, 0.134, 0.13, 0.42, 0.067]]) {
    const s = softBox(w, h, d, 0.012, 1, [1, 0, 0]);
    displace(s, (p) => (fbm(p.x * 30, p.y * 30, p.z * 30, seed + 7, 3) - 0.5) * 0.007);
    paint(s, (p, n, c) => {
      const q = fbm(p.x * 18, p.y * 18, p.z * 18, seed + 8, 3);
      c.copy(PAL.stone).lerp(PAL.stoneDk, sstep(0.6, 0.3, q) * 0.5).lerp(PAL.cut, 0.06);
    });
    place(s, 0, y, z, 0, (rnd() - 0.5) * 0.05, 0);
    shade(s, (p, n) => groundAO(p.y, 0.05, 0.25) * skyAO(n, 0.15));
    parts.push(s);
  }

  // ---- 塔身：下粗上细、红白 3 段，略有手工的不规则 ----
  const T0 = 0.19, T1 = 1.455, TR0 = 0.24, TR1 = 0.165;
  const towerR = (y) => lerp(TR0, TR1, Math.pow(clamp((y - T0) / (T1 - T0)), 0.95));
  const yb = [T0 + (T1 - T0) / 3, T0 + ((T1 - T0) * 2) / 3];
  {
    const ys = [];
    const seg3 = [[T0, yb[0]], [yb[0], yb[1]], [yb[1], T1]];
    seg3.forEach(([a, b], k) => {
      const lo = k === 0 ? a : a + 0.02, hi = k === 2 ? b : b - 0.02;
      const n = 3;
      for (let m = 0; m <= n; m++) ys.push(lerp(lo, hi, m / n));
      if (k < 2) ys.push(b - 0.005, b + 0.005); // 压在分界线上的凸缘
    });
    ys.sort((p, q) => p - q);
    const lipAt = (y) => {
      let lip = 0;
      for (const b of yb) lip = Math.max(lip, 0.011 * Math.exp(-Math.pow((y - b) / 0.009, 2)));
      return lip;
    };
    const prof = ys.map((y) => [towerR(y) + lipAt(y), y]);
    prof.unshift([0, T0 - 0.02], [towerR(T0) + 0.002, T0 - 0.02]);
    prof.push([TR1 - 0.02, T1], [0, T1]);
    const g = smooth(lathe(prof, 20));
    displace(g, (p) => {
      const rr = Math.hypot(p.x, p.z) || 1;
      const w = 1 + 0.014 * (vnoise(p.x * 5 + sd, p.y * 2.2, p.z * 5, seed) - 0.5) * 2;
      p.x *= w; p.z *= w;
      p.x += 0.006 * Math.sin(p.y * 2.6 + sd) * sstep(T0, T1, p.y);
      p.z += 0.005 * Math.cos(p.y * 2.1 + sd) * sstep(T0, T1, p.y);
    });
    paint(g, (p, n, c) => {
      const base = p.y < yb[0] - 0.004 || p.y > yb[1] + 0.004 ? PAL.red : PAL.white;
      // 在分界线处混合：凸缘带一点奶白
      const q = fbm(p.x * 16 + sd, p.y * 3.2, p.z * 16, seed + 4, 3);
      c.copy(base);
      if (base === PAL.red) c.lerp(PAL.woodDk, sstep(0.5, 0.2, q) * 0.22); else c.lerp(PAL.stone, sstep(0.55, 0.25, q) * 0.22);
      c.multiplyScalar(0.93 + 0.14 * q);
      // 雨水冲刷的污渍：凸缘下方、贴近地面
      let ao = 1;
      for (const b of yb) { const d = p.y - b; if (d < 0.005) ao *= 1 - 0.2 * Math.exp(-Math.max(0, 0.005 - d) / 0.05); }
      ao *= lerp(0.62, 1, sstep(T0, T0 + 0.35, p.y));
      ao *= lerp(0.6, 1, sstep(T1, T1 - 0.1, p.y)); // 顶部在平台下
      c.multiplyScalar(ao);
    });
    parts.push(g);
  }
  // ---- 前门（拱形木门 + 石门框）、两扇小窗 ----
  {
    const zT = (y) => towerR(y);
    const tilt = -Math.atan((TR0 - TR1) / (T1 - T0));
    const fr = archGeom(0.118, 0.19, 0.02, 0.004);
    paint(fr, (p, n, c) => { c.copy(PAL.stone).lerp(PAL.white, 0.25).multiplyScalar(0.85 + 0.15 * vnoise(p.x * 50, p.y * 50, 0, seed)); });
    place(fr, 0, T0 + 0.012, zT(T0 + 0.1) - 0.01, tilt);
    shade(fr, (p, n) => 0.9 * skyAO(n, 0.1));
    parts.push(fr);
    const dr = archGeom(0.092, 0.172, 0.016, 0.004);
    paint(dr, (p, n, c) => {
      const plank = Math.floor((p.x + 0.046) / 0.0153);
      const gr = Math.abs(((p.x + 0.046) / 0.0153) - plank - 0.5);
      c.copy(PAL.wood).lerp(PAL.woodDk, 0.25 + 0.5 * hash3(plank, 3, 1, seed) * 0.6 + sstep(0.38, 0.5, gr) * 0.35);
      const strap = (y0) => sstep(0.006, 0.0, Math.abs(p.y - y0));
      c.lerp(PAL.metal, Math.max(strap(0.045), strap(0.105)) * 0.9);
    });
    place(dr, 0, T0 + 0.02, zT(T0 + 0.1) - 0.003, tilt);
    shade(dr, (p, n) => skyAO(n, 0.1) * lerp(0.75, 1, sstep(0.0, 0.06, p.y)));
    parts.push(dr);
    const knob = smooth(new THREE.SphereGeometry(0.0075, 8, 6));
    paint(knob, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.stone, 0.3); });
    place(knob, 0.026, T0 + 0.1, zT(T0 + 0.1) + 0.016);
    parts.push(knob);
    for (const wy of [0.78, 1.16]) {
      const tl = -Math.atan((TR0 - TR1) / (T1 - T0));
      const wf = archGeom(0.064, 0.108, 0.012, 0.004);
      paint(wf, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.stone, 0.18).multiplyScalar(0.9 + 0.2 * vnoise(p.x * 80, p.y * 80, 0, seed)); });
      place(wf, 0, wy, zT(wy) - 0.006, tl);
      const gl = archGeom(0.044, 0.088, 0.012, 0.002);
      paint(gl, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.lamp, 0.12 + 0.3 * sstep(0.0, 0.088, p.y)); c.multiplyScalar(0.55 + 0.55 * sstep(0.0, 0.088, p.y)); });
      place(gl, 0, wy + 0.01, zT(wy) - 0.001, tl);
      const sill = softBox(0.076, 0.012, 0.03, 0.004, 1, [1, 0, 0]);
      paint(sill, (p, n, c) => { c.copy(PAL.stone).lerp(PAL.white, 0.3); });
      place(sill, 0, wy - 0.005, zT(wy) + 0.004, tl);
      shade(wf, (p, n) => skyAO(n, 0.1)); shade(gl, (p, n) => skyAO(n, 0.1)); shade(sill, (p, n) => skyAO(n, 0.12) * 0.9);
      parts.push(wf, gl, sill);
    }
  }
  // ---- 挑出的平台（深色金属）+ 栏杆 ----
  const GY = 1.455, GR = 0.272;
  {
    const prof = [[0.17, GY - 0.1], [0.176, GY - 0.082], [0.2, GY - 0.058], [0.235, GY - 0.03], [GR - 0.008, GY - 0.012], [GR, GY], [GR - 0.002, GY + 0.01], [GR - 0.012, GY + 0.014], [0.2, GY + 0.014], [0.14, GY + 0.014]];
    const g = smooth(lathe(prof, 20));
    displace(g, (p) => (vnoise(p.x * 40, p.y * 40, p.z * 40, seed + 6) - 0.5) * 0.002);
    paint(g, (p, n, c) => {
      c.copy(PAL.metal).lerp(PAL.white, 0.25 * sstep(GY - 0.12, GY - 0.03, p.y) * (n.y < -0.2 ? 1 : 0.4));
      c.multiplyScalar(n.y < -0.3 ? 0.65 : 1);
    });
    parts.push(g);
    const NR = 14;
    for (let i = 0; i < NR; i++) {
      const a = (i / NR) * TAU;
      const post = smooth(new THREE.CylinderGeometry(0.0045, 0.0055, 0.082, 5, 1, true));
      paint(post, (p, n, c) => { c.copy(PAL.metal).multiplyScalar(0.85 + 0.3 * sstep(-0.04, 0.04, p.y)); });
      place(post, Math.sin(a) * (GR - 0.017), GY + 0.014 + 0.039, Math.cos(a) * (GR - 0.017));
      parts.push(post);
    }
    const rail = smooth(new THREE.TorusGeometry(GR - 0.017, 0.0065, 5, 24));
    rail.rotateX(Math.PI / 2);
    paint(rail, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.stone, 0.15 + 0.15 * n.y); });
    place(rail, 0, GY + 0.014 + 0.082, 0);
    parts.push(rail);
  }
  // ---- 玻璃灯室（灯光色）+ 金属窗棂 + 圆顶 + 尖顶 ----
  const LY0 = GY + 0.012, LY1 = 1.72;
  {
    const prof = [];
    for (let k = 0; k <= 5; k++) prof.push([0.105, lerp(LY0, LY1, k / 5)]);
    prof.unshift([0, LY0]); prof.push([0.1, LY1 + 0.005], [0, LY1 + 0.005]);
    const g = smooth(lathe(prof, 20));
    const bright = new THREE.Color().copy(PAL.lamp).lerp(PAL.white, 0.1);
    paint(g, (p, n, c) => {
      c.copy(PAL.lamp).lerp(bright, sstep(LY0, LY1, p.y) * 0.8 + 0.1 * vnoise(p.x * 30, p.y * 30, p.z * 30, seed));
      c.multiplyScalar(0.8 + 0.1 * sstep(LY0, (LY0 + LY1) / 2, p.y));
    });
    parts.push(g);
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * TAU;
      const m = smooth(new THREE.CylinderGeometry(0.0058, 0.0058, LY1 - LY0 + 0.004, 5, 1, true));
      paint(m, (p, n, c) => { c.copy(PAL.metal); });
      place(m, Math.sin(a) * 0.108, (LY0 + LY1) / 2, Math.cos(a) * 0.108);
      parts.push(m);
    }
    const baseRing = smooth(lathe([[0.1, LY0 - 0.004], [0.126, LY0 - 0.004], [0.128, LY0 + 0.006], [0.12, LY0 + 0.016], [0.108, LY0 + 0.016]], 24));
    paint(baseRing, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.stone, 0.1); });
    shade(baseRing, (p, n) => skyAO(n, 0.15));
    parts.push(baseRing);
    const dome = smooth(lathe([[0.108, LY1 - 0.006], [0.136, LY1 - 0.006], [0.14, LY1 + 0.005], [0.15, LY1 + 0.018], [0.142, LY1 + 0.034], [0.12, LY1 + 0.07], [0.092, LY1 + 0.102], [0.056, LY1 + 0.128], [0.026, LY1 + 0.143],
      [0.02, LY1 + 0.152], [0.021, LY1 + 0.164], [0.018, LY1 + 0.173], [0.01, LY1 + 0.181], [0.0075, LY1 + 0.21], [0.003, LY1 + 0.26], [0, LY1 + 0.28]], 20));
    paint(dome, (p, n, c) => {
      c.copy(PAL.metal).lerp(PAL.stone, 0.1 + 0.18 * sstep(0.5, 1, n.y) * vnoise(p.x * 20, p.y * 20, p.z * 20, seed));
      c.lerp(PAL.red, 0.0);
    });
    shade(dome, (p, n) => skyAO(n, 0.2) * lerp(0.7, 1, sstep(LY1 - 0.005, LY1 + 0.04, p.y)));
    parts.push(dome);
  }
  // ---- 平台下方 / 底部 AO ----
  const geometry = assemble(parts, 0);
  return { geometry, anchors: { lamp: [0, 1.6, 0], door: [0, 0, 0.56] } };
}

/* ============================================================
 * 6. 小木船（原点在水线，船底 y≈-0.05，船头朝 +z）
 * ============================================================ */
export function rowBoat(seed = 1) {
  const rnd = mulberry32(seed * 631 + 19);
  const sd = seed * 1.7;
  const parts = [];
  const L = 0.55, BM = 0.132, TH = 0.011, NX = 2.4, UM = 0.42, M = 6, NU = 30;
  const hp = (u) => {
    let s, a, b, sb = 0, ss = 0;
    if (u < UM) { s = (UM - u) / UM; a = 3.2; b = 0.55; ss = s; } else { s = (u - UM) / (1 - UM); a = 1.9; b = 0.85; sb = s; }
    return {
      B: BM * Math.pow(Math.max(0, 1 - Math.pow(s, a)), b),
      yt: 0.066 + 0.034 * sb * sb + 0.014 * ss * ss,
      yb: -0.052 + 0.045 * Math.pow(sb, 2.2) + 0.016 * ss * ss,
    };
  };
  const halfWidth = (z, y) => {
    const { B, yb, yt } = hp(clamp((z + L / 2) / L)), D = yt - yb;
    const a = Math.acos(Math.pow(clamp((yt - y) / D), NX / 2));
    return B * Math.pow(Math.sin(a), 2 / NX);
  };
  // 截面：内舷 → 内底 → 内舷 → 船沿 → 外舷 → 外底 → 外舷 → 船沿（闭合）
  const ring = (u) => {
    const { B, yb, yt } = hp(u), D = yt - yb, Bi = Math.max(0, B - TH), ybi = yb + TH, Di = yt - ybi;
    const pt = (Bw, Dw, y0, j, sg) => { const a = (j / M) * Math.PI / 2; return [sg * Bw * Math.pow(Math.sin(a), 2 / NX), y0 - Dw * Math.pow(Math.cos(a), 2 / NX)]; };
    const pts = [];
    for (let j = M; j >= 0; j--) pts.push(pt(Bi, Di, yt, j, 1));
    for (let j = 1; j <= M; j++) pts.push(pt(Bi, Di, yt, j, -1));
    pts.push([-(Bi + (B - Bi) * 0.25), yt + 0.0035], [-(Bi + (B - Bi) * 0.75), yt + 0.0035]);
    for (let j = M; j >= 1; j--) pts.push(pt(B, D, yt, j, -1));
    pts.push(pt(B, D, yt, 0, 1));
    for (let j = 1; j <= M; j++) pts.push(pt(B, D, yt, j, 1));
    pts.push([Bi + (B - Bi) * 0.75, yt + 0.0035], [Bi + (B - Bi) * 0.25, yt + 0.0035]);
    return pts;
  };
  const rings = [];
  for (let j = 0; j <= NU; j++) rings.push(ring(j / NU));
  const cols = rings[0].length;
  {
    let g = grid(cols, NU + 1, (i, j, v) => { const q = rings[j][i]; v[0] = q[0]; v[1] = q[1]; v[2] = -L / 2 + (j / NU) * L; });
    orientOutward(g);
    g = smooth(g);
    displace(g, (p) => { p.y += (vnoise(p.x * 14 + sd, p.y * 14, p.z * 14, seed, 2) - 0.5) * 0.003; });
    paint(g, (p, n, c) => {
      const u = clamp((p.z + L / 2) / L), { yb, yt } = hp(u), D = yt - yb;
      const yc = yb + D * 0.6, ox = p.x, oy = p.y - yc;
      const outer = n.x * ox + n.y * oy > 0;
      const rim = p.y > yt - 0.0045 && Math.abs(n.y) > 0.35;
      const streak = fbm(p.x * 20 + sd, p.y * 40, p.z * 5, seed + 3, 3);
      if (rim) {
        c.copy(PAL.wood).lerp(PAL.cut, 0.35 + 0.2 * streak);
      } else if (outer) {
        const a = Math.acos(Math.pow(clamp((yt - p.y) / D), NX / 2));
        const idx = Math.round((a / (Math.PI / 2)) * M);
        c.copy(PAL.wood).lerp(PAL.woodDk, 0.1 + 0.45 * sstep(0.55, 0.3, streak));
        c.multiplyScalar(0.86 + 0.2 * hash3(idx, 1, 0, seed) + (idx & 1) * 0.06);
        if (p.y < 0) c.lerp(PAL.woodDk, 0.35 * sstep(0, -0.04, p.y));
        c.multiplyScalar(lerp(0.78, 1, sstep(-0.02, 0.02, p.y)));
      } else {
        c.copy(PAL.wood).lerp(PAL.cut, 0.3 + 0.25 * streak);
        c.lerp(PAL.woodDk, 0.15 * sstep(0.5, 0.25, streak));
        c.multiplyScalar(lerp(0.5, 1, sstep(yb + TH, yt - 0.01, p.y)));
      }
      c.multiplyScalar(skyAO(n, 0.08));
    });
    parts.push(g);
  }
  // ---- 两块坐板 ----
  const SY = 0.04, seatZ = [0.1, -0.095];
  for (let k = 0; k < 2; k++) {
    const z = seatZ[k], hw = halfWidth(z, SY) - 0.005;
    const s = softBox(hw * 2, 0.012, 0.052, 0.004, 2, [8, 0, 0]);
    displace(s, (p) => (vnoise(p.x * 30, p.y * 30, p.z * 30, seed + k, 2) - 0.5) * 0.002);
    paint(s, (p, n, c) => {
      const q = fbm(p.x * 8 + k * 5, p.y * 60, p.z * 40, seed + 9, 3);
      c.copy(PAL.wood).lerp(PAL.cut, 0.35 + 0.3 * q).lerp(PAL.woodDk, 0.2 * sstep(0.5, 0.2, q));
      c.multiplyScalar((0.6 + 0.4 * sstep(-0.9, 0.5, n.y)) * lerp(0.7, 1, sstep(hw, hw - 0.025, Math.abs(p.x))));
    });
    place(s, 0, SY, z, 0, (rnd() - 0.5) * 0.04, 0);
    parts.push(s);
  }
  // ---- 一对木桨（搭在船舷上） ----
  const oars = [
    { h: V3(-0.062, 0.093, 0.04), d: V3(1, -0.115, -0.13), roll: 1.2 },
    { h: V3(0.05, 0.101, -0.025), d: V3(-1, -0.115, -0.1), roll: -1.2 },
  ];
  oars.forEach((o, k) => {
    const dir = o.d.clone().normalize(), len = 0.33;
    const A = o.h.clone(), Bp = o.h.clone().addScaledVector(dir, len);
    const shaft = logGeom(len, 0.0058, seed + 40 + k, { seg: 8, nb: 8, bn: 2, capN: 1, bev: 0.5, dome: 0.1, tone: 0.1, barkAmp: 0.02 });
    paint(shaft, (p, n, c) => { c.copy(PAL.wood).lerp(PAL.cut, 0.35 + 0.15 * vnoise(p.x * 200, p.y * 30, p.z * 200, seed)); });
    const blade = smooth(new THREE.SphereGeometry(1, 12, 8));
    displace(blade, (p) => { p.x *= 0.0175; p.y *= 0.05; p.z *= 0.0042; p.y += len / 2 - 0.045; });
    blade.rotateY(o.roll);
    paint(blade, (p, n, c) => {
      const t = sstep(len / 2 - 0.09, len / 2, p.y);
      c.copy(PAL.wood).lerp(PAL.cut, 0.4 + 0.25 * t).multiplyScalar(0.95 + 0.1 * vnoise(p.x * 60, p.y * 40, p.z * 60, seed + k));
    });
    const grip = smooth(new THREE.SphereGeometry(1, 8, 6));
    displace(grip, (p) => { p.x *= 0.0085; p.y *= 0.0085; p.z *= 0.0085; p.y += -len / 2 + 0.002; });
    paint(grip, (p, n, c) => { c.copy(PAL.woodDk).lerp(PAL.wood, 0.4); });
    for (const g of [shaft, blade, grip]) { between(g, A, Bp); shade(g, (p, n) => skyAO(n, 0.12)); parts.push(g); }
  });
  // ---- 船头的绳圈 ----
  for (let k = 0; k < 2; k++) {
    const t = smooth(new THREE.TorusGeometry(0.02 - k * 0.002, 0.0052, 6, 18));
    t.rotateX(Math.PI / 2);
    paint(t, (p, n, c) => { c.copy(PAL.rope).lerp(PAL.woodDk, 0.2 + 0.25 * Math.sin(Math.atan2(p.z, p.x) * 11 + k)); c.multiplyScalar(lerp(0.65, 1, k)); });
    place(t, 0.004 * k, -0.0138 + k * 0.008, 0.185, 0, 0.4 * k, 0);
    parts.push(t);
  }
  return { geometry: assemble(parts), anchors: {} };
}

/* ============================================================
 * 7. 木栅栏
 * ============================================================ */
export function fence(seed = 1) {
  const rnd = mulberry32(seed * 733 + 23);
  const parts = [];
  const px = [-0.34, 0, 0.34], posts = [];
  px.forEach((x, k) => {
    const h = 0.198 + (rnd() - 0.5) * 0.024, rad = 0.0215 + (rnd() - 0.5) * 0.002;
    const g = logGeom(h, rad, seed * 5 + k, { seg: 12, nb: 6, bn: 3, capN: 3, bev: 0.45, dome: 0.12, tone: 0.2 + rnd() * 0.5, barkAmp: 0.09 });
    g.translate(0, h / 2, 0);
    const tx = (rnd() - 0.5) * 0.1, tz = (rnd() - 0.5) * 0.1;
    place(g, x + (rnd() - 0.5) * 0.012, 0, (rnd() - 0.5) * 0.008, tx, 0, tz);
    posts.push(g); parts.push(g);
  });
  const balls = px.flatMap((x) => [[x, 0.07, 0, 0.03], [x, 0.138, 0, 0.03]]);
  [0.07, 0.138].forEach((ry, k) => {
    const r = softBox(0.84, 0.025, 0.02, 0.0075, 2, [20, 0, 0]);
    const bow = (rnd() - 0.5) * 0.006, slope = (rnd() - 0.5) * 0.01;
    displace(r, (p) => {
      const q = vnoise(p.x * 40 + k, p.y * 40, p.z * 40, seed + 2, 2) - 0.5;
      p.y += 0.004 * Math.sin(p.x * 5 + k * 2 + seed) + bow * (1 - p.x * p.x * 5) + slope * p.x * 2 + q * 0.0025;
      p.z += 0.002 * Math.sin(p.x * 7 + k) + q * 0.002;
    });
    paint(r, (p, n, c) => {
      const q = fbm(p.x * 7 + k * 3, p.y * 70, p.z * 70, seed + 6, 3);
      c.copy(PAL.wood).lerp(PAL.cut, 0.12 + 0.2 * sstep(0.55, 0.8, q)).lerp(PAL.woodDk, 0.5 * sstep(0.5, 0.25, q) + 0.1);
      c.multiplyScalar(0.9 + 0.15 * vnoise(p.x * 3 + k, 0, 0, seed));
      if (Math.abs(p.x) > 0.405) c.lerp(PAL.cut, sstep(0.405, 0.418, Math.abs(p.x)) * 0.5);
    });
    place(r, 0, ry, 0.0305, 0, 0, 0);
    shade(r, (p, n) => skyAO(n, 0.16) * ballAO(p, n, balls.filter((b) => b[1] === ry), 0.45));
    parts.push(r);
  });
  for (const g of posts) shade(g, (p, n) => groundAO(p.y, 0.05, 0.3) * skyAO(n, 0.1));
  // 桩脚的小石块
  for (let k = 0; k < 3; k++) {
    const g = stoneGeom(0.032 + rnd() * 0.01, 0.02 + rnd() * 0.006, 0.026, seed * 9 + k, { w: 10, h: 7, moss: 0.5, amp: 0.2 });
    const a = rnd() * TAU;
    place(g, px[k] + Math.sin(a) * 0.03, -g.userData.base - 0.004, Math.cos(a) * 0.03 - 0.01, 0, a, 0);
    shade(g, (p, n) => groundAO(p.y, 0.03, 0.18));
    parts.push(g);
  }
  return { geometry: assemble(parts, 0), anchors: {} };
}

/* ============================================================
 * 8. 木路牌
 * ============================================================ */
export function signpost(seed = 1) {
  const rnd = mulberry32(seed * 839 + 29);
  const parts = [];
  const H = 0.4, PR = 0.0185;
  const tiltZ = 0.03, tiltX = -0.01;
  const post = logGeom(H, PR, seed, { seg: 14, nb: 14, bn: 3, capN: 3, bev: 0.5, dome: 0.15, tone: 0.45, barkAmp: 0.08 });
  post.translate(0, H / 2, 0);
  const mount = (g) => place(g, 0, 0, 0, tiltX, 0, tiltZ);
  mount(post);
  shade(post, (p, n) => groundAO(p.y, 0.06, 0.3) * skyAO(n, 0.12));
  parts.push(post);
  const boards = [
    { y: 0.335, dir: 1, yaw: -0.38, len: 0.17 },
    { y: 0.262, dir: -1, yaw: 0.3, len: 0.15 },
  ];
  boards.forEach((b, k) => {
    const h = 0.05, th = 0.013;
    const g = softBox(b.len, h, th, 0.004, 2, [10, 1, 0]);
    const x0 = b.len / 2 - h * 0.85;
    displace(g, (p) => {
      const t = clamp((p.x * b.dir - x0) / (h * 0.85));
      p.y *= 1 - 0.9 * t * t * (3 - 2 * t);
      p.y += (vnoise(p.x * 30, p.y * 30, k, seed, 2) - 0.5) * 0.002;
    });
    paint(g, (p, n, c) => {
      const q = fbm(p.x * 9 + k * 4, p.y * 80, p.z * 80, seed + 3, 3);
      c.copy(PAL.wood).lerp(PAL.cut, 0.3 + 0.25 * sstep(0.45, 0.8, q)).lerp(PAL.woodDk, 0.4 * sstep(0.45, 0.2, q));
      // 刻出来的箭头符号（深色细线）
      const ln = sstep(0.003, 0.0, Math.abs(p.y)) * sstep(b.len / 2 - 0.03, b.len / 2 - 0.045, Math.abs(p.x)) * (n.z > 0.5 ? 1 : 0);
      c.lerp(PAL.woodDk, ln * 0.7);
      c.multiplyScalar(0.6 + 0.4 * sstep(-0.8, 0.5, n.y));
    });
    place(g, b.dir * (0.026 + 0.0), b.y, PR + th / 2 - 0.0015);
    const yaw = new THREE.Matrix4().makeRotationY(b.yaw);
    g.applyMatrix4(yaw);
    mount(g);
    shade(g, (p, n) => skyAO(n, 0.12));
    parts.push(g);
    for (const nx of [-b.dir * 0.044, b.dir * 0.062]) {
      const nail = smooth(new THREE.SphereGeometry(0.0042, 7, 5));
      paint(nail, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.stone, 0.25); });
      place(nail, b.dir * 0.026 + nx, b.y, PR + th - 0.003);
      nail.applyMatrix4(yaw); mount(nail);
      parts.push(nail);
    }
  });
  // 木杆脚下的石头
  for (let k = 0; k < 4; k++) {
    const g = stoneGeom(0.03 + rnd() * 0.012, 0.02 + rnd() * 0.008, 0.028, seed * 11 + k, { w: 10, h: 7, moss: 0.4, amp: 0.2 });
    const a = (k / 4) * TAU + rnd() * 0.6 + 0.5;
    place(g, Math.sin(a) * 0.04, -g.userData.base - 0.005, Math.cos(a) * 0.04, 0, a, 0);
    shade(g, (p, n) => groundAO(p.y, 0.03, 0.18));
    parts.push(g);
  }
  return { geometry: assemble(parts, 0), anchors: {} };
}
