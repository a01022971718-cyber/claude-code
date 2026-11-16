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

/* ============================================================
 * 新增模型共用的小工具（风车 / 钟楼 / 村民 / 补给箱）
 * ============================================================ */
const P2 = {
  bronze: hex(0xb5783c), bronzeDk: hex(0x66401f), patina: hex(0x5f9a84),
  slate: hex(0x4a5159), slateLt: hex(0x6d757e),
  shingle: hex(0x9b4b31), shingleDk: hex(0x5c2819), shingleLt: hex(0xb8643f),
  plank: hex(0xd8c9a6), tar: hex(0x2b211b), mortar: hex(0x6f6a62),
  stoneLt: hex(0xa7a49c), cloth: hex(0xece3cd), sail: hex(0xcdb38a),
};

/** 8 顶点六面体（0-3 底面一圈，4-7 顶面一圈，对应顺序），平直法线，自动朝外 */
function hexa(P) {
  const f = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  const cen = [0, 0, 0];
  for (const q of P) { cen[0] += q[0] / 8; cen[1] += q[1] / 8; cen[2] += q[2] / 8; }
  const pos = [];
  for (const t of f) {
    const a = P[t[0]], b = P[t[1]], c = P[t[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - cen[0], my = (a[1] + b[1] + c[1]) / 3 - cen[1], mz = (a[2] + b[2] + c[2]) / 3 - cen[2];
    const o = nx * mx + ny * my + nz * mz >= 0 ? [a, b, c] : [a, c, b];
    for (const q of o) pos.push(q[0], q[1], q[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/** 沿 a→b 的方形截面木条（w 沿侧向，d 沿 up 方向）。12 个三角形 */
function beam(a, b, w, d, up = V3(0, 0, 1)) {
  const ex = V3(b.x - a.x, b.y - a.y, b.z - a.z), L = ex.length(); ex.divideScalar(L);
  const ey = up.clone().addScaledVector(ex, -up.dot(ex)).normalize();
  const ez = new THREE.Vector3().crossVectors(ex, ey);
  const g = new THREE.BoxGeometry(L, d, w);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
  return g;
}

/** 多边形棱台外壳：每个面、每一层是一块单独的搭接板（下沿厚、上沿插进上一层之下）。
 *  o = { sides, start, A(y)=内切半径, ys=[层边界], cols, lip }，返回 [{ g, k, i }] */
function tieredShell(o) {
  const out = [], tn = Math.tan(Math.PI / o.sides), cols = o.cols ?? 4;
  const U = [0, 0.1, 1], D = [0.55, 1, 0];
  for (let k = 0; k < o.sides; k++) {
    const ph = o.start + (k * TAU) / o.sides, nx = Math.sin(ph), nz = Math.cos(ph), tx = Math.cos(ph), tz = -Math.sin(ph);
    for (let i = 0; i < o.ys.length - 1; i++) {
      const y0 = o.ys[i], y1 = o.ys[i + 1];
      const g = grid(cols, 3, (a, j, v) => {
        const y = lerp(y0, y1, U[j]), A = o.A(y), s = (a / (cols - 1) * 2 - 1) * A * tn, r = A + D[j] * o.lip;
        v[0] = nx * r + tx * s; v[1] = y; v[2] = nz * r + tz * s;
      }, false);
      g.computeVertexNormals();
      out.push({ g, k, i });
    }
  }
  return out;
}

/** 一面墙上的石块砌体（错缝、随机宽度、转角长短石）。
 *  o = { ph 面朝向, A(y) 内切半径, Aref, x0, x1 (在 Aref 处的横向范围), y0, y1, ch 层高, wMin, wMax, par 奇偶, rnd, seed,
 *        cornerL, cornerR, endLong, endShort, groove, base, dark, moss, ao(p,n,y) } */
function stoneWall(o) {
  const out = [], nx = Math.sin(o.ph), nz = Math.cos(o.ph), tx = Math.cos(o.ph), tz = -Math.sin(o.ph);
  const nC = Math.max(1, Math.round((o.y1 - o.y0) / o.ch)), ch = (o.y1 - o.y0) / nC, gr = o.groove ?? 0.007;
  const CF = [0, 0.1, 0.9, 1], RF = [0, 0.16, 0.84, 1];
  const rnd = o.rnd, W = o.x1 - o.x0, sd = o.seed;
  for (let c = 0; c < nC; c++) {
    const long = (c + o.par) % 2 === 0;
    let eL = 0, eR = 0;
    if (o.cornerL) eL = long ? o.endLong : o.endShort;
    if (o.cornerR) eR = long ? o.endLong : o.endShort;
    const wm = W - eL - eR;
    const nm = Math.max(1, Math.round(wm / ((o.wMin + o.wMax) / 2)));
    const ws = []; let tot = 0;
    for (let q = 0; q < nm; q++) { const w = o.wMin + (o.wMax - o.wMin) * rnd(); ws.push(w); tot += w; }
    const bl = [];
    if (eL) bl.push(eL);
    for (const w of ws) bl.push((w / tot) * wm);
    if (eR) bl.push(eR);
    let x = o.x0;
    const ya = o.y0 + c * ch, yb = ya + ch * (0.97 + 0.03 * rnd());
    bl.forEach((w, q) => {
      const xa = x, xb = x + w; x = xb;
      const tone = rnd(), pil = 0.002 + 0.004 * rnd(), lean = (rnd() - 0.5) * 0.004;
      const g = grid(4, 4, (i, j, v) => {
        const sxn = lerp(xa, xb, CF[i]), y = lerp(ya, yb, RF[j]);
        const edge = i === 0 || i === 3 || j === 0 || j === 3;
        let d = -gr;
        if (!edge) {
          d = pil + 0.0035 * (vnoise(sxn * 40 + sd, y * 40, c * 3.1 + q, sd) - 0.5) + lean * (j - 1.5) * 0.4;
          if (i === 1 || i === 2) d += 0.0008;
        }
        const A = o.A(y), s = sxn * A / o.Aref;
        v[0] = nx * (A + d) + tx * s; v[1] = y; v[2] = nz * (A + d) + tz * s;
      }, false);
      g.computeVertexNormals();
      paint(g, (p, n, col, vi) => {
        const i = vi % 4, j = (vi / 4) | 0, edge = i === 0 || i === 3 || j === 0 || j === 3;
        const f = fbm(p.x * 12 + sd, p.y * 12, p.z * 12, sd + 2, 3);
        col.copy(o.base).lerp(o.dark, clamp(sstep(0.58, 0.3, f) * 0.6 + (tone - 0.5) * 0.7, 0, 1));
        if (tone > 0.86) col.lerp(P2.stoneLt, 0.3);
        if (tone < 0.1) col.lerp(PAL.clay, 0.25);
        col.multiplyScalar(0.9 + 0.2 * f);
        const mq = fbm(p.x * 8 + sd, p.y * 7, p.z * 8, sd + 7, 3);
        const mo = (o.moss ?? 0) * sstep(0.52, 0.76, mq) * (edge ? 1 : 0.5) * (1 - sstep(0.1, 0.75, p.y));
        if (mo > 0) col.lerp(PAL.moss, mo * 0.8);
        if (edge) col.lerp(P2.mortar, 0.5).multiplyScalar(0.5);
        if (o.ao) col.multiplyScalar(o.ao(p, n, p.y));
      });
      out.push(g);
    });
  }
  return out;
}

/** 不平滑的多边形旋转体（平直法线）。rot：绕 y 的旋转。 */
function flatLathe(profile, segs, rot = 0) {
  const g = lathe(profile, segs).toNonIndexed();
  if (rot) g.rotateY(rot);
  g.computeVertexNormals();
  return g;
}
/** 单色长方体（可带轻微噪声色） */
function solidBox(w, h, d, col, seed = 0, nz = 0.12) {
  const g = new THREE.BoxGeometry(w, h, d);
  paint(g, (p, n, c) => { c.copy(col).multiplyScalar(1 - nz * 0.5 + nz * vnoise(p.x * 90 + seed, p.y * 90, p.z * 90, seed)); });
  return g;
}

/* ============================================================
 * 7. 风车（欧洲乡村塔式风车）
 *    返回 { geometry, anchors: { door, hub }, parts: { sails: { geometry(世界坐标), pivot } } }
 * ============================================================ */
export function windmill(seed = 1) {
  const rnd = mulberry32(seed * 719 + 31);
  const sd = seed * 2.9;
  const parts = [];
  const PH = 0.26, PR0 = 0.392, PR1 = 0.384;
  const T0 = PH, T1 = 0.95, A0 = 0.345, A1 = 0.232, C8 = Math.cos(Math.PI / 8);
  const TA = (y) => lerp(A0, A1, clamp((y - T0) / (T1 - T0)));
  const tilt = -Math.atan((A0 - A1) / (T1 - T0));
  const HUBY = 1.05, HUBZ = 0.44, SR = 0.55;

  /* ---- 石砌圆形底座 ---- */
  const NC = 4, CH = PH / NC, NST = 15, SEG = 60;
  const plinthR = (y) => lerp(PR0, PR1, clamp(y / PH));
  const stoneH = (c, k) => hash3(c, k, 11, seed);
  {
    const prof = [];
    for (let k = 0; k <= NC * 3; k++) { const y = (k * CH) / 3; prof.push([plinthR(y), y]); }
    prof.push([PR1 - 0.006, PH + 0.008], [PR1 - 0.02, PH + 0.011], [0.3, PH + 0.011], [0, PH + 0.011]);
    const g = lathe(prof, SEG);
    g.computeVertexNormals();
    displace(g, (p) => {
      if (p.y > PH + 0.002) return (fbm(p.x * 20, 0, p.z * 20, seed, 2) - 0.5) * 0.004;
      const th = Math.atan2(p.x, p.z) + Math.PI;
      const c = clamp(Math.floor(p.y / CH + 1e-4), 0, NC - 1);
      const u = (th / TAU) * NST + (c % 2) * 0.5, sid = Math.floor(u), fu = u - sid;
      const fv = p.y / CH - Math.floor(p.y / CH + 1e-4);
      const du = Math.min(fu, 1 - fu) * ((TAU * plinthR(p.y)) / NST), dv = Math.min(fv, 1 - fv) * CH;
      const b = sstep(0, 0.02, Math.min(du, dv));
      return b * (0.009 + 0.012 * stoneH(c, sid)) + (fbm(p.x * 26, p.y * 26, p.z * 26, seed + 1, 3) - 0.5) * 0.006;
    });
    paint(g, (p, n, c) => {
      const q = fbm(p.x * 16 + sd, p.y * 16, p.z * 16, seed + 2, 3);
      const th = Math.atan2(p.x, p.z) + Math.PI;
      const cc = clamp(Math.floor(p.y / CH + 1e-4), 0, NC - 1);
      const u = (th / TAU) * NST + (cc % 2) * 0.5, sid = Math.floor(u + 1e-6);
      const tone = stoneH(cc, sid);
      c.copy(PAL.stone).lerp(PAL.stoneDk, sstep(0.58, 0.3, q) * 0.6 + (tone - 0.5) * 0.3);
      if (tone > 0.8) c.lerp(P2.stoneLt, 0.25);
      const fv = p.y / CH - Math.floor(p.y / CH + 1e-4), fu = u - Math.floor(u);
      const edge = Math.min(Math.min(fu, 1 - fu) * 3.2, Math.min(fv, 1 - fv) * 1.8);
      const crev = 1 - sstep(0.0, 0.5, edge);
      const mq = fbm(p.x * 9 + sd, p.y * 9, p.z * 9, seed + 3, 3);
      c.lerp(PAL.moss, sstep(0.5, 0.72, mq) * (0.3 + 0.7 * crev) * (1 - sstep(0, PH, p.y) * 0.6) * 0.8);
      c.multiplyScalar(lerp(0.5, 1, 1 - crev * 0.9) * groundAO(p.y, 0.08, 0.3));
      if (p.y > PH + 0.003) c.multiplyScalar(0.9 + 0.15 * q);
    });
    parts.push(g);
  }
  // 底座脚下的几块大石
  for (let i = 0; i < 5; i++) {
    const ang = Math.PI * 0.32 + (i / 4) * Math.PI * 1.36 + (rnd() - 0.5) * 0.25;
    const g = stoneGeom(0.032 + rnd() * 0.014, 0.026 + rnd() * 0.016, 0.03 + rnd() * 0.014, seed * 40 + i, { w: 9, h: 6, moss: 0.5 + rnd() * 0.3, amp: 0.2 });
    const rad = 0.355 + (rnd() - 0.5) * 0.01;
    place(g, Math.sin(ang + Math.PI) * rad, -g.userData.base - 0.004, Math.cos(ang + Math.PI) * rad, 0, ang, 0);
    shade(g, (p) => groundAO(p.y, 0.04, 0.22));
    parts.push(g);
  }

  /* ---- 八角木板塔身：逐层搭接板 ---- */
  const NB = 16, ys = [];
  for (let i = 0; i <= NB; i++) ys.push(lerp(T0 + 0.004, T1, i / NB));
  {
    const COLS = 4;
    for (const { g, k, i } of tieredShell({ sides: 8, start: 0, A: TA, ys, cols: COLS, lip: 0.0065 })) {
      const tone = hash3(k, i, 3, seed);
      paint(g, (p, n, c, vi) => {
        const j = (vi / COLS) | 0;
        const q = fbm(p.x * 7 + sd, p.y * 55, p.z * 7, seed + 4, 3);
        c.copy(P2.plank).lerp(PAL.wood, 0.1 + 0.16 * tone);
        c.lerp(PAL.woodDk, sstep(0.5, 0.2, q) * 0.28);
        c.lerp(PAL.cut, sstep(0.62, 0.85, q) * 0.15);
        const dirt = 1 - sstep(T0, T0 + 0.3, p.y);
        c.lerp(P2.tar, dirt * 0.5 * (0.5 + 0.5 * vnoise(p.x * 30, p.y * 10, p.z * 30, seed)));
        // 雨水冲刷的竖条污渍
        c.multiplyScalar(1 - 0.18 * sstep(0.6, 0.9, vnoise(p.x * 26 + k * 7, p.y * 1.5, p.z * 26, seed + 8)));
        // 苔藓贴在底部
        c.lerp(PAL.moss, sstep(0.55, 0.8, fbm(p.x * 14, p.y * 14, p.z * 14, seed + 6, 3)) * (1 - sstep(T0, T0 + 0.12, p.y)) * 0.5);
        c.multiplyScalar(j === 2 ? 0.7 : j === 0 ? 0.88 : 1);
        c.multiplyScalar(lerp(0.74, 1, sstep(T0, T0 + 0.4, p.y)));
      });
      parts.push(g);
    }
    // 深色内芯（板缝下透出的暗部）
    const core = flatLathe([[0, T0], [A0 / C8 - 0.012, T0], [A1 / C8 - 0.012, T1], [0, T1]], 8, Math.PI / 8);
    paint(core, (p, n, c) => { c.copy(P2.tar).multiplyScalar(0.7); });
    parts.push(core);
    // 八根转角立柱（随塔身收分倾斜）+ 上下圈梁
    const slope = (A0 - A1) / (T1 - T0) / C8, tc = -Math.atan(slope);
    const hLen = (T1 - T0 + 0.03) / Math.cos(-tc);
    for (let k = 0; k < 8; k++) {
      const ps = (k + 0.5) * Math.PI / 4, ym = (T0 + T1) / 2;
      const post = solidBox(0.03, hLen, 0.03, PAL.woodDk, seed + k, 0.25);
      const rr = TA(ym) / C8 + 0.002;
      place(post, Math.sin(ps) * rr, ym, Math.cos(ps) * rr, tc, ps, 0);
      shade(post, (p, n) => skyAO(n, 0.15));
      parts.push(post);
    }
    const sill = flatLathe([[0, T0 - 0.004], [A0 / C8 + 0.014, T0 - 0.004], [A0 / C8 + 0.014, T0 + 0.016], [A0 / C8 + 0.004, T0 + 0.02], [0, T0 + 0.02]], 8, Math.PI / 8);
    paint(sill, (p, n, c) => { c.copy(PAL.woodDk).lerp(P2.tar, 0.3).multiplyScalar(0.8 + 0.3 * vnoise(p.x * 40, p.y * 40, p.z * 40, seed)); });
    shade(sill, (p, n) => skyAO(n, 0.2));
    parts.push(sill);
    const R1 = A1 / C8;
    const top = flatLathe([[0, T1 - 0.026], [R1 + 0.012, T1 - 0.026], [R1 + 0.016, T1 - 0.004], [R1 + 0.016, T1 + 0.01], [R1 - 0.01, T1 + 0.012], [0, T1 + 0.012]], 8, Math.PI / 8);
    paint(top, (p, n, c) => { c.copy(PAL.woodDk).multiplyScalar(0.85 + 0.3 * vnoise(p.x * 40, p.y * 40, p.z * 40, seed + 2)); });
    shade(top, (p, n) => skyAO(n, 0.25) * 0.9);
    parts.push(top);
  }

  /* ---- 底座门：石门框 + 木板门 + 门槛 ---- */
  {
    const tl = -Math.atan((PR0 - PR1) / PH), zf = plinthR(0.1);
    const fr = archGeom(0.16, 0.218, 0.024, 0.004);
    paint(fr, (p, n, c) => { c.copy(PAL.stone).lerp(P2.stoneLt, 0.35).multiplyScalar(0.82 + 0.2 * vnoise(p.x * 60, p.y * 60, 0, seed)); });
    place(fr, 0, 0.012, zf - 0.012, tl);
    shade(fr, (p, n) => skyAO(n, 0.12));
    parts.push(fr);
    const dr = archGeom(0.12, 0.196, 0.016, 0.004);
    paint(dr, (p, n, c) => {
      const pw = 0.015, pl = Math.floor((p.x + 0.06) / pw), gr = Math.abs((p.x + 0.06) / pw - pl - 0.5);
      c.copy(PAL.wood).lerp(PAL.woodDk, 0.22 + 0.4 * hash3(pl, 4, 1, seed) + sstep(0.38, 0.5, gr) * 0.35);
      const strap = (y0) => sstep(0.007, 0.0, Math.abs(p.y - y0));
      c.lerp(PAL.metal, Math.max(strap(0.05), strap(0.12)) * 0.9);
    });
    place(dr, 0, 0.02, zf - 0.004, tl);
    shade(dr, (p, n) => skyAO(n, 0.1) * lerp(0.72, 1, sstep(0.0, 0.07, p.y)));
    parts.push(dr);
    const knob = smooth(new THREE.SphereGeometry(0.008, 8, 6));
    paint(knob, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.stone, 0.3); });
    place(knob, 0.03, 0.11, zf + 0.014);
    parts.push(knob);
    const th = softBox(0.15, 0.012, 0.03, 0.004, 1, [2, 0, 0]);
    displace(th, (p) => (vnoise(p.x * 40, p.y * 40, p.z * 40, seed + 3) - 0.5) * 0.003);
    paint(th, (p, n, c) => { c.copy(PAL.stone).lerp(P2.stoneLt, 0.3); });
    place(th, 0, 0.006, 0.392);
    shade(th, (p, n) => skyAO(n, 0.15) * groundAO(p.y, 0.03, 0.2));
    parts.push(th);
  }

  /* ---- 小窗：框 + 暗色玻璃 + 十字窗棂 + 木百叶 + 窗台 ---- */
  const mountOnFace = (g, k, y, dz) => { const ph = (k * Math.PI) / 4, r = TA(y) + dz; place(g, Math.sin(ph) * r, y, Math.cos(ph) * r, tilt, ph, 0); return g; };
  const addWindow = (k, y, w, h) => {
    const bits = [];
    const mk = (bw, bh, bd, x, yy, z, col, nzz) => { const b = solidBox(bw, bh, bd, col, seed + k, nzz ?? 0.15); b.translate(x, yy, z); bits.push(b); return b; };
    mk(0.011, h, 0.016, -(w / 2 - 0.0055), h / 2, 0.006, P2.cloth);
    mk(0.011, h, 0.016, (w / 2 - 0.0055), h / 2, 0.006, P2.cloth);
    mk(w, 0.011, 0.016, 0, h - 0.0055, 0.006, P2.cloth);
    mk(w, 0.011, 0.016, 0, 0.0055, 0.006, P2.cloth);
    const gl = mk(w - 0.02, h - 0.02, 0.006, 0, h / 2, 0.001, hex(0x1d2a33), 0.2);
    paint(gl, (p, n, c) => { c.lerp(PAL.lamp, 0.18 * sstep(0, h, p.y) * 0.8); });
    mk(0.006, h, 0.01, 0, h / 2, 0.008, P2.cloth);
    mk(w, 0.006, 0.01, 0, h * 0.55, 0.008, P2.cloth);
    for (const sx of [-1, 1]) {
      const s = mk(w * 0.46, h, 0.009, sx * (w / 2 + w * 0.23 + 0.003), h / 2, 0.008, hex(0x4f6a47), 0.3);
      paint(s, (p, n, c) => { c.multiplyScalar(0.8 + 0.2 * Math.sin(p.y * 160) * 0.5 + 0.1); });
    }
    mk(w + 0.022, 0.01, 0.026, 0, -0.005, 0.012, PAL.stone, seed);
    const m = mergeGeometries(bits.map(finish), false);
    shade(m, (p, n) => skyAO(n, 0.12) * lerp(0.75, 1, sstep(-0.01, 0.04, p.y)));
    mountOnFace(m, k, y, 0.002);
    parts.push(m);
  };
  addWindow(0, 0.62, 0.066, 0.092);
  addWindow(2, 0.56, 0.06, 0.084);
  addWindow(6, 0.56, 0.06, 0.084);
  addWindow(4, 0.6, 0.06, 0.084);

  /* ---- 红褐木瓦圆帽 ---- */
  const CY0 = T1 + 0.012, CR = 0.3, CHT = 0.27, NT = 6, CSEG = 28;
  const capR = (u) => CR * Math.sqrt(Math.max(0, 1 - Math.pow(u, 2.3)));
  {
    const prof = [[0, CY0 - 0.03], [A1 / C8 - 0.01, CY0 - 0.03], [CR - 0.012, CY0 - 0.024], [CR + 0.004, CY0 - 0.012], [CR + 0.006, CY0 + 0.002]];
    const rowTier = [-1, -1, -1, -1, -1], rowKind = [0, 0, 0, 0, 0];
    for (let t = 0; t < NT; t++) {
      const u0 = (t / NT) * 0.97, u1 = ((t + 1) / NT) * 0.97, lip = 0.0085 * (1 - t / NT * 0.5);
      const add = (u, dr, kind) => { prof.push([Math.max(0.001, capR(u) + dr), CY0 + CHT * u]); rowTier.push(t); rowKind.push(kind); };
      add(u0, lip * 0.55, 0); add(u0 + (u1 - u0) * 0.1, lip, 1); add(u1 - 0.004, 0, 2);
    }
    prof.push([0.004, CY0 + CHT * 0.985]); rowTier.push(NT - 1); rowKind.push(2);
    const g = lathe(prof, CSEG);
    g.computeVertexNormals();
    displace(g, (p) => (vnoise(p.x * 40 + sd, p.y * 40, p.z * 40, seed + 5) - 0.5) * 0.003);
    paint(g, (p, n, c, vi) => {
      const j = (vi / CSEG) | 0, col = vi % CSEG, t = rowTier[j], kind = rowKind[j];
      if (t < 0) { c.copy(PAL.woodDk).multiplyScalar(0.55); return; }
      const sh = Math.floor((col + (t % 2)) / 2), tone = hash3(sh, t, 9, seed);
      c.copy(P2.shingle).lerp(P2.shingleDk, 0.15 + 0.5 * tone).lerp(P2.shingleLt, sstep(0.7, 1, tone) * 0.5);
      const q = fbm(p.x * 20 + sd, p.y * 20, p.z * 20, seed + 3, 3);
      c.multiplyScalar(0.88 + 0.24 * q);
      c.lerp(PAL.moss, sstep(0.6, 0.8, fbm(p.x * 12, p.y * 12, p.z * 12, seed + 9, 3)) * 0.22);
      if ((col + t) % 2 === 0) c.multiplyScalar(0.8);
      c.multiplyScalar(kind === 2 ? 0.66 : kind === 0 ? 0.88 : 1);
      c.multiplyScalar(lerp(0.78, 1, sstep(CY0, CY0 + 0.1, p.y)));
    });
    parts.push(g);
    // 顶上的小球 + 风向标杆
    const fn = smooth(lathe([[0, CY0 + CHT - 0.012], [0.016, CY0 + CHT - 0.006], [0.02, CY0 + CHT + 0.012], [0.013, CY0 + CHT + 0.028], [0.005, CY0 + CHT + 0.034], [0.0035, CY0 + CHT + 0.07], [0.002, CY0 + CHT + 0.085], [0, CY0 + CHT + 0.09]], 8));
    paint(fn, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.stone, 0.2); });
    shade(fn, (p, n) => skyAO(n, 0.2));
    parts.push(fn);
    // 帽檐下的转盘滚轮座（暗色圈）
    const ring = smooth(lathe([[CR - 0.03, CY0 - 0.03], [CR - 0.02, CY0 - 0.03], [CR - 0.018, CY0 - 0.045], [CR - 0.03, CY0 - 0.045]], 28));
    paint(ring, (p, n, c) => { c.copy(P2.tar); });
    parts.push(ring);
  }

  /* ---- 帽前轴座（木箱 + 铁箍）与静止的轴头 ---- */
  {
    const hs = softBox(0.115, 0.1, 0.1, 0.02, 2, [1, 1, 1]);
    displace(hs, (p) => (vnoise(p.x * 50, p.y * 50, p.z * 50, seed + 9) - 0.5) * 0.004);
    paint(hs, (p, n, c) => { c.copy(PAL.woodDk).lerp(PAL.wood, 0.25 + 0.3 * vnoise(p.x * 40, p.y * 40, p.z * 40, seed)); });
    place(hs, 0, HUBY, 0.255);
    shade(hs, (p, n) => skyAO(n, 0.25) * lerp(0.7, 1, sstep(HUBY - 0.05, HUBY + 0.05, p.y)));
    parts.push(hs);
    const band = smooth(lathe([[0.04, 0.0], [0.047, 0.0], [0.047, 0.012], [0.04, 0.012]], 14));
    band.rotateX(Math.PI / 2);
    paint(band, (p, n, c) => { c.copy(PAL.metal); });
    place(band, 0, HUBY, 0.28);
    parts.push(band);
    const stub = smooth(lathe([[0, 0], [0.02, 0], [0.02, 0.07], [0, 0.07]], 12));
    stub.rotateX(Math.PI / 2);
    paint(stub, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.woodDk, 0.3); });
    place(stub, 0, HUBY, 0.28);
    parts.push(stub);
  }
  for (const g of parts) if (!g.attributes.color) throw new Error('windmill part without color');

  /* ---- 风叶（独立部件，世界坐标；绕 z 轴转，转轴中心 pivot） ---- */
  const sp = [];
  const phi = (x) => lerp(0.44, 0.08, clamp((x - 0.14) / 0.42));
  const PT = (x, y) => V3(x, y * Math.cos(phi(x)), y * Math.sin(phi(x)));
  const NRM = (x) => V3(0, -Math.sin(phi(x)), Math.cos(phi(x)));
  const rot = (g, a) => g.rotateZ(a);
  const arms = [];
  const baseAng = 0.38;
  for (let a = 0; a < 4; a++) {
    const A = baseAng + (a * Math.PI) / 2, aparts = [];
    const stock = solidBox(1, 1, 1, PAL.woodDk, seed + a, 0.3);
    const wood = (g, col, k) => { paint(g, (p, n, c) => { c.copy(col).multiplyScalar(0.85 + 0.3 * vnoise(p.x * 60 + k, p.y * 60, p.z * 60, seed + a)); }); return g; };
    aparts.push(wood(beam(V3(0.03, 0, 0), V3(0.56, 0, 0), 0.02, 0.018), PAL.woodDk, 1));
    const X0 = 0.14, X1 = 0.545, YW0 = 0.016, YW1 = 0.158;
    // 外框：沿杆一侧的前梁、外缘梁（分三段贴合扭转面）+ 两端横梁
    const rails = [YW0 + 0.004, YW1];
    for (const ry of rails) {
      const xs = [X0, lerp(X0, X1, 0.34), lerp(X0, X1, 0.67), X1];
      for (let s = 0; s < 3; s++) aparts.push(wood(beam(PT(xs[s], ry), PT(xs[s + 1], ry), 0.011, 0.01, NRM((xs[s] + xs[s + 1]) / 2)), PAL.wood, 2));
    }
    for (const x of [X0, X1]) aparts.push(wood(beam(PT(x, YW0), PT(x, YW1), 0.012, 0.011, NRM(x)), PAL.wood, 3));
    // 格栅：横向细条 + 两条纵向细条
    const NBt = 12;
    for (let b = 1; b < NBt; b++) {
      const x = lerp(X0, X1, b / NBt);
      aparts.push(wood(beam(PT(x, YW0 + 0.008), PT(x, YW1 - 0.006), 0.006, 0.006, NRM(x)), P2.sail, 4 + b));
    }
    for (const ry of [YW0 + (YW1 - YW0) * 0.36, YW0 + (YW1 - YW0) * 0.68]) {
      const xm = lerp(X0, X1, 0.5);
      aparts.push(wood(beam(PT(X0, ry), PT(xm, ry), 0.0055, 0.0055, NRM(X0 + 0.1)), P2.sail, 30));
      aparts.push(wood(beam(PT(xm, ry), PT(X1, ry), 0.0055, 0.0055, NRM(X1 - 0.1)), P2.sail, 31));
    }
    // 外端挂的帆布条（半透明感用浅色窄条表示）
    for (const g of aparts) {
      shade(g, (p, n) => skyAO(n, 0.1) * (0.85 + 0.15 * sstep(0.05, 0.5, Math.hypot(p.x, p.y))));
      g.rotateZ(A); sp.push(g);
    }
  }
  // 轴 + 风叶中心盘
  {
    const prof = [[0, -0.24], [0.018, -0.24], [0.018, -0.03], [0.05, -0.028], [0.058, -0.012], [0.058, 0.012], [0.044, 0.026], [0.03, 0.048], [0.012, 0.066], [0, 0.072]];
    const sh = smooth(lathe(prof, 14));
    sh.rotateX(Math.PI / 2);
    paint(sh, (p, n, c) => {
      c.copy(PAL.metal).lerp(PAL.woodDk, 0.35 + 0.3 * sstep(-0.02, -0.2, p.z));
      c.multiplyScalar(0.9 + 0.25 * vnoise(p.x * 50, p.y * 50, p.z * 50, seed + 4));
    });
    shade(sh, (p, n) => skyAO(n, 0.15));
    sp.push(sh);
    // 十字交叉的木盘
    for (let a = 0; a < 2; a++) {
      const g = solidBox(0.15, 0.045, 0.03, PAL.woodDk, seed + 40 + a, 0.3);
      g.rotateZ(baseAng + (a * Math.PI) / 2);
      shade(g, (p, n) => skyAO(n, 0.15));
      sp.push(g);
    }
  }
  const sails = mergeGeometries(sp.map(finish), false);
  sails.translate(0, HUBY, HUBZ);
  sails.computeBoundingBox(); sails.computeBoundingSphere();
  // 太阳下的整体天光
  for (const g of parts) shade(g, (p, n) => skyAO(n, 0.08));
  return {
    geometry: assemble(parts, 0),
    anchors: { door: [0, 0, 0.46], hub: [0, HUBY, HUBZ] },
    parts: { sails: { geometry: sails, pivot: [0, HUBY, HUBZ] } },
  };
}

/* ============================================================
 * 8. 石砌钟楼（方塔 + 拱窗钟室 + 四坡尖顶 + 铜钟）
 *    返回 { geometry, anchors: { door }, parts: { bell: { geometry(世界坐标), pivot } } }
 * ============================================================ */
export function bellTower(seed = 1) {
  const rnd = mulberry32(seed * 911 + 5);
  const sd = seed * 1.9;
  const parts = [];
  const ASH = hex(0x8b867c);
  const PLH = 0.08, SH0 = PLH, SH1 = 0.86;            // 底座 / 塔身
  const AP = 0.3, AS0 = 0.262, AS1 = 0.245;           // 内切半径（底座 / 塔身下 / 塔身上）
  const SA = (y) => lerp(AS0, AS1, clamp((y - SH0) / (SH1 - SH0)));
  const CA = 0.235, C0 = 0.89, C1 = 1.22;             // 钟室
  const SILL = 0.94, SPR = 1.045, AR = 0.1, LINT = 1.18;
  const SP0 = 1.252, SP1 = 1.5, SPA = 0.285;          // 尖顶
  const tiltS = -Math.atan((AS0 - AS1) / (SH1 - SH0));
  const aoShaft = (p, n, y) => groundAO(y, 0.16, 0.34) * lerp(1, 0.72, sstep(0.76, 0.86, y)) * skyAO(n, 0.1);

  /* ---- 石块墙面 ---- */
  for (let k = 0; k < 4; k++) {
    const ph = (k * Math.PI) / 2;
    const common = { ph, rnd, seed: seed * 10 + k, base: ASH, dark: PAL.stoneDk, par: k, endLong: 0.22, endShort: 0.115, moss: 0.7 };
    // 底座
    for (const g of stoneWall({ ...common, A: () => AP, Aref: AP, x0: -AP, x1: AP, y0: 0, y1: PLH, ch: 0.04, wMin: 0.17, wMax: 0.26, cornerL: true, cornerR: true, endLong: 0.26, endShort: 0.13, ao: (p, n, y) => groundAO(y, 0.05, 0.3) * skyAO(n, 0.1) })) parts.push(g);
    // 塔身
    for (const g of stoneWall({ ...common, A: SA, Aref: AS0, x0: -AS0, x1: AS0, y0: SH0, y1: SH1, ch: 0.1, wMin: 0.16, wMax: 0.24, cornerL: true, cornerR: true, ao: aoShaft })) parts.push(g);
    // 钟室：窗台层、两侧窗间墩、过梁层
    const cm = { ...common, A: () => CA, Aref: CA, moss: 0.15, endLong: 0.2, endShort: 0.1, wMin: 0.09, wMax: 0.14, ao: (p, n, y) => skyAO(n, 0.1) * lerp(0.8, 1, sstep(C0, C0 + 0.1, y)) };
    for (const g of stoneWall({ ...cm, x0: -CA, x1: CA, y0: C0, y1: SILL, ch: 0.05, cornerL: true, cornerR: true, wMin: 0.1, wMax: 0.17 })) parts.push(g);
    for (const g of stoneWall({ ...cm, x0: -CA, x1: -AR, y0: SILL, y1: LINT, ch: 0.059, cornerL: true, cornerR: false, par: k })) parts.push(g);
    for (const g of stoneWall({ ...cm, x0: AR, x1: CA, y0: SILL, y1: LINT, ch: 0.059, cornerL: false, cornerR: true, par: k })) parts.push(g);
    for (const g of stoneWall({ ...cm, x0: -CA, x1: CA, y0: LINT, y1: C1, ch: 0.04, cornerL: true, cornerR: true, wMin: 0.1, wMax: 0.17 })) parts.push(g);
  }

  /* ---- 钟室内墙板（带拱洞的背板，让洞里是暗的） ---- */
  for (let k = 0; k < 4; k++) {
    const ph = (k * Math.PI) / 2, hw = k % 2 === 0 ? CA : CA - 0.06;
    const sh = new THREE.Shape();
    sh.moveTo(-hw, C0); sh.lineTo(hw, C0); sh.lineTo(hw, C1); sh.lineTo(-hw, C1); sh.lineTo(-hw, C0);
    const hole = new THREE.Path();
    hole.moveTo(-AR, SILL); hole.lineTo(AR, SILL); hole.lineTo(AR, SPR); hole.absarc(0, SPR, AR, 0, Math.PI, false); hole.lineTo(-AR, SILL);
    sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false, curveSegments: 12 });
    g.translate(0, 0, CA - 0.0075 - 0.06);
    paint(g, (p, n, c) => {
      const out = n.z > 0.6 && p.z > CA - 0.012;
      c.copy(ASH).lerp(PAL.stoneDk, 0.35 + 0.3 * vnoise(p.x * 30, p.y * 30, p.z * 30, seed));
      if (!out) c.multiplyScalar(0.3);
      else c.multiplyScalar(0.8);
    });
    g.rotateY(ph);
    parts.push(g);
  }
  // 钟室地板
  {
    const fl = solidBox(0.46, 0.04, 0.46, PAL.stoneDk, seed, 0.2);
    fl.translate(0, SILL - 0.02, 0);
    shade(fl, (p, n) => 0.38);
    parts.push(fl);
  }

  /* ---- 拱圈楔石（9 块 + 拱心石）、窗台石 ---- */
  for (let k = 0; k < 4; k++) {
    const ph = (k * Math.PI) / 2, NV = 7, z0 = CA - 0.022, z1 = CA + 0.016;
    for (let i = 0; i < NV; i++) {
      const a0 = Math.PI - (i / NV) * Math.PI + 0.012, a1 = Math.PI - ((i + 1) / NV) * Math.PI - 0.012;
      const key = i === 3, r0 = AR - 0.003, r1 = AR + (key ? 0.05 : 0.034) + (rnd() - 0.5) * 0.006;
      const pt = (a, r, z) => [Math.cos(a) * r, SPR + Math.sin(a) * r, z];
      const g = hexa([pt(a0, r0, z0), pt(a0, r1, z0), pt(a1, r1, z0), pt(a1, r0, z0), pt(a0, r0, z1), pt(a0, r1, z1), pt(a1, r1, z1), pt(a1, r0, z1)]);
      const tone = rnd();
      paint(g, (p, n, c) => { c.copy(ASH).lerp(P2.stoneLt, 0.35 + 0.3 * tone).multiplyScalar(0.88 + 0.2 * vnoise(p.x * 80, p.y * 80, p.z * 80, seed + i)); if (key) c.lerp(PAL.cut, 0.15); });
      shade(g, (p, n) => skyAO(n, 0.12) * (n.z > 0.6 ? 1 : 0.8));
      g.rotateY(ph);
      parts.push(g);
    }
  }

  /* ---- 挑檐石条：底座顶、腰线、塔身顶檐、钟室顶檐 ---- */
  const ledge = (y, h, half, col = P2.stoneLt) => {
    const g = solidBox(half * 2, h, half * 2, col, seed + Math.round(y * 100), 0.18);
    g.translate(0, y + h / 2, 0);
    shade(g, (p, n) => skyAO(n, 0.15) * (n.y < -0.5 ? 0.6 : 1));
    parts.push(g);
  };
  ledge(PLH - 0.004, 0.014, 0.302, ASH);
  ledge(0.735, 0.016, 0.268, ASH);
  ledge(SH1, 0.022, 0.284, ASH);
  ledge(SH1 + 0.022, 0.008, 0.268, ASH);
  ledge(C1, 0.018, 0.288, ASH);
  ledge(C1 + 0.018, 0.014, 0.3, ASH);

  /* ---- 正门：石门框 + 木板门 + 铁箍 + 门槛 ---- */
  {
    const zf = SA(0.2) , tl = tiltS;
    const fr = archGeom(0.19, 0.285, 0.016, 0.004);
    paint(fr, (p, n, c) => { c.copy(ASH).lerp(P2.stoneLt, 0.35).multiplyScalar(0.85 + 0.2 * vnoise(p.x * 60, p.y * 60, 0, seed)); });
    place(fr, 0, PLH + 0.004, zf - 0.014, tl);
    shade(fr, (p, n) => skyAO(n, 0.12));
    parts.push(fr);
    const dr = archGeom(0.142, 0.256, 0.014, 0.004);
    paint(dr, (p, n, c) => {
      const pw = 0.0177, pl = Math.floor((p.x + 0.071) / pw), gr = Math.abs((p.x + 0.071) / pw - pl - 0.5);
      c.copy(PAL.wood).lerp(PAL.woodDk, 0.3 + 0.4 * hash3(pl, 4, 2, seed) + sstep(0.38, 0.5, gr) * 0.35);
      const strap = (y0) => sstep(0.008, 0.0, Math.abs(p.y - y0));
      c.lerp(PAL.metal, Math.max(strap(0.06), strap(0.15), strap(0.22)) * 0.9);
    });
    place(dr, 0, PLH + 0.01, zf - 0.002, tl);
    shade(dr, (p, n) => skyAO(n, 0.1) * lerp(0.72, 1, sstep(0.0, 0.08, p.y)));
    parts.push(dr);
    const ring = smooth(new THREE.TorusGeometry(0.01, 0.003, 4, 8));
    paint(ring, (p, n, c) => { c.copy(PAL.metal); });
    place(ring, 0.032, PLH + 0.13, zf + 0.016);
    parts.push(ring);
    const th = softBox(0.2, 0.014, 0.03, 0.004, 1, [1, 0, 0]);
    paint(th, (p, n, c) => { c.copy(ASH).lerp(P2.stoneLt, 0.3 + 0.2 * vnoise(p.x * 30, 0, p.z * 30, seed)); });
    place(th, 0, 0.007, AP + 0.0);
    shade(th, (p, n) => skyAO(n, 0.15) * groundAO(p.y, 0.03, 0.2));
    parts.push(th);
  }
  /* ---- 箭窗（四面） ---- */
  for (let k = 0; k < 4; k++) {
    const y = k === 0 ? 0.56 : 0.5 + 0.04 * (k % 2), ph = (k * Math.PI) / 2, r = SA(y);
    const fr = archGeom(0.058, 0.14, 0.014, 0.003);
    paint(fr, (p, n, c) => { c.copy(ASH).lerp(P2.stoneLt, 0.35).multiplyScalar(0.85 + 0.2 * vnoise(p.x * 60, p.y * 60, 0, seed)); });
    const sl = archGeom(0.026, 0.1, 0.006, 0.002);
    paint(sl, (p, n, c) => { c.copy(PAL.doorDark); c.multiplyScalar(0.7 + 0.3 * sstep(0, 0.1, p.y)); });
    place(fr, 0, y, 0, 0, 0, 0); place(sl, 0, y + 0.02, 0.012, 0, 0, 0);
    for (const g of [fr, sl]) { shade(g, (p, n) => skyAO(n, 0.1)); place(g, Math.sin(ph) * (r - 0.002), 0, Math.cos(ph) * (r - 0.002), tiltS, ph, 0); parts.push(g); }
  }

  /* ---- 四坡尖顶：石板瓦逐层搭接 ---- */
  {
    const NTR = 8, ys = [], COLS = 4;
    for (let i = 0; i <= NTR; i++) ys.push(lerp(SP0, SP1, i / NTR));
    const SPA_f = (y) => SPA * Math.pow(1 - clamp((y - SP0) / (SP1 - SP0)), 1.15) + 0.012;
    for (const { g, k, i } of tieredShell({ sides: 4, start: 0, A: SPA_f, ys, cols: COLS, lip: 0.007 })) {
      paint(g, (p, n, c, vi) => {
        const j = (vi / COLS) | 0, col = vi % COLS;
        const tone = hash3(col + (i % 2), i, k + 3, seed);
        c.copy(P2.slate).lerp(P2.slateLt, 0.15 + 0.5 * tone);
        const q = fbm(p.x * 14 + sd, p.y * 14, p.z * 14, seed + 3, 3);
        c.multiplyScalar(0.82 + 0.3 * q);
        c.lerp(PAL.moss, sstep(0.62, 0.8, fbm(p.x * 10, p.y * 10, p.z * 10, seed + 5, 3)) * 0.2 * (1 - sstep(SP0, SP0 + 0.1, p.y)));
        if (col % 2 === 0 && i % 2 === 0 || col % 2 === 1 && i % 2 === 1) c.multiplyScalar(0.86);
        c.multiplyScalar(j === 2 ? 0.66 : j === 0 ? 0.88 : 1);
        c.multiplyScalar(lerp(0.78, 1, sstep(SP0, SP0 + 0.12, p.y)));
      });
      parts.push(g);
    }
    // 瓦下暗芯 + 四条戗脊
    const cp = [[0, SP0]];
    for (let q = 0; q <= 4; q++) { const y = lerp(SP0, SP1, q / 4); cp.push([Math.max(0.002, (SPA_f(y) - 0.016) * Math.SQRT2), y]); }
    const core = flatLathe(cp, 4, Math.PI / 4);
    paint(core, (p, n, c) => { c.copy(P2.tar); });
    parts.push(core);
    for (let k = 0; k < 4; k++) {
      const ps = (k + 0.5) * Math.PI / 2, a = V3(Math.sin(ps) * (SPA * Math.SQRT2 + 0.004), SP0 + 0.004, Math.cos(ps) * (SPA * Math.SQRT2 + 0.004)), b = V3(Math.sin(ps) * 0.02, SP1 - 0.004, Math.cos(ps) * 0.02);
      const rg = beam(a, b, 0.014, 0.012, V3(Math.sin(ps), 0.4, Math.cos(ps)));
      paint(rg, (p, n, c) => { c.copy(P2.slate).multiplyScalar(0.7).lerp(P2.patina, 0.1); });
      shade(rg, (p, n) => skyAO(n, 0.15));
      parts.push(rg);
    }
    // 铜顶饰：球 + 十字
    const fn = smooth(lathe([[0, SP1 - 0.01], [0.02, SP1 - 0.004], [0.022, SP1 + 0.01], [0.016, SP1 + 0.026], [0.006, SP1 + 0.034], [0.004, SP1 + 0.05], [0, SP1 + 0.056]], 10));
    paint(fn, (p, n, c) => { c.copy(P2.bronze).lerp(P2.patina, 0.55); });
    shade(fn, (p, n) => skyAO(n, 0.2));
    parts.push(fn);
    for (const [w, h, y] of [[0.006, 0.05, SP1 + 0.07], [0.034, 0.006, SP1 + 0.076]]) {
      const cr = solidBox(w, h, 0.006, P2.bronze, seed, 0.2);
      cr.translate(0, y, 0);
      paint(cr, (p, n, c) => { c.lerp(P2.patina, 0.4); });
      parts.push(cr);
    }
  }

  /* ---- 钟梁（静止部件）+ 立柱 ---- */
  const PV = [0, 1.125, 0];
  {
    const hb = solidBox(0.36, 0.034, 0.04, PAL.woodDk, seed, 0.3);
    hb.translate(0, PV[1] + 0.017, 0);
    paint(hb, (p, n, c) => { c.lerp(PAL.wood, 0.3 * vnoise(p.x * 30, p.y * 30, p.z * 30, seed)); });
    shade(hb, (p, n) => 0.7 * skyAO(n, 0.2));
    parts.push(hb);
  }
  for (const g of parts) if (!g.attributes.color) throw new Error('bellTower part without color');

  /* ---- 铜钟（独立部件，世界坐标，绕 x 轴摆，pivot 在钟顶挂点） ---- */
  const bp = [];
  {
    const prof = [[0, -0.016], [0.02, -0.016], [0.034, -0.028], [0.043, -0.045], [0.046, -0.066], [0.044, -0.088], [0.049, -0.108], [0.059, -0.127], [0.07, -0.145], [0.0775, -0.153], [0.0775, -0.158], [0.069, -0.159],
      [0.0665, -0.15], [0.055, -0.13], [0.046, -0.108], [0.04, -0.09], [0.038, -0.065], [0.03, -0.038], [0, -0.032]];
    const g = lathe(prof, 16);
    g.computeVertexNormals();
    displace(g, (p) => (vnoise(p.x * 60 + sd, p.y * 60, p.z * 60, seed + 12) - 0.5) * 0.0016);
    paint(g, (p, n, c) => {
      const q = fbm(p.x * 40 + sd, p.y * 40, p.z * 40, seed + 4, 3);
      c.copy(P2.bronze).lerp(P2.bronzeDk, sstep(0.5, 0.25, q) * 0.5);
      // 凹处的铜绿 + 一圈打磨亮带
      const inner = Math.hypot(p.x, p.z) < 0.043 && p.y < -0.05 && n.y < 0 ? 1 : 0;
      c.lerp(P2.patina, sstep(0.55, 0.78, q) * 0.45 + 0.3 * sstep(-0.05, -0.016, p.y));
      c.lerp(PAL.cut, 0.18 * sstep(0.015, 0, Math.abs(p.y + 0.12)) + 0.1 * sstep(0.008, 0, Math.abs(p.y + 0.07)));
      if (p.y < -0.15 || p.y > -0.03 && false) c.multiplyScalar(0.8);
      c.multiplyScalar(inner ? 0.45 : 1);
    });
    shade(g, (p, n) => skyAO(n, 0.1));
    bp.push(g);
    // 吊环 + 铁箍
    const lp = smooth(new THREE.TorusGeometry(0.02, 0.006, 4, 10));
    lp.rotateY(Math.PI / 2);
    paint(lp, (p, n, c) => { c.copy(PAL.metal).lerp(P2.bronzeDk, 0.2); });
    place(lp, 0, 0.002, 0);
    bp.push(lp);
    for (const sx of [-1, 1]) {
      const st = solidBox(0.01, 0.04, 0.04, PAL.metal, seed + 5, 0.2);
      st.translate(sx * 0.028, -0.002, 0);
      bp.push(st);
    }
    // 钟舌
    const cl = smooth(lathe([[0, -0.09], [0.004, -0.09], [0.004, -0.14], [0.012, -0.146], [0.014, -0.158], [0.008, -0.166], [0, -0.168]], 8));
    paint(cl, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.stone, 0.1); });
    bp.push(cl);
    // 绕在钟轴上的粗麻绳
    const rp = smooth(new THREE.CylinderGeometry(0.0045, 0.0045, 0.16, 5, 4));
    paint(rp, (p, n, c) => { c.copy(PAL.rope).multiplyScalar(0.8 + 0.2 * Math.sin(p.y * 220)); });
    place(rp, 0.032, -0.07, 0.02);
    bp.push(rp);
  }
  const bell = mergeGeometries(bp.map(finish), false);
  bell.translate(PV[0], PV[1], PV[2]);
  bell.computeBoundingBox(); bell.computeBoundingSphere();
  return {
    geometry: assemble(parts, 0),
    anchors: { door: [0, 0, 0.4] },
    parts: { bell: { geometry: bell, pivot: PV } },
  };
}

/* ============================================================
 * 9. 村民（风格化写实小人，高约 0.26，正面朝 +z）
 *    opts: { shirt, hat: 'straw' | 'cap' | 'none', hatColor, skin }  颜色可为 THREE.Color 或 0xRRGGBB
 * ============================================================ */
function ellipsoid(rx, ry, rz, ws, hs) {
  const g = smooth(new THREE.SphereGeometry(1, ws, hs));
  g.scale(rx, ry, rz);
  g.computeVertexNormals();
  return g;
}
/** 沿 y 居中的胶囊肢体（r0 在下端，r1 在上端），再摆到 a→b */
function limbGeom(a, b, r0, r1, seg, rows) {
  const L = a.distanceTo(b), pr = [[0, -L / 2], [r0 * 0.7, -L / 2 + r0 * 0.3]];
  for (let k = 0; k <= rows; k++) {
    const t = k / rows, r = lerp(r0, r1, t) * (1 + 0.1 * Math.sin(t * Math.PI));
    pr.push([r, lerp(-L / 2 + r0 * 0.8, L / 2 - r1 * 0.8, t)]);
  }
  pr.push([r1 * 0.7, L / 2 - r1 * 0.3], [0, L / 2]);
  const g = lathe(pr, seg);
  g.computeVertexNormals();
  return between(g, a, b);
}
export function villager(seed = 1, opts = {}) {
  const rnd = mulberry32(seed * 977 + 41);
  const sd = seed * 3.7;
  const toCol = (v, def) => (v instanceof THREE.Color ? v.clone() : new THREE.Color(v ?? def));
  const shirt = toCol(opts.shirt, 0x4f7fb0), skin = toCol(opts.skin, 0xe0ac84);
  const hat = opts.hat ?? 'none';
  const hatCol = toCol(opts.hatColor, hat === 'cap' ? 0xa8402c : 0xd2b06a);
  const hairs = [0x3a2616, 0x5a3a20, 0x2a2018, 0x8a6a3a];
  const hair = new THREE.Color(hairs[Math.floor(rnd() * hairs.length)]);
  const pants = new THREE.Color(0x5b4a37), shoe = new THREE.Color(0x35261c), skinDk = skin.clone().multiplyScalar(0.72);
  const parts = [];
  const HY = 0.224, HR = [0.031, 0.035, 0.0335];  // 头的中心高度 / 半径
  const sway = (rnd() - 0.5) * 0.02;

  /* ---- 腿 + 鞋 ---- */
  for (const sx of [-1, 1]) {
    const leg = limbGeom(V3(sx * 0.022, 0.016, 0.0), V3(sx * 0.02, 0.105, 0.0), 0.0165, 0.021, 7, 2);
    paint(leg, (p, n, c) => {
      c.copy(pants).multiplyScalar(0.9 + 0.2 * vnoise(p.x * 90, p.y * 90, p.z * 90, seed));
      c.lerp(PAL.woodDk, sstep(0.05, 0.0, p.y) * 0.5);
      c.multiplyScalar(lerp(0.7, 1, sstep(0.0, 0.1, p.y)));
    });
    parts.push(leg);
    const sh = ellipsoid(0.0215, 0.016, 0.034, 6, 4);
    paint(sh, (p, n, c) => { c.copy(shoe).multiplyScalar(0.85 + 0.3 * vnoise(p.x * 80, p.y * 80, p.z * 80, seed)); c.lerp(PAL.stone, sstep(0.004, -0.012, p.y) * 0.2); });
    place(sh, sx * 0.023, 0.014, 0.01, 0, sx * 0.08, 0);
    shade(sh, (p) => groundAO(p.y, 0.025, 0.35));
    parts.push(sh);
  }
  for (const g of parts) shade(g, (p, n) => groundAO(p.y, 0.05, 0.25) * skyAO(n, 0.1));

  /* ---- 躯干：上衣 + 腰带 + 领口 ---- */
  {
    const prof = [[0, 0.088], [0.034, 0.09], [0.043, 0.105], [0.0445, 0.125], [0.042, 0.15], [0.047, 0.17], [0.036, 0.186], [0.016, 0.192], [0, 0.192]];
    const g = lathe(prof, 10);
    g.computeVertexNormals();
    g.scale(1, 1, 0.74);
    g.computeVertexNormals();
    paint(g, (p, n, c) => {
      const q = fbm(p.x * 50 + sd, p.y * 40, p.z * 50, seed, 2);
      c.copy(shirt).multiplyScalar(0.88 + 0.24 * q);
      c.lerp(PAL.canvas, sstep(0.62, 0.8, q) * 0.1);
      // 腰带 + 扣
      const belt = sstep(0.114, 0.108, p.y) * sstep(0.092, 0.098, p.y);
      c.lerp(PAL.woodDk, belt * 0.95);
      if (belt > 0.5 && Math.abs(p.x) < 0.007 && p.z > 0) c.copy(PAL.metal).lerp(PAL.cut, 0.35);
      // 领口 V 形露出的皮肤
      const vv = sstep(0.004, -0.004, Math.abs(p.x) - (p.y - 0.172) * 0.9) * (p.z > 0 ? 1 : 0) * sstep(0.172, 0.176, p.y);
      c.lerp(skinDk, clamp(vv, 0, 1) * 0.95);
      c.multiplyScalar(lerp(0.78, 1, sstep(0.088, 0.13, p.y)));
    });
    shade(g, (p, n) => skyAO(n, 0.1));
    parts.push(g);
  }
  /* ---- 手臂：短袖上衣 + 小臂/手 ---- */
  for (const sx of [-1, 1]) {
    const sh = V3(sx * 0.052, 0.172, 0.0), el = V3(sx * 0.063, 0.134, 0.006 + sway), wr = V3(sx * 0.064, 0.1, 0.016 + sway * 1.5);
    const upper = limbGeom(el, sh, 0.0135, 0.0165, 7, 1);
    paint(upper, (p, n, c) => { c.copy(shirt).multiplyScalar(0.9 + 0.2 * vnoise(p.x * 70, p.y * 70, p.z * 70, seed + 3)); c.multiplyScalar(lerp(0.82, 1, sstep(0.13, 0.17, p.y))); });
    const lower = limbGeom(wr, el, 0.0105, 0.0128, 7, 1);
    paint(lower, (p, n, c) => { c.copy(skin).multiplyScalar(0.92 + 0.12 * vnoise(p.x * 60, p.y * 60, p.z * 60, seed + 5)); c.lerp(shirt, sstep(0.131, 0.139, p.y)); });
    const hd = ellipsoid(0.0105, 0.0125, 0.0095, 6, 4);
    paint(hd, (p, n, c) => { c.copy(skin).multiplyScalar(0.95); });
    place(hd, wr.x, wr.y - 0.008, wr.z + 0.003);
    for (const g of [upper, lower, hd]) { shade(g, (p, n) => skyAO(n, 0.1) * lerp(0.85, 1, sstep(0.09, 0.15, p.y))); parts.push(g); }
  }
  /* ---- 脖子 + 头 + 五官 ---- */
  {
    const nk = lathe([[0, 0.182], [0.0145, 0.182], [0.0135, 0.196], [0.014, 0.206], [0, 0.206]], 8);
    nk.computeVertexNormals();
    paint(nk, (p, n, c) => { c.copy(skin).multiplyScalar(0.8); });
    parts.push(nk);
    const head = ellipsoid(HR[0], HR[1], HR[2], 12, 9);
    displace(head, (p) => {
      const d = V3(p.x / HR[0], (p.y) / HR[1], p.z / HR[2]);
      // 下颌收窄、脸颊略鼓
      const jaw = sstep(-0.1, -0.9, d.y);
      p.x *= 1 - 0.18 * jaw; p.z *= 1 - 0.06 * jaw;
      p.y += (vnoise(p.x * 40 + sd, p.y * 40, p.z * 40, seed + 2) - 0.5) * 0.0008;
    });
    paint(head, (p, n, c) => {
      const dx = p.x / HR[0], dy = p.y / HR[1], dz = p.z / HR[2];
      c.copy(skin).multiplyScalar(0.94 + 0.1 * vnoise(p.x * 80, p.y * 80, p.z * 80, seed + 1));
      c.lerp(PAL.red, sstep(0.25, 0.0, Math.hypot(Math.abs(dx) - 0.58, dy + 0.22, dz - 0.7)) * 0.2);   // 腮红
      c.multiplyScalar(1 - 0.18 * sstep(0.06, 0.0, Math.hypot(Math.abs(dx) - 0.38, dy - 0.1, dz - 0.9)));  // 眼窝阴影
      c.multiplyScalar(1 - 0.12 * sstep(-0.25, -0.9, dy));
      // 头发：后脑 + 头顶，前额留发际线
      const edge = 0.52 + 0.3 * Math.max(0, dz) + (vnoise(p.x * 60 + sd, p.y * 60, p.z * 60, seed + 6) - 0.5) * 0.18;
      const hm = sstep(edge - 0.06, edge + 0.04, dy) + (dz < -0.1 ? sstep(-0.55, -0.15, dy) * sstep(-0.1, -0.5, dz) : 0);
      const hc = hair.clone().multiplyScalar(0.7 + 0.5 * vnoise(p.x * 30, p.y * 140, p.z * 30, seed + 9));
      c.lerp(hc, clamp(hm, 0, 1) * (Math.abs(dx) > 0.9 && dy < 0.35 ? 0 : 1));
    });
    parts.push(head); place(head, 0, HY, 0, 0.04, 0, 0);
    for (const sx of [-1, 1]) {
      const ear = ellipsoid(0.005, 0.0105, 0.0075, 5, 3);
      paint(ear, (p, n, c) => { c.copy(skin).multiplyScalar(0.88); });
      place(ear, sx * 0.0302, HY - 0.001, -0.002);
      const eye = ellipsoid(0.0042, 0.0052, 0.0028, 5, 3);
      paint(eye, (p, n, c) => { c.copy(PAL.doorDark).lerp(hex(0x3a4a5a), 0.25 + 0.3 * sstep(0.0, 0.005, p.y)); });
      place(eye, sx * 0.0122, HY + 0.0032, 0.0306, 0.04);
      const brow = solidBox(0.0115, 0.0026, 0.0028, hair, seed, 0.2);
      place(brow, sx * 0.0122, HY + 0.0105, 0.0312, 0.04, 0, sx * -0.14);
      parts.push(ear, eye, brow);
    }
    const nose = ellipsoid(0.0055, 0.0085, 0.0075, 5, 4);
    paint(nose, (p, n, c) => { c.copy(skin).lerp(PAL.red, 0.1 + 0.1 * sstep(0.0, -0.008, p.y)).multiplyScalar(0.98); });
    place(nose, 0, HY - 0.0042, 0.0335, 0.2);
    const mouth = ellipsoid(0.0075, 0.0018, 0.0016, 6, 3);
    paint(mouth, (p, n, c) => { c.copy(hex(0xa05a4a)); });
    place(mouth, 0, HY - 0.0178, 0.0306, 0.1);
    parts.push(nose, mouth);
    for (const g of parts.slice(-8)) shade(g, (p, n) => 0.96 * skyAO(n, 0.08));
    shade(head, (p, n) => skyAO(n, 0.1) * lerp(0.85, 1, sstep(HY - 0.04, HY + 0.01, p.y)));
  }
  /* ---- 帽子 ---- */
  const wovenTone = (p, c, base, k) => {
    const a = Math.atan2(p.x, p.z);
    c.copy(base).multiplyScalar(0.84 + 0.18 * Math.sin(a * 22 + k) * 0.5 + 0.16 * vnoise(p.x * 90 + sd, p.y * 90, p.z * 90, seed + 4));
  };
  if (hat === 'straw') {
    const BY = HY + 0.023;
    const brim = lathe([[0.03, 0.0], [0.065, -0.003], [0.0845, -0.015], [0.0825, -0.0175], [0.07, -0.008], [0.03, -0.004]], 14);
    brim.computeVertexNormals();
    paint(brim, (p, n, c) => { wovenTone(p, c, hatCol, 0); c.lerp(PAL.strawDk, sstep(0.07, 0.085, Math.hypot(p.x, p.z)) * 0.3); c.multiplyScalar(n.y < -0.2 ? 0.62 : 1); });
    const crown = lathe([[0, 0.04], [0.022, 0.037], [0.0345, 0.02], [0.0365, -0.002], [0, -0.002]], 12);
    crown.computeVertexNormals();
    paint(crown, (p, n, c) => { wovenTone(p, c, hatCol, 2); c.lerp(PAL.strawLt, sstep(0.02, 0.04, p.y) * 0.3); });
    const band = new THREE.CylinderGeometry(0.0372, 0.0378, 0.0095, 12, 1, true);
    paint(band, (p, n, c) => { c.copy(PAL.red).multiplyScalar(0.85 + 0.2 * vnoise(p.x * 80, p.y * 80, p.z * 80, seed)); });
    band.translate(0, 0.006, 0);
    for (const g of [brim, crown, band]) { place(g, 0, BY, 0.0, -0.1, 0, 0, 1, 1, 1); shade(g, (p, n) => skyAO(n, 0.1) * (n.y < -0.3 ? 0.7 : 1)); parts.push(g); }
  } else if (hat === 'cap') {
    const BY = HY + 0.019;
    const prof = [[0.0398, -0.01], [0.0405, 0.002]];
    for (let k = 1; k <= 4; k++) { const a = (k / 4) * Math.PI / 2; prof.push([Math.max(0.0015, 0.0405 * Math.cos(a)), 0.002 + 0.036 * Math.sin(a)]); }
    const dome = lathe(prof, 12);
    dome.computeVertexNormals();
    paint(dome, (p, n, c) => { wovenTone(p, c, hatCol, 1); c.multiplyScalar(0.9 + 0.2 * sstep(-0.01, 0.03, p.y)); if (p.y < -0.004) c.multiplyScalar(0.75); });
    place(dome, 0, BY, -0.002, -0.05, 0, 0, 0.9, 1, 0.9);
    const bill = grid(5, 3, (i, j, v) => {
      const u = i / 4 * 2 - 1, d = j / 2;
      v[0] = u * 0.026; v[2] = 0.032 + d * 0.02 * (1 - 0.25 * u * u); v[1] = -0.002 - d * 0.009 + 0.004 * u * u * d;
    }, false);
    bill.computeVertexNormals();
    const bill2 = bill.clone(); bill2.index.array.reverse(); bill2.translate(0, -0.0016, 0); bill2.computeVertexNormals();
    for (const g of [bill, bill2]) paint(g, (p, n, c) => { c.copy(hatCol).multiplyScalar(0.7 + 0.1 * vnoise(p.x * 60, p.y * 60, p.z * 60, seed)); });
    for (const g of [bill, bill2]) place(g, 0, BY + 0.003, -0.004, 0.1);
    const bt = ellipsoid(0.005, 0.003, 0.005, 5, 3);
    paint(bt, (p, n, c) => { c.copy(hatCol).multiplyScalar(0.8); });
    place(bt, 0, BY + 0.0385, -0.006);
    for (const g of [dome, bill, bill2, bt]) { shade(g, (p, n) => skyAO(n, 0.1)); parts.push(g); }
  }
  const geometry = assemble(parts, 0);
  return { geometry, anchors: {} };
}

/* ============================================================
 * 10. 漂浮的补给木箱（原点在水线，箱体 y≈-0.04..0.1，约 0.14 见方）
 * ============================================================ */
export function supplyCrate(seed = 1) {
  const rnd = mulberry32(seed * 1237 + 53);
  const sd = seed * 4.3;
  const parts = [];
  const S = 0.14, H = 0.14, Y0 = -0.04, T = 0.008;
  const NP = 5, PITCH = H / NP, PH = PITCH - 0.0024;
  const plankCols = [PAL.wood, hex(0x94653f), hex(0x7a5236), hex(0x6d4a30)];
  const woodPaint = (g, k, wet = 1) => paint(g, (p, n, c, vi) => {
    const tone = hash3(k, 7, 3, seed);
    const q = fbm(p.x * 18 + sd + k, p.y * 90, p.z * 18 + k, seed + 2, 3);
    c.copy(plankCols[Math.floor(tone * 3.99)]).lerp(PAL.woodDk, 0.15 + 0.35 * sstep(0.55, 0.3, q));
    c.lerp(P2.plank, 0.06 * sstep(0.6, 0.8, q));
  });
  const plank = (L, h, d, k, along) => {
    const g = new THREE.BoxGeometry(L, h, d, 1, 1, 1);
    woodPaint(g, k);
    return g;
  };
  let pk = 0;
  const wall = (sideIdx) => {
    // 四面墙：每面 5 块横板，错落、略歪，偶有一块断缺
    const ph = (sideIdx * Math.PI) / 2;
    for (let i = 0; i < NP; i++) {
      const y = Y0 + PITCH * (i + 0.5);
      const L = S - 2 * 0.002 + (rnd() - 0.5) * 0.004, cut = sideIdx === 1 && i === 1 ? 0.03 : 0;
      const g = plank(L - cut, PH * (0.94 + 0.08 * rnd()), T, pk++);
      place(g, -cut / 2, y, S / 2 - T / 2, 0, 0, (rnd() - 0.5) * 0.02);
      g.rotateY(ph);
      parts.push(g);
    }
  };
  for (let s = 0; s < 4; s++) wall(s);
  // 四根转角立柱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.017, H + 0.004, 0.017, 1, 1, 1);
    woodPaint(g, pk++);
    paint(g, (p, n, c) => { c.multiplyScalar(0.8); });
    place(g, sx * (S / 2 - 0.0075), Y0 + H / 2, sz * (S / 2 - 0.0075));
    parts.push(g);
  }
  // 箱盖：五块板 + 两根横档
  for (let i = 0; i < 5; i++) {
    const z = -S / 2 + (S / 5) * (i + 0.5);
    const g = plank(S - 0.002, 0.007, S / 5 - 0.0024, pk++);
    place(g, 0, Y0 + H - 0.0035 + 0.0, z, 0, 0, 0);
    parts.push(g);
  }
  for (const sx of [-1, 1]) {
    const g = plank(0.016, 0.006, S - 0.016, pk++);
    paint(g, (p, n, c) => { c.multiplyScalar(0.82); });
    place(g, sx * 0.05, Y0 + H + 0.002, 0);
    parts.push(g);
  }
  // 底（暗）
  { const g = solidBox(S - 0.01, 0.006, S - 0.01, PAL.woodDk, seed); g.translate(0, Y0 + 0.003, 0); parts.push(g); }
  // 钉头
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const nl = smooth(new THREE.SphereGeometry(0.0035, 4, 2));
    paint(nl, (p, n, c) => { c.copy(PAL.metal).lerp(PAL.stone, 0.2); });
    place(nl, sx * 0.0505, Y0 + H + 0.0035, sz * 0.0505, 0, 0, 0, 1, 0.5, 1);
    parts.push(nl);
  }

  /* ---- 绳子：绕箱一圈 + 绳结 + 两条绳尾 ---- */
  const RY = 0.046, RR = S / 2 + 0.003;
  {
    const pts = [];
    const NPT = 16;
    for (let i = 0; i < NPT; i++) {
      const a = (i / NPT) * TAU, sx = Math.sin(a), cz = Math.cos(a);
      const m = Math.pow(Math.pow(Math.abs(sx), 6) + Math.pow(Math.abs(cz), 6), -1 / 6);
      pts.push(V3(sx * m * RR * 1.0, RY + 0.002 * Math.sin(a * 3 + sd), cz * m * RR));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const g = new THREE.TubeGeometry(curve, 28, 0.0042, 4, true);
    g.deleteAttribute('uv');
    paint(g, (p, n, c, vi) => {
      const i = Math.floor(vi / 5);
      c.copy(PAL.rope).multiplyScalar(0.78 + 0.28 * Math.sin(i * 1.7 + (vi % 5) * 1.1)).lerp(PAL.woodDk, 0.15 * vnoise(p.x * 40, p.y * 40, p.z * 40, seed));
    });
    parts.push(g);
    const kn = smooth(new THREE.SphereGeometry(0.0085, 5, 3));
    paint(kn, (p, n, c) => { c.copy(PAL.rope).multiplyScalar(0.9 + 0.2 * vnoise(p.x * 80, p.y * 80, p.z * 80, seed)); });
    place(kn, 0.018, RY, RR + 0.003, 0, 0, 0, 1, 0.9, 0.8);
    parts.push(kn);
    for (const [dx, dr] of [[0.008, -0.35], [0.026, 0.3]]) {
      const cv = new THREE.CatmullRomCurve3([V3(dx, RY - 0.003, RR + 0.007), V3(dx + dr * 0.01, RY - 0.022, RR + 0.012), V3(dx + dr * 0.025, RY - 0.046, RR + 0.006)]);
      const tg = new THREE.TubeGeometry(cv, 3, 0.0032, 4, false);
      tg.deleteAttribute('uv');
      paint(tg, (p, n, c) => { c.copy(PAL.rope).multiplyScalar(0.85 + 0.2 * Math.sin(p.y * 500)); });
      parts.push(tg);
    }
  }

  /* ---- 海藻：缠在箱角 / 绳上、垂进水里 ---- */
  const weedCols = [hex(0x3f5a2a), hex(0x59702f), hex(0x6b5a2a), hex(0x2f4a30)];
  const ribbon = (x, y0, z, len, wd, k, nx, nz) => {
    const R = 4, g = grid(2, R, (i, j, v) => {
      const t = j / (R - 1), w = wd * (1 - 0.5 * t) * (i - 0.5) * 2 * 0.5;
      const sw = Math.sin(t * 3.2 + k * 1.7 + sd) * 0.008 * t;
      v[0] = x + nz * w + nx * (0.004 * t + sw * 0.4); v[1] = y0 - t * len; v[2] = z + nx * w * 0 - nz * 0 + nz * (0.003 + 0.004 * t) * 0 + (nx !== 0 ? w : 0) * 0 + (nx !== 0 ? 0 : 0.004 * t + sw);
    }, false);
    // 法线：沿外向，双面各一份
    g.computeVertexNormals();
    const back = g.clone(); back.index.array.reverse(); back.computeVertexNormals();
    for (const gg of [g, back]) {
      paint(gg, (p, n, c) => {
        c.copy(weedCols[k % 4]).multiplyScalar(0.8 + 0.3 * vnoise(p.x * 60, p.y * 60, p.z * 60, seed + k));
        c.lerp(PAL.woodDk, sstep(0.0, -0.05, p.y) * 0.3);
      });
      parts.push(gg);
    }
  };
  ribbon(0.012, RY + 0.005, RR + 0.007, 0.075, 0.016, 0, 0, 1);
  ribbon(-0.004, RY + 0.004, RR + 0.007, 0.095, 0.012, 1, 0, 1);
  ribbon(0.03, RY + 0.003, RR + 0.007, 0.06, 0.012, 2, 0, 1);
  ribbon(RR + 0.007, RY + 0.003, 0.02, 0.07, 0.014, 3, 1, 0);
  ribbon(RR + 0.007, RY + 0.003, -0.02, 0.09, 0.012, 4, 1, 0);

  // 整体漂浮姿态：略前倾、侧倾
  const tiltX = 0.05, tiltZ = -0.06;
  const geoms = parts.map((g) => finish(g.index ? g : g));
  for (const g of geoms) place(g, 0, 0.002, 0, tiltX, 0.12, tiltZ);
  const geometry = mergeGeometries(geoms, false);
  // 着色在世界坐标下做：水线以下潮湿发暗发绿，水线上有盐渍
  paint(geometry, (p, n, c) => {
    const wet = sstep(0.012, -0.012, p.y);
    c.lerp(PAL.woodDk, wet * 0.55).multiplyScalar(1 - 0.28 * wet);
    c.lerp(PAL.moss, wet * 0.2 * vnoise(p.x * 40, p.y * 30, p.z * 40, seed + 4));
    const salt = sstep(0.014, 0.008, Math.abs(p.y - 0.014 - 0.006 * vnoise(p.x * 25, 0, p.z * 25, seed)));
    c.lerp(P2.plank, salt * 0.12);
    c.multiplyScalar(1 - 0.22 * sstep(0.1, 0.04, p.y) * sstep(-0.01, 0.012, p.y) * 0.0);
  });
  shade(geometry, (p, n) => skyAO(n, 0.14) * lerp(0.82, 1, sstep(-0.04, 0.0, p.y)));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, anchors: {} };
}
