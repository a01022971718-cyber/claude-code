// 屿灵：岛上的居民和主角。不是人，是“活过来的小地块”——
// 一只圆滚滚的六边形团子（和岛上的地块同一个形状），糯米色的身子，头顶盖着一片地表（草皮、林地、花田、麦田、海水、岩石），
// 地表上长着它的“标志”：嫩芽、小松树、花、麦穗、贝壳、石堆。两只圆眼睛、一点腮红、两只小短脚。
// 设计理念：一个最简单的几何形（六边形）+ 一个颜色主题 + 极简的五官，远看一眼认得出，近看有细节；每只屿灵对应岛上的一种生态。
// 造型为本项目原创。几何只有一份合并网格（约 2000 面），颜色写在顶点色里。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C = (h) => new THREE.Color(h);
const BODY = C(0xf5e9d3), BODY_LOW = C(0xdcc09a), FOOT = C(0xcfa77c), DARK = C(0x2a2320), BLUSH = C(0xf2a08c);
/** 六种屿灵：名字、头顶地表的颜色、标志 */
export const KINDS = [
  { id: 'grass', cap: 0x8cc043, top: 'sprout' },
  { id: 'forest', cap: 0x4f8a3a, top: 'pine' },
  { id: 'flower', cap: 0xf0a9c4, top: 'flower' },
  { id: 'wheat', cap: 0xe6b94e, top: 'wheat' },
  { id: 'sea', cap: 0x4fb9cc, top: 'shell' },
  { id: 'rock', cap: 0xa3a8b0, top: 'cairn' },
];
/** 给一块几何上纯色（可选：按高度从 lo 渐变到 hi） */
function tint(g, hi, lo = null) {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.computeBoundingBox();
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 3), y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, t = new THREE.Color();
  for (let i = 0; i < n; i++) { t.copy(lo || hi); if (lo) t.lerp(hi, (p.getY(i) - y0) / (y1 - y0 || 1)); a.set([t.r, t.g, t.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const ball = (r, x, y, z, c, sx = 1, sy = 1, sz = 1, seg = 10) => { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)); g.scale(sx, sy, sz); g.translate(x, y, z); return tint(g, C(c)); };
const stick = (r, h, x, y, z, c, rx = 0, rz = 0) => { const g = new THREE.CylinderGeometry(r * 0.8, r, h, 6); g.translate(0, h / 2, 0); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); return tint(g, C(c)); };

const R = 0.056, H = 0.086, BEV = 0.015, FEET = 0.018;
/** 身子：圆角六边形挤出 + 大倒角，下半截略鼓；上面三分之一是“地表”，边缘像流下来的糖霜 */
function body(cap, seed) {
  const sh = new THREE.Shape(), k = 0.22;
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2, p = [Math.cos(a0) * R, Math.sin(a0) * R], q = [Math.cos(a1) * R, Math.sin(a1) * R];
    const s = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k], e = [p[0] + (q[0] - p[0]) * (1 - k), p[1] + (q[1] - p[1]) * (1 - k)];
    if (i === 0) sh.moveTo(s[0], s[1]); else sh.quadraticCurveTo(p[0], p[1], s[0], s[1]);
    sh.lineTo(e[0], e[1]);
  }
  sh.quadraticCurveTo(R, 0, R + (Math.cos(Math.PI / 3) * R - R) * k, Math.sin(Math.PI / 3) * R * k);
  let g = new THREE.ExtrudeGeometry(sh, { depth: H - BEV * 2, steps: 8, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 5, curveSegments: 5 });
  g.rotateX(-Math.PI / 2); g.translate(0, FEET + BEV, 0); g = g.toNonIndexed(); g.deleteAttribute('uv');
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3), capC = C(cap), t = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const y = p.getY(i), f = (y - FEET) / H, bulge = 1 + 0.1 * Math.sin(Math.min(1, f * 1.25) * Math.PI) * (1 - f * 0.5);
    p.setX(i, p.getX(i) * bulge); p.setZ(i, p.getZ(i) * bulge);
    const ang = Math.atan2(p.getZ(i), p.getX(i)), edge = 0.64 + 0.07 * Math.sin(ang * 5 + seed * 1.7) + 0.03 * Math.sin(ang * 11 + seed);
    if (f > edge) t.copy(capC).multiplyScalar(0.9 + 0.16 * Math.min(1, (f - edge) * 3));
    else t.copy(BODY_LOW).lerp(BODY, Math.min(1, f * 2.2));
    col.set([t.r, t.g, t.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
/** 头顶的标志 */
function topper(kind, y, seed) {
  const P = [], s = (seed % 2 ? 1 : -1);
  if (kind === 'sprout') { P.push(stick(0.0035, 0.03, 0, y, 0, 0x5f9d3a, 0, s * 0.12)); for (const d of [-1, 1]) { const g = new THREE.SphereGeometry(0.013, 8, 6); g.scale(1, 0.28, 0.62); g.rotateZ(d * 0.55); g.translate(d * 0.012 - s * 0.004, y + 0.034, 0); P.push(tint(g, C(0x8fd04a), C(0x5fa838))); } }
  else if (kind === 'pine') { P.push(stick(0.004, 0.014, 0, y, 0, 0x6b5644)); for (let i = 0; i < 3; i++) { const g = new THREE.ConeGeometry(0.02 - i * 0.005, 0.022, 7); g.translate(0, y + 0.02 + i * 0.013, 0); P.push(tint(g, C(0x3f7a38), C(0x2a5a2c))); } }
  else if (kind === 'flower') { P.push(stick(0.003, 0.028, 0, y, 0, 0x5f9d3a, 0, s * 0.1)); const fy = y + 0.031, fx = -s * 0.003; for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; P.push(ball(0.0075, fx + Math.cos(a) * 0.0085, fy, Math.sin(a) * 0.0085, 0xfff6f0, 1, 0.5, 1, 8)); } P.push(ball(0.006, fx, fy + 0.002, 0, 0xf7c23c, 1, 0.7, 1, 8)); }
  else if (kind === 'wheat') { for (const [dx, rz] of [[-0.012, 0.3], [0, 0], [0.012, -0.3]]) { P.push(stick(0.002, 0.024, dx, y, 0, 0xc99a3a, 0, rz)); const g = new THREE.SphereGeometry(0.005, 7, 6); g.scale(1, 2.3, 1); g.translate(0, 0.031, 0); g.rotateZ(rz); g.translate(dx, y, 0); P.push(tint(g, C(0xf2cc5a), C(0xd9a83a))); } }
  else if (kind === 'shell') { for (let i = 0; i < 4; i++) P.push(ball(0.014 - i * 0.003, s * i * 0.002, y + 0.008 + i * 0.008, -i * 0.001, i % 2 ? 0xfbe3d2 : 0xf6b8a0, 1, 0.75, 1, 9)); }
  else { for (let i = 0; i < 3; i++) P.push(ball(0.013 - i * 0.0035, s * (i - 1) * 0.003, y + 0.006 + i * 0.012, 0, [0x8d9299, 0xb4b8be, 0x9aa0a8][i], 1.1, 0.7, 1, 7)); P.push(ball(0.004, 0.012, y + 0.004, 0.008, 0x8fd04a, 1, 0.6, 1, 6)); }
  return P;
}
/** 一只屿灵（面朝 +z，脚底 y=0，高约 0.15）。variant 0–5 对应 KINDS */
export function sprite(variant = 0) {
  const K = KINDS[variant % KINDS.length], P = [body(K.cap, variant + 1)];
  const zf = (R * 0.866 + BEV) * 1.085 + 0.0005, ye = FEET + H * 0.47;
  for (const d of [-1, 1]) {
    P.push(ball(0.0072, d * 0.0165, ye, zf, DARK.getHex(), 1, 1.15, 0.45));                 // 眼睛
    P.push(ball(0.0024, d * 0.0165 + 0.002, ye + 0.0035, zf + 0.0028, 0xffffff, 1, 1, 0.5, 6)); // 眼里的高光
    P.push(ball(0.0062, d * 0.0285, ye - 0.0125, zf - 0.0012, BLUSH.getHex(), 1.25, 0.7, 0.3, 8)); // 腮红
    P.push(ball(0.013, d * 0.024, 0.0105, 0.006, FOOT.getHex(), 1, 0.8, 1.25, 8));          // 小短脚
    P.push(ball(0.0105, d * (R + BEV + 0.0035), FEET + H * 0.36, 0.008, 0xead9bd, 0.75, 1.15, 1, 8)); // 小手
  }
  P.push(ball(0.0034, 0, ye - 0.0115, zf + 0.0005, 0x6a3c32, 1.5, 0.8, 0.45, 6));           // 嘴
  P.push(...topper(K.top, FEET + H - 0.004, variant));
  const g = mergeGeometries(P, false); for (const x of P) x.dispose(); g.computeBoundingSphere();
  return { geometry: g, kind: K.id };
}
