// 体素主题的海洋生物和海鸥：和 models-marine.js / seabirds.js 同名、同尺寸、同动画属性，
// 换成大小不同、颜色不同的方块（和原版体素羊、树同一种画风）。
//  - 鱼、海豚、鲸：bend（头 0 → 尾 1），着色器按它摆尾
//  - 珊瑚、海扇、海葵、海带：sway（底 0 → 顶 1），着色器按它随浪摆
//  - 水母：rim（伞缘收缩）、tent（触手飘动）
// 几何带 userData.vox = true：本来就很省，不再做减面（减面会把方块揉成团）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rbox, merge, gridCubes, tone } from './blocky.js';
import { rng } from './noise.js';

const col = (c) => (c && c.isColor ? c : new THREE.Color(c));
const pl = (w, h, d, x, y, z, c, o = {}) => rbox(w, h, d, x, y, z, c, { seg: 0, ao: 0.08, ...o });
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** 按顶点位置写一个动画属性 */
function attr(g, name, fn) { const p = g.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = fn(p.getX(i), p.getY(i), p.getZ(i)); g.setAttribute(name, new THREE.BufferAttribute(a, 1)); return g; }
const vox = (g) => { g.userData.vox = true; g.computeBoundingSphere(); return g; };
const BLACK = 0x15110f;

// ---------------- 鱼（身长约 0.06，头朝 +z） ----------------
const FISHV = {
  tang: { back: 0xffc400, belly: 0xffe070, fin: 0xf0b000, tail: 0xf2b400, mark: 0xfff8e0, h: 0.03, w: 0.016 },
  blue: { back: 0x1b50dc, belly: 0x5f9cf8, fin: 0x1a3fb8, tail: 0xffd020, mark: 0x0b1030, h: 0.029, w: 0.015 },
  clown: { back: 0xff6410, belly: 0xff8a2a, fin: 0xff6a10, tail: 0xff7a18, mark: 0xf8f4ec, h: 0.024, w: 0.02 },
  sardine: { back: 0x2a808d, belly: 0xe6f0f2, fin: 0x4a6e7a, tail: 0x4a6e7a, mark: 0x112c38, h: 0.012, w: 0.01, len: 0.045 },
};
export function vFish(seed = 1, species = 'tang') {
  const S = FISHV[species] || FISHV.tang, L = S.len || 0.06, h = S.h, w = S.w, P = [];
  // 身子：四节，头一节小、中间最高、往尾巴收（每节下浅上深）
  const SEC = [[0.22, 0.66, 0.78], [0.26, 1, 1], [0.2, 0.78, 0.84], [0.12, 0.4, 0.5]];
  let z = L / 2; const mid = [];
  for (const [f, hf, wf] of SEC) { const l = L * f; P.push(rbox(w * wf, h * hf, l + 0.0005, 0, 0, z - l / 2, S.belly, { seg: 0, ao: 0, top: S.back })); mid.push(z - l / 2); z -= l; }
  // 眼睛（穿过头两侧）、背鳍、臀鳍、胸鳍、尾鳍
  P.push(pl(w * 0.8, h * 0.14, L * 0.05, 0, h * 0.1, L / 2 - L * 0.07, BLACK, { ao: 0 }));
  P.push(pl(0.002, h * 0.32, L * 0.42, 0, h * 0.5 + h * 0.12, mid[1] - L * 0.04, S.fin, { ao: 0 }));
  P.push(pl(0.002, h * 0.24, L * 0.22, 0, -h * 0.4 - h * 0.1, mid[2], S.fin, { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.008, 0.002, L * 0.12, s * (w * 0.55), -h * 0.12, mid[0] - L * 0.08, S.fin, { ao: 0, rz: s * 0.4 }));
  const zt = z - L * 0.07;
  if (species === 'clown') P.push(pl(0.002, h * 0.85, L * 0.14, 0, 0, zt, S.tail, { ao: 0 }), pl(0.0022, h * 0.85, L * 0.03, 0, 0, zt - L * 0.06, BLACK, { ao: 0 }));
  else for (const s of [-1, 1]) P.push(pl(0.002, h * 0.42, L * 0.15, 0, s * h * 0.2, zt, S.tail, { ao: 0, rx: s * 0.55 }));
  // 花纹
  if (species === 'tang') for (const s of [-1, 1]) P.push(pl(0.002, h * 0.16, L * 0.05, s * w * 0.26, 0, mid[3], S.mark, { ao: 0 }));
  if (species === 'blue') for (const s of [-1, 1]) P.push(pl(0.002, h * 0.3, L * 0.38, s * w * 0.5, h * 0.12, (mid[1] + mid[2]) / 2, S.mark, { ao: 0 }));
  if (species === 'clown') for (const zz of [mid[0] - L * 0.04, mid[1] - L * 0.02, mid[3]]) P.push(pl(w * (zz === mid[3] ? 0.55 : 1.04), h * (zz === mid[3] ? 0.44 : 0.98), L * 0.035, 0, 0, zz, S.mark, { ao: 0 }));
  if (species === 'sardine') for (let i = 0; i < 3; i++) for (const s of [-1, 1]) P.push(pl(0.002, h * 0.2, L * 0.04, s * w * 0.5, h * 0.12, mid[1] - i * L * 0.1, S.mark, { ao: 0 }));
  return { geometry: vox(attr(merge(P), 'bend', (x, y, zz) => clamp((L / 2 - zz) / L))) };
}

// ---------------- 海龟（分部件：身子、头、四只鳍） ----------------
export function vTurtle() {
  const skin = col(0x8a9a5a), spot = col(0xc8d090), B = [], H = [];
  B.push(pl(0.09, 0.01, 0.12, 0, -0.012, -0.004, 0xe8d8a0, { ao: 0 }));
  B.push(rbox(0.112, 0.014, 0.142, 0, -0.002, -0.004, 0x55663a, { seg: 1, r: 0.25, ao: 0.2 }));
  B.push(rbox(0.09, 0.014, 0.116, 0, 0.011, -0.004, 0x6a7a40, { seg: 1, r: 0.25, ao: 0.1 }));
  B.push(rbox(0.058, 0.012, 0.078, 0, 0.022, -0.004, 0x7a8a48, { seg: 1, r: 0.3, ao: 0 }));
  for (const [x, z, c] of [[0, 0.024, 0x8a6a3a], [0, -0.004, 0x5f7a3a], [0, -0.032, 0x8a6a3a], [0.03, 0.01, 0x7a5a32], [-0.03, 0.01, 0x7a5a32], [0.03, -0.02, 0x5f7a3a], [-0.03, -0.02, 0x5f7a3a]]) B.push(pl(0.022, 0.004, 0.022, x, x ? 0.019 : 0.029, z, c, { ao: 0 }));
  B.push(pl(0.01, 0.006, 0.016, 0, -0.006, -0.08, skin, { ao: 0 }));
  const hp = [0, -0.004, 0.062];
  H.push(pl(0.018, 0.013, 0.02, 0, -0.004, 0.068, skin, { ao: 0.1 }), rbox(0.024, 0.02, 0.03, 0, -0.002, 0.088, skin, { seg: 1, r: 0.25, ao: 0.1 }), pl(0.026, 0.004, 0.005, 0, 0.003, 0.094, BLACK, { ao: 0 }), pl(0.014, 0.006, 0.006, 0, -0.008, 0.101, 0x5a5a3a, { ao: 0 }), pl(0.008, 0.002, 0.008, 0.006, 0.009, 0.084, spot, { ao: 0 }));
  const parts = { body: { geometry: merge(B), pivot: [0, 0, 0] }, head: { geometry: merge(H), pivot: hp } };
  for (const [k, s] of [['FL', 1], ['FR', -1]]) parts['flipper' + k] = { geometry: merge([pl(0.036, 0.007, 0.03, s * 0.052, -0.008, 0.024, skin, { ao: 0.1 }), pl(0.04, 0.006, 0.02, s * 0.084, -0.009, 0.01, skin.clone().multiplyScalar(0.9), { ao: 0 }), pl(0.008, 0.0065, 0.008, s * 0.07, -0.008, 0.02, spot, { ao: 0 })]), pivot: [s * 0.0389, -0.0056, 0.0317] };
  for (const [k, s] of [['BL', 1], ['BR', -1]]) parts['flipper' + k] = { geometry: pl(0.026, 0.006, 0.032, s * 0.038, -0.008, -0.06, skin, { ao: 0.1 }), pivot: [s * 0.0306, -0.007, -0.0462] };
  const geometry = mergeGeometries(Object.values(parts).map((p) => p.geometry), false); geometry.computeBoundingSphere();
  return { geometry, parts };
}

/** 海豚 / 鲸的身子：沿 z 一节节的方块（下浅上深），bend 从头到尾 */
function bodyRun(P, secs, belly, back) { for (const [z, l, h, w, y = 0] of secs) P.push(rbox(w, h, l, 0, y, z, belly, { seg: 1, r: 0.12, ao: 0, top: back })); }
// ---------------- 海豚（身长约 0.32） ----------------
export function vDolphin() {
  const P = [], back = col(0x5a6f86), belly = col(0xdde2e8);
  bodyRun(P, [[0.148, 0.026, 0.016, 0.016, -0.01], [0.115, 0.05, 0.05, 0.045, 0.004], [0.062, 0.062, 0.064, 0.056], [0.0, 0.064, 0.062, 0.054], [-0.058, 0.054, 0.046, 0.04], [-0.098, 0.04, 0.03, 0.024], [-0.128, 0.026, 0.018, 0.014]], belly, back);
  P.push(pl(0.046, 0.006, 0.006, 0, 0.008, 0.124, BLACK, { ao: 0 }));
  P.push(pl(0.007, 0.018, 0.04, 0, 0.04, -0.004, back, { ao: 0 }), pl(0.007, 0.016, 0.022, 0, 0.055, -0.016, back, { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.032, 0.005, 0.02, s * 0.04, -0.022, 0.055, back, { ao: 0, rz: s * 0.4 }));
  P.push(pl(0.09, 0.006, 0.03, 0, 0, -0.146, back, { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.028, 0.006, 0.02, s * 0.05, 0, -0.155, back, { ao: 0 }));
  return { geometry: vox(attr(merge(P), 'bend', (x, y, z) => clamp((0.16 - z) / 0.32))) };
}
// ---------------- 鲸（身长约 1.6） ----------------
export function vWhale() {
  const P = [], back = col(0x2f3e52), belly = col(0x6a7a8c), R = rng(91);
  bodyRun(P, [[0.62, 0.36, 0.3, 0.36, -0.03], [0.3, 0.3, 0.44, 0.46], [0.0, 0.32, 0.42, 0.44], [-0.3, 0.28, 0.3, 0.3], [-0.53, 0.2, 0.16, 0.14], [-0.68, 0.12, 0.08, 0.08]], belly, back);
  for (let i = -2; i <= 2; i++) P.push(pl(0.016, 0.012, 0.56, i * 0.056, -0.205, 0.38, 0xc8ccd2, { ao: 0 }));
  P.push(pl(0.37, 0.022, 0.022, 0, -0.06, 0.58, BLACK, { ao: 0 }));
  for (let i = 0; i < 7; i++) P.push(pl(0.03, 0.012, 0.03, (R() - 0.5) * 0.24, 0.12, 0.55 + (R() - 0.5) * 0.25, 0xb8bcc0, { ao: 0 }));
  P.push(pl(0.04, 0.05, 0.1, 0, 0.23, -0.3, back, { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.4, 0.03, 0.12, s * 0.36, -0.13, 0.3, back, { ao: 0, rz: s * 0.35, ry: s * 0.3 }), pl(0.08, 0.032, 0.1, s * 0.52, -0.2, 0.22, 0xd8dce2, { ao: 0, rz: s * 0.35, ry: s * 0.3 }));
  P.push(pl(0.5, 0.025, 0.14, 0, 0, -0.74, back, { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.14, 0.025, 0.1, s * 0.25, 0, -0.78, back, { ao: 0 }));
  return { geometry: vox(attr(merge(P), 'bend', (x, y, z) => clamp((0.8 - z) / 1.6))) };
}
// ---------------- 水母：方块伞 + 一圈分节触手 + 中间几条口腕 ----------------
export function vJelly(seed = 1) {
  const R = rng(seed * 7 + 3), bell = [pl(0.04, 0.006, 0.04, 0, -0.006, 0, 0xd870b8, { ao: 0 }), rbox(0.06, 0.012, 0.06, 0, 0.002, 0, 0xf0a8d0, { seg: 1, r: 0.3, ao: 0.1 }), rbox(0.046, 0.01, 0.046, 0, 0.011, 0, 0xf4b8dc, { seg: 1, r: 0.3, ao: 0 }), pl(0.026, 0.004, 0.026, 0, 0.017, 0, 0xf8d0e8, { ao: 0 })];
  for (const [x, z] of [[0.009, 0], [-0.009, 0], [0, 0.009], [0, -0.009]]) bell.push(pl(0.007, 0.002, 0.007, x, 0.0195, z, 0xffe0f0, { ao: 0 }));
  const tent = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = 0.024; for (let j = 0; j < 3; j++) tent.push(pl(0.0035, 0.014, 0.0035, Math.cos(a) * r + (R() - 0.5) * 0.004, -0.012 - j * 0.013, Math.sin(a) * r + (R() - 0.5) * 0.004, 0xf4c8e4, { ao: 0 })); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; tent.push(pl(0.007, 0.03, 0.007, Math.cos(a) * 0.006, -0.026, Math.sin(a) * 0.006, 0xe890c8, { ao: 0 })); }
  const b = merge(bell), t = merge(tent);
  attr(b, 'rim', (x, y, z) => clamp(Math.hypot(x, z) / 0.03)); attr(b, 'tent', () => 0);
  attr(t, 'rim', () => 1); attr(t, 'tent', (x, y) => clamp(-y / 0.049));
  return { geometry: vox(merge([b, t])) };
}

// ---------------- 珊瑚、海扇、海葵、海带、海星、海胆 ----------------
const CORAL = { pink: [0xf07aa0, 0xff9ab8, 0xd85a88, 0xffc8d8], purple: [0x9a5ad0, 0xb27ae0, 0x7a40b0, 0xd8b0f4], orange: [0xff8a3a, 0xffa860, 0xe06a20, 0xffd0a0] };
const sway = (g, H) => attr(g, 'sway', (x, y) => clamp(y / H));
/** 枝状珊瑚：一格一格往上长的方块枝，会分叉，枝头颜色浅 */
export function vBranchCoral(seed = 1, color = 'pink') {
  const R = rng(seed * 59 + 1), pal = CORAL[color] || CORAL.pink, v = 0.012, cells = new Map();
  const put = (i, j, k, c) => { const key = i + ',' + j + ',' + k; if (!cells.has(key)) cells.set(key, { i, j, k, s: v, x: i * v, y: j * v + v / 2, z: k * v, c }); };
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) put(i, 0, k, col(pal[2]).multiplyScalar(0.85));
  const tips = [[0, 1, 0, 9]];
  let branches = 0;
  while (tips.length) {
    let [i, j, k, n] = tips.pop();
    for (let s = 0; s < n; s++) {
      put(i, j, k, tone(R, pal.slice(0, 3).map(col), 0.14));
      if (R() < 0.35) { if (R() < 0.5) i += R() < 0.5 ? -1 : 1; else k += R() < 0.5 ? -1 : 1; } else j++;
      if (branches < 6 && s > 1 && R() < 0.22) { branches++; tips.push([i + (R() < 0.5 ? -1 : 1), j, k + (R() < 0.5 ? -1 : 1), Math.max(2, n - s - 1)]); }
      i = Math.max(-3, Math.min(3, i)); k = Math.max(-3, Math.min(3, k)); j = Math.min(9, j);
    }
    put(i, j, k, col(pal[3]));
  }
  return { geometry: vox(sway(merge(gridCubes([...cells.values()])), 0.12)) };
}
/** 脑珊瑚：方块半球，表面两种颜色弯弯绕绕的条纹 */
export function vBrainCoral(seed = 1) {
  const R = rng(seed * 31 + 7), v = 0.008, cells = [], A = col(0xc8b868), B = col(0x8a7e44);
  for (let i = -5; i <= 5; i++) for (let k = -5; k <= 5; k++) for (let j = 0; j < 4; j++) {
    const x = i * v, y = j * v + v / 2, z = k * v; if ((x / 0.042) ** 2 + (y / 0.03) ** 2 + (z / 0.042) ** 2 > 1) continue;
    const stripe = Math.sin(i * 1.3 + Math.sin(k * 0.9) * 2 + k * 0.4) > 0.1;
    cells.push({ i, j, k, s: v, x, y, z, c: (stripe ? A : B).clone().multiplyScalar(0.92 + R() * 0.12) });
  }
  return { geometry: vox(sway(merge(gridCubes(cells)), 0.03)) };
}
/** 桌状珊瑚：短柄 + 一张边缘参差的方块圆桌 + 桌面上一颗颗小疙瘩 */
export function vTableCoral(seed = 1) {
  const R = rng(seed * 23 + 5), v = 0.015, cells = [], P = [pl(0.022, 0.026, 0.022, 0, 0.013, 0, 0xb08050, { ao: 0.3 })];
  for (let i = -5; i <= 5; i++) for (let k = -5; k <= 5; k++) { const d = Math.hypot(i, k) + (R() - 0.5) * 0.9; if (d > 4.9) continue; cells.push({ i, j: 0, k, s: v, x: i * v, y: 0.033, z: k * v, c: col(d > 3.8 ? 0xf0c090 : 0xd8a070).multiplyScalar(0.92 + R() * 0.12) }); }
  P.push(...gridCubes(cells, false));
  for (let n = 0; n < 14; n++) { const a = R() * 6.28, r = Math.sqrt(R()) * 0.06; P.push(pl(0.006, 0.006, 0.006, Math.cos(a) * r, 0.0435, Math.sin(a) * r, 0xf4d0a8, { ao: 0 })); }
  return { geometry: vox(sway(merge(P), 0.045)) };
}
/** 海扇：竖着的一面方格网（有镂空），根部一截短杆 */
export function vSeaFan(seed = 1) {
  const R = rng(seed * 41 + 3), v = 0.012, P = [], pal = [0xb0306a, 0xc84a80, 0x9a2858].map(col);
  for (let j = 0; j < 12; j++) for (let i = -9; i <= 9; i++) {
    const x = i * v, y = j * v + v / 2;
    if (j < 2 ? i !== 0 : (x / 0.11) ** 2 + ((y - 0.02) / 0.12) ** 2 > 1 || (y < 0.02 + Math.abs(x) * 0.5)) continue;
    if (j >= 2 && i % 2 && j % 3 && R() < 0.75) continue;   // 镂空的网眼
    const edge = (x / 0.11) ** 2 + ((y - 0.02) / 0.12) ** 2 > 0.62;
    P.push(pl(v * 0.92, v * 0.92, 0.006, x, y, 0.004, edge ? col(0xe86a98) : tone(R, pal, 0.12), { ao: 0 }));
  }
  return { geometry: vox(sway(merge(P), 0.14)) };
}
/** 海葵：短方柱 + 口盘 + 一片竖着的小方触手（触手顶端颜色浅） */
export function vAnemone(seed = 1) {
  const R = rng(seed * 13 + 1), P = [rbox(0.036, 0.016, 0.036, 0, 0.008, 0, 0xa04a6a, { seg: 1, r: 0.25, ao: 0.25 }), pl(0.044, 0.004, 0.044, 0, 0.018, 0, 0xc8608a, { ao: 0 })];
  for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) { if (Math.abs(i) === 2 && Math.abs(k) === 2) continue; const h = 0.01 + R() * 0.006; P.push(rbox(0.005, h, 0.005, i * 0.009 + (R() - 0.5) * 0.002, 0.02 + h / 2, k * 0.009 + (R() - 0.5) * 0.002, 0xd86aa0, { seg: 0, ao: 0, top: 0xffc0e0 })); }
  return { geometry: vox(attr(merge(P), 'sway', (x, y) => clamp((y - 0.018) / 0.016))) };
}
/** 巨藻：一根方块长茎，每一节斜伸出一片扁方叶子（绕着茎转），顶上一颗气囊 */
export function vKelp(seed = 1, h = 1.2) {
  const R = rng(seed * 17 + 9), P = [], seg = 0.07, n = Math.max(6, Math.round(h / seg)), LEAF = [0x7a8a2a, 0x8a9a3a, 0x6a7a24].map(col);
  for (let j = 0; j < n; j++) {
    const y = j * seg + seg / 2;
    P.push(pl(0.012, seg, 0.012, 0, y, 0, col(0x5a6a2a).multiplyScalar(0.9 + R() * 0.15), { ao: 0 }));
    if (j < 1) continue;
    const g = pl(0.1 - (j / n) * 0.03, 0.028, 0.005, 0.055, y, 0, tone(R, LEAF, 0.15), { ao: 0, rz: 0.55, top: 0xa8b04a });
    g.rotateY(j * 2.2 + R() * 0.4); P.push(g);
  }
  P.push(rbox(0.018, 0.018, 0.018, 0, n * seg + 0.009, 0, 0x9a9a3a, { seg: 1, r: 0.3, ao: 0 }));
  const g = merge(P); g.scale(1, h / (n * seg + 0.018), 1);
  return { geometry: vox(sway(g, h)) };
}
/** 海星：方块中心 + 五条两节的方臂，臂上几颗浅色疙瘩 */
export function vStarfish(seed = 1) {
  const R = rng(seed * 11 + 5), P = [pl(0.014, 0.008, 0.014, 0, 0.004, 0, 0xe8642a, { ao: 0.2 })];
  for (let a = 0; a < 5; a++) {
    const A = [pl(0.009, 0.007, 0.011, 0, 0.0035, 0.011, 0xe8642a, { ao: 0.2 }), pl(0.006, 0.005, 0.009, 0, 0.0025, 0.0195, 0xf08a4a, { ao: 0.1 }), pl(0.003, 0.002, 0.003, (R() - 0.5) * 0.004, 0.008, 0.011, 0xf8d0a0, { ao: 0 })];
    for (const g of A) { g.rotateY((a / 5) * Math.PI * 2); P.push(g); }
  }
  return { geometry: vox(merge(P)) };
}
/** 海胆：深紫方身子 + 一圈往外戳的细方刺 */
export function vSeaUrchin(seed = 1) {
  const R = rng(seed * 19 + 3), P = [rbox(0.024, 0.02, 0.024, 0, 0.011, 0, 0x3a2050, { seg: 1, r: 0.3, ao: 0.2 })];
  for (let i = 0; i < 16; i++) {
    const g = rbox(0.0028, 0.016, 0.0028, 0, 0.016, 0, 0x4a2a60, { seg: 0, ao: 0, top: 0x8a6aaa }), th = (i / 16) * Math.PI * 2 + R() * 0.3, tilt = 0.4 + R() * 0.9;
    g.rotateX(tilt); g.rotateY(th); g.translate(0, 0.011, 0); P.push(g);
  }
  return { geometry: vox(merge(P)) };
}

// ---------------- 海鸥：方身子、方头、黄嘴；翅膀是三段方板（翅尖黑） ----------------
export function vGullBody() {
  return merge([rbox(0.03, 0.028, 0.08, 0, 0, 0, 0xf4f4f0, { seg: 1, r: 0.25, ao: 0.15 }), pl(0.026, 0.004, 0.05, 0, 0.0145, -0.006, 0xb8bcc2, { ao: 0 }), rbox(0.026, 0.026, 0.026, 0, 0.012, 0.044, 0xf8f8f4, { seg: 1, r: 0.25, ao: 0.05 }), pl(0.008, 0.007, 0.016, 0, 0.008, 0.063, 0xf2c23a, { ao: 0 }), pl(0.028, 0.004, 0.004, 0, 0.016, 0.05, BLACK, { ao: 0 }), pl(0.024, 0.006, 0.02, 0, 0.002, -0.048, 0xd8d8d4, { ao: 0 })]);
}
export function vGullWing() {
  return merge([pl(0.09, 0.006, 0.05, 0.045, 0.008, 0, 0xe8e8e4, { ao: 0 }), pl(0.08, 0.005, 0.038, 0.13, 0.009, -0.01, 0xb8bcc2, { ao: 0 }), pl(0.04, 0.005, 0.028, 0.19, 0.009, -0.02, 0x30343a, { ao: 0 })]);
}
