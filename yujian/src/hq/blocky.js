// 方块风格（原型）：圆角方块的村民和动物、体素树。地址加 ?style=blocky 时启用，确认效果后再决定是否替换默认造型。
// 造型是我们自己的：村民是“方头 + 方身子 + 衣服帽子”的人形；羊是一团方块羊毛 + 深色脸；兔子有两只竖长耳朵；
// 树冠是一格一格的体素，叶色深浅交错，夹几颗红果子。不照搬任何已有品牌或游戏的角色。
// 做法：
//  - 大块面（头、身子、羊毛）用圆角方块（RoundedBoxGeometry，三段圆角），小零件（眼睛、鞋）用倒角方块（一段）或普通方块。
//  - 颜色写在顶点色里，下半部分压暗一点（假的环境光遮蔽），材质用偏哑光的黏土感（粗糙度 0.55–0.65）。
//  - 动物按部件给出（身子、头、四条腿，各带关节点），沿用 fauna.js 的步态和合批。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, makeNoise } from './noise.js';

/** 美术主题：'voxel' 体素 / 'classic' 经典。设置里切换（存在本机，切换后重新载入）；地址加 ?style=blocky 也能临时打开 */
export const THEME_KEY = 'yujian_theme';
const themeNow = () => { try { if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('style') === 'blocky') return 'voxel'; return (typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY)) || 'classic'; } catch { return 'classic'; } };
export const STYLE = { theme: themeNow(), get blocky() { return this.theme === 'voxel'; } };

const NZ = makeNoise(31);
const col = (c) => (c && c.isColor ? c : new THREE.Color(c));
/** 涂顶点色：底部压暗（ao=0.18 表示最底下暗 18%），可选按高度渐变到 top 色 */
function paint(g, c, { ao = 0.16, y0 = null, y1 = null, top = null, jitter = 0 } = {}) {
  const p = g.attributes.position, n = p.count, out = new Float32Array(n * 3), a = col(c), b = top ? col(top) : null, t = new THREE.Color();
  let lo = y0, hi = y1;
  if (lo == null || hi == null) { g.computeBoundingBox(); lo = g.boundingBox.min.y; hi = g.boundingBox.max.y; }
  for (let i = 0; i < n; i++) {
    const f = THREE.MathUtils.clamp((p.getY(i) - lo) / (hi - lo || 1), 0, 1);
    t.copy(a); if (b) t.lerp(b, f);
    const k = (1 - ao * (1 - f)) * (1 + (jitter ? NZ.n2(p.getX(i) * 90, p.getZ(i) * 90 + p.getY(i) * 40) * jitter : 0));
    out.set([t.r * k, t.g * k, t.b * k], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}
/** 圆角方块：尺寸 w,h,d，中心 (x,y,z)；seg 圆角段数，r 圆角占最短边的比例 */
function rbox(w, h, d, x, y, z, c, { seg = 2, r = 0.22, ao = 0.16, top = null, rx = 0, ry = 0, rz = 0 } = {}) {
  const g = seg > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(w, h, d) * r) : new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  paint(g, c, { ao, top });
  if (rx || ry || rz) g.rotateX(rx).rotateY(ry).rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
const merge = (list) => { const g = mergeGeometries(list, false); for (const x of list) x.dispose(); g.computeBoundingSphere(); return g; };
/** 在几何上加一个全 0 或按高度的 wind 属性（树叶材质要用） */
function windAttr(g, H) { const p = g.attributes.position, w = new Float32Array(p.count); if (H) for (let i = 0; i < p.count; i++) w[i] = THREE.MathUtils.clamp(p.getY(i) / H, 0, 1.2); g.setAttribute('wind', new THREE.BufferAttribute(w, 1)); return g; }

// ---------------- 村民 ----------------
const SKIN = [0xe8b896, 0xd9a07a, 0xc08463, 0xf0c8a8];
const HAIR = [0x3a2a20, 0x5a3a24, 0x1f1d1c, 0x8a5a32];
/** 方块村民（高约 0.25，面朝 +z）。opts: { shirt, pants, hat: 'straw'|'cap'|'band'|'none', hatColor, skin, hair } */
export function villager(seed = 1, opts = {}) {
  const R = rng(seed * 131 + 7), skin = col(opts.skin ?? SKIN[seed % SKIN.length]), hair = col(opts.hair ?? HAIR[(seed * 3) % HAIR.length]);
  const shirt = col(opts.shirt ?? 0x4f7fb0), pants = col(opts.pants ?? [0x5a4a3a, 0x3f4a5a, 0x6a5a44][seed % 3]), shoe = col(0x3a2e26), hat = opts.hat ?? 'none';
  const P = [];
  // 腿和鞋
  for (const s of [-1, 1]) { P.push(rbox(0.032, 0.048, 0.036, s * 0.021, 0.04, 0, pants, { seg: 1, r: 0.25 })); P.push(rbox(0.036, 0.018, 0.048, s * 0.021, 0.009, 0.005, shoe, { seg: 1, r: 0.3, ao: 0.05 })); }
  // 身子：上衣 + 下摆一圈深一点
  P.push(rbox(0.086, 0.074, 0.058, 0, 0.1, 0, shirt, { seg: 2, r: 0.2, ao: 0.22 }));
  P.push(rbox(0.088, 0.012, 0.06, 0, 0.067, 0, shirt.clone().multiplyScalar(0.72), { seg: 1, r: 0.3, ao: 0 }));
  // 胳膊和手（略微向前）
  for (const s of [-1, 1]) {
    P.push(rbox(0.022, 0.058, 0.026, s * 0.055, 0.098, 0.004, shirt.clone().multiplyScalar(0.9), { seg: 1, r: 0.3, rz: s * 0.08 }));
    P.push(rbox(0.021, 0.018, 0.023, s * 0.058, 0.062, 0.006, skin, { seg: 1, r: 0.35, ao: 0.05 }));
  }
  // 头：比身子宽一点的圆角方块
  P.push(rbox(0.094, 0.084, 0.086, 0, 0.18, 0, skin, { seg: 2, r: 0.2, ao: 0.1 }));
  // 头发：头顶一片 + 后脑一片 + 鬓角
  P.push(rbox(0.1, 0.026, 0.092, 0, 0.222, -0.002, hair, { seg: 1, r: 0.3, ao: 0.05 }));
  P.push(rbox(0.1, 0.06, 0.026, 0, 0.196, -0.036, hair, { seg: 1, r: 0.3, ao: 0.08 }));
  for (const s of [-1, 1]) P.push(rbox(0.012, 0.03, 0.05, s * 0.048, 0.2, -0.008, hair, { seg: 0, ao: 0 }));
  // 五官：两只小方眼睛、腮红、一道嘴（都是贴在脸上的薄片）
  for (const s of [-1, 1]) {
    P.push(rbox(0.012, 0.014, 0.004, s * 0.021, 0.183, 0.044, 0x1d1a1a, { seg: 0, ao: 0 }));
    P.push(rbox(0.014, 0.007, 0.003, s * 0.033, 0.168, 0.0435, skin.clone().lerp(col(0xe0705a), 0.45), { seg: 0, ao: 0 }));
  }
  P.push(rbox(0.014, 0.004, 0.003, 0, 0.163, 0.0435, 0x7a3e34, { seg: 0, ao: 0 }));
  // 帽子
  const hc = col(opts.hatColor ?? (hat === 'cap' ? 0xa8402c : 0xd8b56a));
  if (hat === 'straw') { P.push(rbox(0.15, 0.01, 0.14, 0, 0.228, 0, hc, { seg: 1, r: 0.4, ao: 0 })); P.push(rbox(0.082, 0.034, 0.078, 0, 0.248, 0, hc, { seg: 2, r: 0.25, ao: 0.1 })); P.push(rbox(0.084, 0.008, 0.08, 0, 0.236, 0, 0x7a4b2a, { seg: 0, ao: 0 })); }
  else if (hat === 'cap') { P.push(rbox(0.102, 0.03, 0.094, 0, 0.234, -0.002, hc, { seg: 2, r: 0.3 })); P.push(rbox(0.07, 0.008, 0.04, 0, 0.222, 0.06, hc.clone().multiplyScalar(0.85), { seg: 1, r: 0.3, ao: 0 })); }
  else if (hat === 'band') P.push(rbox(0.098, 0.012, 0.09, 0, 0.206, 0, hc, { seg: 0, ao: 0 }));
  void R;
  return { geometry: merge(P) };
}

// ---------------- 羊：一团方块羊毛 ----------------
export function sheep(seed = 1) {
  const R = rng(seed * 57 + 3), wool = col(0xece5d6), face = col(0x4a3f38), leg = col(0x3b332e);
  const W = [];
  for (let ix = 0; ix < 2; ix++) for (let iy = 0; iy < 2; iy++) for (let iz = 0; iz < 3; iz++) {
    const s = 0.036 + R() * 0.006, c = wool.clone().multiplyScalar(0.94 + R() * 0.08);
    W.push(rbox(s, s, s, (ix - 0.5) * 0.03 + (R() - 0.5) * 0.004, 0.056 + iy * 0.026 + (R() - 0.5) * 0.004, (iz - 1) * 0.032 + (R() - 0.5) * 0.004, c, { seg: 2, r: 0.32, ao: 0.2 }));
  }
  W.push(rbox(0.04, 0.03, 0.05, 0, 0.096, -0.004, wool, { seg: 2, r: 0.35, ao: 0.1 }));
  const parts = { body: { geometry: merge(W) } };
  // 头：深色方脸 + 浅色额毛 + 两只侧耳 + 小眼睛
  const hp = [0, 0.074, 0.046], H = [];
  H.push(rbox(0.034, 0.034, 0.038, 0, 0.074, 0.066, face, { seg: 2, r: 0.25, ao: 0.1 }));
  H.push(rbox(0.036, 0.014, 0.03, 0, 0.093, 0.062, wool, { seg: 1, r: 0.35, ao: 0 }));
  for (const s of [-1, 1]) { H.push(rbox(0.016, 0.009, 0.012, s * 0.024, 0.08, 0.058, face.clone().multiplyScalar(0.85), { seg: 1, r: 0.3, ao: 0, rz: s * -0.3 })); H.push(rbox(0.006, 0.007, 0.003, s * 0.01, 0.079, 0.0855, 0xf2ece0, { seg: 0, ao: 0 })); }
  parts.head = { geometry: merge(H), pivot: hp };
  // 四条腿（关节在髋）
  for (const [k, sx, sz] of [['legFL', 1, 1], ['legFR', -1, 1], ['legBL', 1, -1], ['legBR', -1, -1]]) {
    const x = sx * 0.016, z = sz * 0.028;
    parts[k] = { geometry: rbox(0.013, 0.044, 0.013, x, 0.022, z, leg, { seg: 1, r: 0.3, ao: 0.1 }), pivot: [x, 0.044, z] };
  }
  const geometry = mergeGeometries(Object.values(parts).map((p) => p.geometry), false); geometry.computeBoundingSphere();
  return { geometry, parts };
}

// ---------------- 兔子 ----------------
export function rabbit(seed = 1) {
  const fur = col([0xb59a7e, 0x9a8c80, 0xd8cbb8][seed % 3]), P = [];
  P.push(rbox(0.03, 0.026, 0.04, 0, 0.016, -0.004, fur, { seg: 2, r: 0.3, ao: 0.2 }));
  P.push(rbox(0.026, 0.024, 0.026, 0, 0.034, 0.016, fur, { seg: 2, r: 0.3, ao: 0.1 }));
  for (const s of [-1, 1]) {
    P.push(rbox(0.007, 0.026, 0.006, s * 0.006, 0.058, 0.012, fur, { seg: 1, r: 0.35, ao: 0, rz: s * -0.12, rx: -0.15 }));
    P.push(rbox(0.004, 0.018, 0.0035, s * 0.006, 0.058, 0.0155, 0xe8b4a8, { seg: 0, ao: 0, rz: s * -0.12, rx: -0.15 }));
    P.push(rbox(0.004, 0.005, 0.003, s * 0.008, 0.037, 0.0295, 0x1d1a1a, { seg: 0, ao: 0 }));
  }
  P.push(rbox(0.012, 0.012, 0.01, 0, 0.022, -0.026, 0xf4f0e8, { seg: 1, r: 0.4, ao: 0 }));
  return { geometry: merge(P) };
}

// ---------------- 体素树 ----------------
const LEAF = [0x4f8a3a, 0x5f9d40, 0x3f7530, 0x6fa846, 0x467f34].map(col), BARK = [0x6b5644, 0x5a4838, 0x75604c].map(col);
/** 体素树冠：在椭球里按格子放方块（只留表面），叶色深浅交错，加几颗果子 */
/** 只带指定几个面的方块（顺序 +x -x +y -y +z -z），非索引几何 */
function faceBox(s, keep) {
  const src = new THREE.BoxGeometry(s, s, s).toNonIndexed(), P = src.attributes.position, N = src.attributes.normal, UV = src.attributes.uv, pos = [], nor = [], uv = [];
  for (let f = 0; f < 6; f++) if (keep[f]) for (let v = f * 6; v < f * 6 + 6; v++) { pos.push(P.getX(v), P.getY(v), P.getZ(v)); nor.push(N.getX(v), N.getY(v), N.getZ(v)); uv.push(UV.getX(v), UV.getY(v)); }
  src.dispose();
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
function voxelBlob(R, cx, cy, cz, rx, ry, rz, v, out, { fruit = 0, pal = LEAF, top = 0.12 } = {}) {
  const nx = Math.ceil(rx / v), ny = Math.ceil(ry / v), nz = Math.ceil(rz / v), inside = (i, j, k) => {
    const x = i * v, y = j * v, z = k * v, e = (x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2;
    return e + NZ.n2(cx * 9 + i * 0.7 + k * 0.31, cz * 9 + j * 0.9 - k * 0.5) * 0.28 < 1;
  };
  for (let i = -nx; i <= nx; i++) for (let j = -ny; j <= ny; j++) for (let k = -nz; k <= nz; k++) {
    if (!inside(i, j, k)) continue;
    if (inside(i + 1, j, k) && inside(i - 1, j, k) && inside(i, j + 1, k) && inside(i, j - 1, k) && inside(i, j, k + 1) && inside(i, j, k - 1)) continue;   // 内部的方块看不见，不要
    const isFruit = fruit && R() < fruit && j <= 0;
    const c = isFruit ? col(R() < 0.5 ? 0xd9452e : 0xe8763a) : pal[Math.floor(R() * pal.length)].clone().multiplyScalar(0.92 + (j / ny) * top + R() * 0.06);
    const s = v * (isFruit ? 0.62 : 0.97);
    // 只留露在外面的面：挨着另一块叶子方块的那一面看不见，不画（树冠的三角形少一半左右）
    const keep = isFruit ? null : [!inside(i + 1, j, k), !inside(i - 1, j, k), !inside(i, j + 1, k), !inside(i, j - 1, k), !inside(i, j, k + 1), !inside(i, j, k - 1)];
    const g = keep ? faceBox(s, keep) : new THREE.BoxGeometry(s, s, s).toNonIndexed(); g.deleteAttribute('uv');
    paint(g, c, { ao: 0.12, y0: -s / 2, y1: s / 2 }); g.translate(cx + i * v + (isFruit ? 0 : (R() - 0.5) * v * 0.08), cy + j * v, cz + k * v + (isFruit ? v * 0.25 : 0));
    out.push(g);
  }
}
/** 体素阔叶树（高约 0.85，底部 y=0）：树干是几节错开的圆角方块，树冠是两三团体素 */
export function voxelTree(seed = 1, kind = 'green') {
  const R = rng(seed * 71 + 5), T = [], C = [], H = 0.85, lean = (R() - 0.5) * 0.04;
  let y = 0;
  for (let i = 0; i < 8; i++) { const w = 0.052 - i * 0.003, h = 0.062; T.push(rbox(w, h, w, lean * i * 0.6 + (R() - 0.5) * 0.006, y + h / 2, lean * i * 0.3 + (R() - 0.5) * 0.006, BARK[i % 3].clone().multiplyScalar(0.88 + R() * 0.18), { seg: 1, r: 0.12, ao: i ? 0.04 : 0.25 })); y += h * 0.97; }
  T.push(rbox(0.022, 0.022, 0.12, lean * 3, 0.38, 0.055, BARK[1], { seg: 1, r: 0.2, ao: 0.05, rx: -0.55 }));
  const pal = kind === 'autumn' ? [0xd88a2e, 0xc8702a, 0xe0a040, 0xb85a28].map(col) : kind === 'lime' ? [0x7fb04a, 0x8fbe52, 0x6a9e40].map(col) : kind === 'blossom' ? [0xe9a3bc, 0xf2b8cc, 0xd88aa8, 0xf6c8d8, 0xe094b0].map(col) : LEAF;
  voxelBlob(R, lean * 4, 0.6, 0, 0.28, 0.2, 0.27, 0.062, C, { fruit: kind === 'green' ? 0.05 : 0, pal });
  voxelBlob(R, lean * 4 + 0.16, 0.5, 0.08, 0.15, 0.12, 0.15, 0.062, C, { pal });
  voxelBlob(R, lean * 4 - 0.12, 0.72, -0.06, 0.16, 0.12, 0.15, 0.062, C, { pal });
  const trunk = merge(T), crown = merge(C);
  windAttr(trunk, 0); windAttr(crown, H);
  const g = mergeGeometries([trunk, crown], false); g.computeBoundingSphere();
  return g;
}
/** 体素松树：一层层收小的方形叶片 */
export function voxelConifer(seed = 1) {
  const R = rng(seed * 37 + 1), T = [], C = [], H = 0.9;
  T.push(rbox(0.06, 0.22, 0.06, 0, 0.11, 0, BARK[1], { seg: 1, r: 0.18, ao: 0.25 }));
  const v = 0.055, dark = [0x2f5a2a, 0x3a6a30, 0x2a5026, 0x41733a].map(col);
  for (let L = 0; L < 6; L++) {
    const r = Math.max(1, 4 - Math.floor(L * 0.7)), yy = 0.2 + L * 0.11;
    for (let i = -r; i <= r; i++) for (let k = -r; k <= r; k++) {
      if (i * i + k * k > r * r + 0.5 || (Math.abs(i) < r - 1 && Math.abs(k) < r - 1 && R() < 0.85)) continue;
      const g = new THREE.BoxGeometry(v * 0.97, v * 0.97, v * 0.97).toNonIndexed(); g.deleteAttribute('uv');
      paint(g, dark[Math.floor(R() * dark.length)].clone().multiplyScalar(0.9 + L * 0.03 + R() * 0.06), { ao: 0.1 }); g.translate(i * v, yy + (R() < 0.2 ? v * 0.5 : 0), k * v); C.push(g);
    }
  }
  const g2 = new THREE.BoxGeometry(v, v, v).toNonIndexed(); g2.deleteAttribute('uv'); paint(g2, dark[3], { ao: 0 }); g2.translate(0, 0.2 + 6 * 0.11, 0); C.push(g2);
  const trunk = merge(T), crown = merge(C); windAttr(trunk, 0); windAttr(crown, H);
  const g = mergeGeometries([trunk, crown], false); g.computeBoundingSphere();
  return g;
}
/** 体素灌木 */
export function voxelBush(seed = 1, kind = 'green') {
  const R = rng(seed * 13 + 9), C = [], pal = kind === 'lime' ? [0x7fb04a, 0x8fbe52, 0x6a9e40].map(col) : LEAF;
  voxelBlob(R, 0, 0.06, 0, 0.1, 0.07, 0.1, 0.03, C, { pal });
  const g = merge(C); windAttr(g, 0.3); return g;
}

// ================= 体素主题：其余动物、岩石、山峰、椰子树，以及远处用的简化树 =================
const box = (w, h, d, x, y, z, c, o = {}) => rbox(w, h, d, x, y, z, c, { seg: 1, r: 0.2, ...o });
/** 分部件的四足动物（和 fauna.js 的步态对得上：body / head / legFL / legFR / legBL / legBR） */
function quad({ body, head, legs, legC, hip, legH, legW }) {
  const parts = { body: { geometry: merge(body) }, head: { geometry: merge(head.parts), pivot: head.pivot } };
  for (const [k, sx, sz] of [['legFL', 1, 1], ['legFR', -1, 1], ['legBL', 1, -1], ['legBR', -1, -1]]) {
    const x = sx * legs[0], z = sz > 0 ? legs[1] : legs[2];
    parts[k] = { geometry: box(legW, legH, legW, x, hip - legH / 2, z, legC, { ao: 0.12 }), pivot: [x, hip, z] };
  }
  const geometry = mergeGeometries(Object.values(parts).map((p) => p.geometry), false); geometry.computeBoundingSphere();
  return { geometry, parts };
}
/** 鹿：浅棕方身子、白肚皮、白尾巴、小方鹿角（高约 0.17，和原来的鹿一样大） */
export function deer(seed = 1) {
  const fur = col(0xb0773f), light = col(0xf0e2c8), dark = col(0x3a2a20);
  const body = [rbox(0.042, 0.042, 0.11, 0, 0.096, 0, fur, { seg: 2, r: 0.2, ao: 0.2 }), box(0.036, 0.012, 0.08, 0, 0.074, 0, light, { ao: 0 }), box(0.014, 0.016, 0.01, 0, 0.11, -0.058, light, { ao: 0 })];
  for (const [x, z] of [[0.012, 0.03], [-0.012, -0.01], [0.006, -0.035]]) body.push(box(0.006, 0.006, 0.004, x, 0.118, z, light, { seg: 0, ao: 0 }));
  const hp = [0, 0.118, 0.05], H = [box(0.022, 0.05, 0.022, 0, 0.13, 0.054, fur), rbox(0.03, 0.03, 0.04, 0, 0.158, 0.068, fur, { seg: 2, r: 0.25, ao: 0.08 }), box(0.018, 0.014, 0.016, 0, 0.152, 0.092, light, { ao: 0 }), box(0.008, 0.007, 0.004, 0, 0.156, 0.1, dark, { seg: 0, ao: 0 })];
  for (const s of [-1, 1]) { H.push(box(0.014, 0.008, 0.006, s * 0.02, 0.17, 0.06, fur, { rz: s * -0.4, ao: 0 })); H.push(box(0.004, 0.006, 0.003, s * 0.009, 0.165, 0.088, dark, { seg: 0, ao: 0 })); H.push(box(0.005, 0.024, 0.005, s * 0.01, 0.184, 0.064, 0x8a6a48, { ao: 0 }), box(0.005, 0.012, 0.005, s * 0.016, 0.192, 0.072, 0x8a6a48, { ao: 0, rz: s * -0.6 })); }
  return quad({ body, head: { parts: H, pivot: hp }, legs: [0.013, 0.04, -0.044], legC: 0x8a5a30, hip: 0.08, legH: 0.08, legW: 0.011 });
}
/** 山羊：灰白方身子、短方角、小胡子 */
export function goat(seed = 1) {
  const fur = col(seed % 2 ? 0xe8e2d6 : 0xcfc6b8), dark = col(0x4a4038);
  const body = [rbox(0.04, 0.036, 0.08, 0, 0.068, 0, fur, { seg: 2, r: 0.22, ao: 0.2 }), box(0.012, 0.012, 0.01, 0, 0.084, -0.042, fur, { ao: 0 })];
  const hp = [0, 0.074, 0.036], H = [rbox(0.026, 0.028, 0.034, 0, 0.088, 0.05, fur, { seg: 2, r: 0.25, ao: 0.08 }), box(0.008, 0.012, 0.006, 0, 0.07, 0.062, fur.clone().multiplyScalar(0.85), { ao: 0 })];
  for (const s of [-1, 1]) { H.push(box(0.006, 0.02, 0.006, s * 0.008, 0.108, 0.044, dark, { rx: -0.5, ao: 0 })); H.push(box(0.004, 0.005, 0.003, s * 0.008, 0.094, 0.067, 0x1d1a1a, { seg: 0, ao: 0 })); H.push(box(0.012, 0.006, 0.006, s * 0.017, 0.094, 0.046, fur, { ao: 0, rz: s * -0.4 })); }
  return quad({ body, head: { parts: H, pivot: hp }, legs: [0.012, 0.03, -0.03], legC: 0x5a5048, hip: 0.056, legH: 0.056, legW: 0.01 });
}
/** 螃蟹：红方壳、两只大钳子、竖起来的小眼睛 */
export function crab(seed = 1) {
  const sh = col(0xd2492e), P = [rbox(0.03, 0.012, 0.022, 0, 0.01, 0.012, sh, { seg: 2, r: 0.3, ao: 0.2 })];
  for (const s of [-1, 1]) {
    P.push(box(0.012, 0.009, 0.01, s * 0.022, 0.012, 0.03, sh), box(0.004, 0.008, 0.004, s * 0.006, 0.02, 0.022, sh, { seg: 0, ao: 0 }), box(0.005, 0.005, 0.005, s * 0.006, 0.026, 0.022, 0x1d1a1a, { seg: 0, ao: 0 }));
    for (let i = 0; i < 3; i++) P.push(box(0.012, 0.003, 0.003, s * 0.02, 0.004, 0.006 + i * 0.008, sh.clone().multiplyScalar(0.8), { seg: 0, ao: 0, rz: s * 0.4 }));
  }
  return { geometry: merge(P) };
}
/** 野鸭：方身子、绿方头、黄嘴 */
export function duck(seed = 1) {
  const P = [rbox(0.02, 0.014, 0.034, 0, 0.002, -0.002, 0x8a7a68, { seg: 2, r: 0.3, ao: 0.15 }), box(0.016, 0.008, 0.012, 0, 0.008, -0.018, 0xe8e2d6, { ao: 0 }), rbox(0.014, 0.014, 0.014, 0, 0.016, 0.014, 0x2f6a3a, { seg: 1, r: 0.3, ao: 0.05 }), box(0.008, 0.004, 0.01, 0, 0.013, 0.025, 0xe8a83a, { seg: 0, ao: 0 }), box(0.016, 0.003, 0.003, 0, 0.009, 0.008, 0xf2efe6, { seg: 0, ao: 0 })];
  return { geometry: merge(P) };
}
/** 青蛙：扁方身子、凸出来的方眼睛 */
export function frog(seed = 1) {
  const g = col(0x5f9a3a), P = [rbox(0.026, 0.012, 0.024, 0, 0.007, 0, g, { seg: 2, r: 0.3, ao: 0.2 }), box(0.022, 0.003, 0.016, 0, 0.002, 0.004, 0xd8d4a0, { seg: 0, ao: 0 })];
  for (const s of [-1, 1]) { P.push(box(0.008, 0.008, 0.008, s * 0.007, 0.015, 0.008, g), box(0.004, 0.004, 0.002, s * 0.007, 0.016, 0.0125, 0x1d1a1a, { seg: 0, ao: 0 }), box(0.008, 0.006, 0.016, s * 0.016, 0.004, -0.006, g.clone().multiplyScalar(0.85))); }
  return { geometry: merge(P) };
}
// ---- 岩石与山峰 ----
const ROCK = [0x8a8a8e, 0x9a9ba0, 0x7d7c80, 0xa7a5a0].map(col), MOSS = [0x6f8f3a, 0x7fa043].map(col), SNOW = col(0xf2f4f6);
/** 网格上的一堆方块 → 只画露在外面的面（挨着别的方块的那面不画）。cells: [{ i, j, k, s, x, y, z, c }]；ground：最底层的底面也不画 */
function gridCubes(cells, ground = true) {
  const has = new Set(cells.map((q) => q.i + ',' + q.j + ',' + q.k)), at = (i, j, k) => has.has(i + ',' + j + ',' + k), out = [];
  for (const q of cells) {
    const keep = [!at(q.i + 1, q.j, q.k), !at(q.i - 1, q.j, q.k), !at(q.i, q.j + 1, q.k), !(at(q.i, q.j - 1, q.k) || (ground && q.j === 0)), !at(q.i, q.j, q.k + 1), !at(q.i, q.j, q.k - 1)];
    if (!keep.some(Boolean)) continue;
    const g = faceBox(q.s, keep); g.deleteAttribute('uv'); paint(g, q.c, { ao: 0.1, y0: -q.s / 2, y1: q.s / 2 }); g.translate(q.x, q.y, q.z); out.push(g);
  }
  return out;
}
function cube(s, x, y, z, c) { const g = new THREE.BoxGeometry(s, s, s).toNonIndexed(); g.deleteAttribute('uv'); paint(g, c, { ao: 0.1 }); g.translate(x, y, z); return g; }
/** 体素岩石（和原来的 boulder 同一尺度：宽约 2.4、高约 0.8，摆放时再缩放） */
export function voxelRock(seed = 1, tone = 0, mossy = 1) {
  const R = rng(seed * 41 + 3), P = [], v = 0.4;
  for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) {
    const d = Math.hypot(i * 0.9, k) + (R() - 0.5) * 0.8; if (d > 2.9) continue;
    const hgt = Math.max(1, Math.round((2.2 - d * 0.7) + R() * 0.8));
    for (let j = 0; j < hgt; j++) { const top = j === hgt - 1, c = top && mossy && R() < 0.5 ? MOSS[Math.floor(R() * 2)] : ROCK[(Math.floor(R() * 4) + tone) % 4]; P.push({ i, j, k, s: v * 0.98, x: i * v, y: j * v * 0.8 + v * 0.4, z: k * v, c: c.clone().multiplyScalar(0.92 + R() * 0.12) }); }
  }
  const g = merge(gridCubes(P)); g.scale(1, 0.85, 1); return g;
}
/** 体素山峰：一层层收小的岩石环，山腰有草，山顶积雪；顶面是平的，山羊能站 */
export function voxelPeak(seed = 1, r = 0.7, h = 1.5) {
  const R = rng(seed * 17 + 5), v = Math.max(0.09, Math.min(0.15, r / 6.5)), P = [], layers = Math.ceil(h / v);
  for (let L = 0; L < layers; L++) {
    const f = L / layers, rr = r * Math.pow(1 - f, 0.85) * (1 + Math.sin(L * 0.9 + seed) * 0.06), n = Math.ceil(rr / v);
    for (let i = -n; i <= n; i++) for (let k = -n; k <= n; k++) {
      const d = Math.hypot(i, k) * v, edge = rr + (R() - 0.5) * v * 0.8;
      if (d > edge || (d < edge - v * 1.6 && L < layers - 1)) continue;   // 只留外壳
      const c = f > 0.78 ? SNOW : f < 0.25 && R() < 0.4 ? MOSS[Math.floor(R() * 2)] : ROCK[Math.floor(R() * 4)];
      P.push({ i, j: L, k, s: v * 0.99, x: i * v, y: L * v + v / 2, z: k * v, c: c.clone().multiplyScalar(0.9 + R() * 0.14) });
    }
  }
  return merge(gridCubes(P));
}
/** 体素芦苇：几根深浅不同的细长方块茎（略斜）+ 两三个褐色蒲棒头 + 两片斜叶（和原来的芦苇差不多高） */
export function voxelReeds(seed = 1) {
  const R = rng(seed * 53 + 7), P = [], G = [0x6d8f3c, 0x7f9a45, 0x5f8f3a, 0x9bad52].map(col);
  const n = 7 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const a = R() * 6.28, r = Math.sqrt(R()) * 0.022, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.11 + R() * 0.07, tilt = (R() - 0.5) * 0.25;
    P.push(box(0.0055, h, 0.0055, x, h / 2, z, G[i % 4].clone().multiplyScalar(0.9 + R() * 0.2), { seg: 0, ao: 0.25, rz: tilt, rx: (R() - 0.5) * 0.2 }));
    if (i % 3 === 0) P.push(box(0.011, 0.028, 0.011, x + Math.sin(-tilt) * h * 0.95, h * 0.97, z, i % 2 ? 0x4b2d1b : 0x6c4529, { seg: 1, r: 0.3, ao: 0, rz: tilt }));
  }
  for (let i = 0; i < 2; i++) P.push(box(0.014, 0.07, 0.003, (i ? -1 : 1) * 0.012, 0.035, 0.004, G[2], { seg: 0, ao: 0.2, rz: (i ? 1 : -1) * 0.45 }));
  const g = merge(P); windAttr(g, 0.18); return g;
}
// ================= 体素主题：飞虫、小鸟（翅膀带 wing 权重，沿用飞虫的扇翅着色器；身体沿 z、翅膀沿 x 展开） =================
/** 把一组方块合成飞虫几何：wing 部件的顶点 wing = 1 */
function flyer(parts) {
  const list = parts.map(([w, h, d, x, y, z, c, wing, o = {}]) => { const g = box(w, h, d, x, y, z, c, { seg: 0, ao: 0.05, ...o }); const n = g.attributes.position.count; g.setAttribute('wing', new THREE.BufferAttribute(new Float32Array(n).fill(wing ? 1 : 0), 1)); return g; });
  return merge(list);
}
const BF = { swallowtail: [0xf2d24a, 0x2a2420, 0x3f6fc0], blue: [0x4f8fe0, 0x1d2a44, 0xbfe0ff], monarch: [0xe8862a, 0x2a2018, 0xf7f0e0], white: [0xf4f2ea, 0x6a6a6a, 0xf2d24a] };
/** 体素蝴蝶：细身子 + 前后两对方翅（主色、深色翅边、一点斑色） */
export function voxelButterfly(seed = 1, kind = 'swallowtail') {
  const [a, edge, spot] = BF[kind] || BF.swallowtail, P = [[0.006, 0.006, 0.03, 0, 0.01, 0, 0x2a2420, 0]];
  for (const s of [-1, 1]) {
    P.push([0.03, 0.002, 0.022, s * 0.018, 0.011, 0.007, a, 1], [0.03, 0.0021, 0.004, s * 0.018, 0.011, 0.019, edge, 1], [0.008, 0.0022, 0.008, s * 0.024, 0.011, 0.006, spot, 1]);
    P.push([0.022, 0.002, 0.016, s * 0.014, 0.0105, -0.011, a, 1], [0.006, 0.0021, 0.006, s * 0.02, 0.0105, -0.012, spot, 1]);
  }
  return flyer(P);
}
/** 体素蜜蜂：黄黑条纹的方身子 + 两片半透明白翅 */
export function voxelBee() {
  const P = [[0.012, 0.011, 0.007, 0, 0.012, 0.006, 0xf2c23a, 0], [0.0125, 0.0115, 0.004, 0, 0.012, 0.0, 0x2a2420, 0], [0.012, 0.011, 0.006, 0, 0.012, -0.006, 0xf2c23a, 0], [0.008, 0.008, 0.006, 0, 0.013, 0.012, 0x2a2420, 0]];
  for (const s of [-1, 1]) P.push([0.014, 0.0015, 0.009, s * 0.01, 0.019, 0.002, 0xeef4f8, 1]);
  return flyer(P);
}
/** 体素蜻蜓：细长蓝绿身子 + 两对长窄翅 */
export function voxelDragonfly() {
  const P = [[0.005, 0.005, 0.05, 0, 0.01, -0.008, 0x3fa0b8, 0], [0.009, 0.008, 0.009, 0, 0.011, 0.02, 0x2f7a8a, 0]];
  for (const s of [-1, 1]) P.push([0.038, 0.0015, 0.008, s * 0.022, 0.012, 0.01, 0xdfeff4, 1], [0.034, 0.0015, 0.007, s * 0.02, 0.012, 0.0, 0xdfeff4, 1]);
  return flyer(P);
}
const SB = { robin: [0x8a6a4a, 0xe07a3a], tit: [0x5a8a5a, 0xf2d24a], finch: [0x9a7a5a, 0xd85a4a] };
/** 体素小鸟：方身子、浅色胸口、方头、小尖嘴、两片翅膀、短尾 */
export function voxelSongbird(seed = 1, kind = 'robin') {
  const [body, chest] = SB[kind] || SB.robin, P = [[0.026, 0.022, 0.034, 0, 0.022, 0, body, 0], [0.02, 0.014, 0.02, 0, 0.018, 0.008, chest, 0], [0.02, 0.02, 0.02, 0, 0.037, 0.016, body, 0], [0.006, 0.005, 0.01, 0, 0.035, 0.03, 0xe8b84a, 0], [0.016, 0.004, 0.016, 0, 0.026, -0.022, body, 0]];
  for (const s of [-1, 1]) P.push([0.026, 0.004, 0.02, s * 0.02, 0.026, 0, body, 1], [0.004, 0.004, 0.003, s * 0.007, 0.04, 0.026, 0x1d1a1a, 0]);
  return flyer(P);
}

// ================= 体素主题：小装饰（菜苗、睡莲、树桩、海草堆、浮木、贝壳） =================
/** 体素睡莲：扁方叶片（缺一角）+ 可选一朵方花 */
export function voxelLily(seed = 1, flower = false) {
  const R = rng(seed * 19 + 3), P = [], G = [0x4f8a3a, 0x5f9d40, 0x3f7530].map(col);
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) { if (i === 1 && k === 1) continue; P.push(box(0.045, 0.006, 0.045, i * 0.045, 0.003, k * 0.045, G[Math.floor(R() * 3)], { seg: 0, ao: 0 })); }
  if (flower) { P.push(box(0.04, 0.02, 0.04, 0, 0.016, 0, 0xf4b8c8, { seg: 1, r: 0.3, ao: 0.1 }), box(0.016, 0.012, 0.016, 0, 0.03, 0, 0xf2d24a, { seg: 0, ao: 0 })); }
  return merge(P);
}
/** 体素树桩：两节圆角树皮块 + 浅色年轮顶 */
export function voxelStump() { return merge([rbox(0.064, 0.036, 0.064, 0, 0.018, 0, BARK[0], { seg: 1, r: 0.2, ao: 0.25 }), rbox(0.056, 0.012, 0.056, 0, 0.042, 0, 0xd9a66b, { seg: 0, ao: 0 })]); }
/** 体素海草堆 / 浮木 / 贝壳（沙滩上的小东西） */
export function voxelWrack(seed = 1) { const R = rng(seed * 7 + 1), P = []; for (let i = 0; i < 6; i++) P.push(box(0.03 + R() * 0.03, 0.006, 0.012, (R() - 0.5) * 0.08, 0.003, (R() - 0.5) * 0.06, [0x4a5a2a, 0x5a4a2a, 0x3f4f2a][i % 3], { seg: 0, ao: 0, ry: R() * 3 })); return merge(P); }
export function voxelDrift(seed = 1) { const R = rng(seed * 11 + 5); return merge([rbox(0.16, 0.022, 0.024, 0, 0.011, 0, 0xb8a588, { seg: 1, r: 0.3, ao: 0.2, ry: R() * 3 }), box(0.05, 0.014, 0.014, 0.05, 0.02, 0.02, 0xa8957a, { seg: 0, ao: 0, ry: R() * 3 })]); }
export function voxelShells(seed = 1) { const R = rng(seed * 13 + 9), P = []; for (let i = 0; i < 4; i++) P.push(box(0.012, 0.007, 0.012, (R() - 0.5) * 0.08, 0.0035, (R() - 0.5) * 0.08, [0xf4e6d8, 0xf0c0a8, 0xe8d4c0, 0xf8f0e4][i], { seg: 1, r: 0.35, ao: 0 })); return merge(P); }

/** 体素椰子树：弯弯的方块树干 + 一圈下垂的方块叶子 */
export function voxelPalm(seed = 1, s = 1) {
  const R = rng(seed * 29 + 1), T = [], C = [], H = 0.9 * s; let x = 0, y = 0;
  for (let i = 0; i < 12; i++) { const w = 0.045 - i * 0.0015; T.push(rbox(w, 0.07, w, x, y + 0.035, 0, BARK[i % 2 ? 0 : 2].clone().multiplyScalar(1.1), { seg: 1, r: 0.15, ao: 0.04 })); y += 0.068 * s; x += 0.006 * i * s; }
  for (let a = 0; a < 7; a++) { const ang = (a / 7) * Math.PI * 2 + R() * 0.3; for (let j = 1; j <= 4; j++) { const d = j * 0.055, yy = y - j * j * 0.012; C.push(cube(0.05, x + Math.cos(ang) * d, yy, Math.sin(ang) * d, LEAF[(a + j) % 5])); } }
  C.push(cube(0.05, x, y + 0.02, 0, LEAF[1]));
  const trunk = merge(T), crown = merge(C); windAttr(trunk, 0); windAttr(crown, H);
  const g = mergeGeometries([trunk, crown], false); g.computeBoundingSphere(); return g;
}
// ---- 远处用的简化树（两套主题都有）：几十个三角面，远看轮廓和颜色一样 ----
function lowPaint(g, c, H) { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); paint(g, c, { ao: 0.25 }); windAttr(g, H); return g; }
export function lowConifer(voxel = false) {
  const P = [lowPaint(new THREE.CylinderGeometry(0.03, 0.04, 0.2, 5).translate(0, 0.1, 0), 0x4f3423, 0)];
  if (voxel) for (let i = 0; i < 4; i++) P.push(lowPaint(new THREE.BoxGeometry(0.42 - i * 0.09, 0.12, 0.42 - i * 0.09).translate(0, 0.26 + i * 0.15, 0), 0x2f5a2a, 1));
  else for (let i = 0; i < 3; i++) P.push(lowPaint(new THREE.ConeGeometry(0.3 - i * 0.07, 0.36, 7).translate(0, 0.32 + i * 0.2, 0), [0x234f33, 0x2b5e3c, 0x3a7046][i], 1));
  const g = mergeGeometries(P, false); g.computeBoundingSphere(); return g;
}
export function lowBroad(kind = 'green', voxel = false) {
  const c = { green: 0x4f8a34, lime: 0x76aa3c, autumn: 0xc8782c, blossom: 0xe9a3bc }[kind] || 0x4f8a34;
  const crown = voxel ? new THREE.BoxGeometry(0.5, 0.36, 0.5).translate(0, 0.62, 0) : new THREE.IcosahedronGeometry(0.32, 0).scale(1, 0.85, 1).translate(0, 0.64, 0);
  const g = mergeGeometries([lowPaint(new THREE.CylinderGeometry(0.025, 0.04, 0.5, 5).translate(0, 0.25, 0), 0x5b3d29, 0), lowPaint(crown, c, 0.85)], false); g.computeBoundingSphere(); return g;
}

// ================= 体素主题：建筑和道具（和 props.js 同名、同尺寸、同锚点；换成大小不同、颜色不同的方块） =================
const WD = [0x8a5a3c, 0x7a4e33, 0x96643f, 0x84553a].map(col), WDK = col(0x5e3b25), CUT = col(0xd9a66b), DOORW = col(0x6b4026);
const STRAW = [0xc9a15a, 0xd8b56a, 0xb8904a, 0xe3c27e].map(col), STONE = [0x8d8a85, 0x9a9792, 0x7d7a76, 0xa5a19a].map(col);
const PLASTER = [0xeee6d6, 0xe6ddca, 0xf2ece0].map(col), RED = [0xb8432f, 0xa83a28, 0xc24e36].map(col), SLATE = [0x51627a, 0x5a6b84, 0x485870].map(col);
const GLASS = col(0x34404c), LAMPC = col(0xffe08a), IRON = col(0x2f3438), CANVAS = [0xe9dfc8, 0xf1e8d4, 0xded2b8].map(col);
/** 从一组颜色里挑一个，再上下浮一点（同一种材料的方块深浅不一） */
const tone = (R, a, k = 0.12) => a[Math.floor(R() * a.length)].clone().multiplyScalar(1 - k / 2 + R() * k);
/** 平板方块（不倒角，少三角面）：小零件、木板、窗、门 */
const pl = (w, h, d, x, y, z, c, o = {}) => rbox(w, h, d, x, y, z, c, { seg: 0, ao: 0.08, ...o });
/** 四坡阶梯屋顶：一层层收小的板 */
function stepRoof(P, R, pal, { w, d, y, h = 0.06, n = 5, dw = 0.12, dd = dw, z = 0, seg = 1 }) {
  for (let L = 0; L < n; L++) P.push(rbox(Math.max(0.04, w - L * dw), h, Math.max(0.04, d - L * dd), 0, y + L * h + h / 2, z, tone(R, pal, 0.1), { seg, r: 0.18, ao: 0.28 }));
  return y + n * h;
}

/** 茅屋：石台基 + 竖木板墙（深色角柱）+ 木门、侧窗 + 一层层收小的茅草顶 + 石烟囱 */
export function vStrawHut(seed = 1) {
  const R = rng(seed * 61 + 3), P = [], W = 0.46, D = 0.42, y0 = 0.05, WH = 0.27;
  P.push(rbox(0.54, y0, 0.5, 0, y0 / 2, 0, STONE[2], { seg: 1, r: 0.2, ao: 0.3 }));
  P.push(rbox(W, WH, D, 0, y0 + WH / 2, 0, WD[0], { seg: 1, r: 0.05, ao: 0.22 }));
  // 墙面竖木板：深浅交错
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) P.push(pl(W / 6 - 0.004, WH - 0.02, 0.008, -W / 2 + (i + 0.5) * (W / 6), y0 + WH / 2, s * (D / 2 + 0.003), tone(R, WD, 0.2), { ao: 0.2 }));
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) P.push(pl(0.008, WH - 0.02, D / 5 - 0.004, s * (W / 2 + 0.003), y0 + WH / 2, -D / 2 + (i + 0.5) * (D / 5), tone(R, WD, 0.2), { ao: 0.2 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(pl(0.05, WH + 0.03, 0.05, sx * W / 2, y0 + WH / 2 + 0.01, sz * D / 2, WDK, { ao: 0.25 }));
  P.push(pl(W + 0.04, 0.035, D + 0.04, 0, y0 + WH, 0, WDK, { ao: 0 }));
  // 门 + 门框 + 门把；门前一块踏石
  P.push(pl(0.14, 0.21, 0.01, 0, y0 + 0.105, D / 2 + 0.009, WDK, { ao: 0 }), pl(0.1, 0.18, 0.012, 0, y0 + 0.09, D / 2 + 0.014, DOORW, { ao: 0.15 }), pl(0.012, 0.012, 0.01, 0.03, y0 + 0.09, D / 2 + 0.022, 0xd9b44a, { ao: 0 }));
  P.push(pl(0.16, 0.025, 0.07, 0, 0.0125, D / 2 + 0.06, STONE[1], { ao: 0.2 }));
  // 两侧小窗：深色框 + 玻璃 + 浅色窗台
  for (const s of [-1, 1]) P.push(pl(0.012, 0.1, 0.11, s * (W / 2 + 0.008), y0 + 0.16, 0, WDK, { ao: 0 }), pl(0.012, 0.072, 0.082, s * (W / 2 + 0.012), y0 + 0.16, 0, GLASS, { ao: 0 }), pl(0.024, 0.014, 0.13, s * (W / 2 + 0.012), y0 + 0.105, 0, CUT, { ao: 0 }));
  // 茅草顶：檐口一圈深色，往上一层层收小，表面撒几簇亮一点的草
  const ry = y0 + WH + 0.02;
  P.push(pl(0.68, 0.022, 0.62, 0, ry, 0, STRAW[2].clone().multiplyScalar(0.72), { ao: 0 }));
  const top = stepRoof(P, R, STRAW, { w: 0.66, d: 0.6, y: ry, h: 0.065, n: 5, dw: 0.13, dd: 0.12 });
  for (let i = 0; i < 10; i++) { const L = Math.floor(R() * 4), hw = (0.66 - L * 0.13) / 2, hd = (0.6 - L * 0.12) / 2, side = R() < 0.5; P.push(rbox(0.035, 0.022, 0.035, side ? (R() < 0.5 ? -1 : 1) * hw * 0.92 : (R() - 0.5) * hw * 1.6, ry + L * 0.065 + 0.07, side ? (R() - 0.5) * hd * 1.6 : (R() < 0.5 ? -1 : 1) * hd * 0.92, STRAW[3], { seg: 1, r: 0.3, ao: 0 })); }
  P.push(rbox(0.12, 0.035, 0.12, 0, top + 0.012, 0, STRAW[2].clone().multiplyScalar(0.85), { seg: 1, r: 0.3, ao: 0.1 }));
  P.push(pl(0.07, 0.2, 0.07, 0.15, top - 0.06, -0.13, STONE[0], { ao: 0.2 }), pl(0.09, 0.025, 0.09, 0.15, top + 0.05, -0.13, STONE[2], { ao: 0 }));
  return { geometry: merge(P), anchors: { door: [0, 0, 0.29] } };
}
/** 营火：一圈大小不一的石头 + 炭灰 + 四根斜靠成尖顶的方木 + 几颗火星 */
export function vCampfire(seed = 1) {
  const R = rng(seed * 43 + 1), P = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + R() * 0.2, s = 0.05 + R() * 0.025; P.push(rbox(s, 0.035 + R() * 0.02, s * 1.1, Math.cos(a) * 0.13, 0.02, Math.sin(a) * 0.13, tone(R, STONE, 0.2), { seg: 1, r: 0.3, ao: 0.3, ry: -a })); }
  P.push(pl(0.17, 0.012, 0.17, 0, 0.006, 0, 0x2a2522, { ao: 0 }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4, g = rbox(0.028, 0.15, 0.028, 0, 0, 0, tone(R, WD, 0.2), { seg: 1, r: 0.2, ao: 0.3 });
    g.rotateZ(0.55); g.translate(0.05, 0.065, 0); g.rotateY(-a); P.push(g);
  }
  for (let i = 0; i < 6; i++) P.push(pl(0.016 + R() * 0.01, 0.014, 0.016 + R() * 0.01, (R() - 0.5) * 0.07, 0.018, (R() - 0.5) * 0.07, [0xff8a3a, 0xe8502a, 0xffc04a][i % 3], { ao: 0 }));
  return { geometry: merge(P), anchors: { fire: [0, 0.02, 0] } };
}
/** 柴堆：三层方木（截面是浅色年轮）+ 两头的木桩 */
export function vWoodPile(seed = 1) {
  const R = rng(seed * 29 + 7), P = [];
  [[3, 0], [2, 1], [1, 2]].forEach(([n, r]) => {
    for (let j = 0; j < n; j++) {
      const y = 0.028 + r * 0.047, z = (j - (n - 1) / 2) * 0.068, x = (R() - 0.5) * 0.02, L = 0.27 + R() * 0.03;
      P.push(rbox(L, 0.05, 0.05, x, y, z, tone(R, WD, 0.2), { seg: 1, r: 0.25, ao: 0.18 }));
      for (const s of [-1, 1]) P.push(pl(0.006, 0.04, 0.04, x + s * (L / 2 + 0.002), y, z, CUT.clone().multiplyScalar(0.9 + R() * 0.15), { ao: 0 }));
    }
  });
  for (const s of [-1, 1]) for (const t of [-1, 1]) P.push(pl(0.022, 0.15, 0.022, s * 0.16, 0.075, t * 0.075, WDK, { ao: 0.2 }));
  return { geometry: merge(P), anchors: {} };
}
/** 原木凳：一根横放的方木 + 两头浅色截面 + 两块垫石 */
export function vLogSeat(seed = 1) {
  const R = rng(seed * 17 + 5), P = [pl(0.07, 0.03, 0.07, -0.1, 0.015, 0, STONE[2], { ao: 0.2 }), pl(0.07, 0.03, 0.07, 0.1, 0.015, 0, STONE[0], { ao: 0.2 })];
  P.push(rbox(0.3, 0.085, 0.085, 0, 0.072, 0, tone(R, WD, 0.15), { seg: 1, r: 0.25, ao: 0.2 }), pl(0.22, 0.008, 0.06, 0, 0.115, 0, CUT.clone().multiplyScalar(0.85), { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.006, 0.07, 0.07, s * 0.152, 0.072, 0, CUT, { ao: 0 }));
  return { geometry: merge(P), anchors: {} };
}
/** 篱笆：四根带帽的方桩 + 两道横木（每段深浅、高低略有不同） */
export function vFence(seed = 1) {
  const R = rng(seed * 23 + 9), P = [], X = [-0.39, -0.13, 0.13, 0.39];
  for (const x of X) P.push(rbox(0.045, 0.2, 0.045, x, 0.1, 0, tone(R, WD, 0.2), { seg: 1, r: 0.2, ao: 0.28 }), pl(0.056, 0.016, 0.056, x, 0.206, 0, WDK, { ao: 0 }));
  for (const y of [0.075, 0.15]) for (let i = 0; i < 3; i++) P.push(pl(0.27, 0.03, 0.022, (X[i] + X[i + 1]) / 2, y + (R() - 0.5) * 0.01, 0.026, tone(R, WD, 0.22), { ao: 0.1 }));
  return { geometry: merge(P), anchors: {} };
}
/** 路牌：方木杆 + 两块指向不同方向的箭头牌（牌上几道深色“字”） */
export function vSignpost(seed = 1) {
  const R = rng(seed * 31 + 3), P = [rbox(0.075, 0.03, 0.075, 0, 0.015, 0, STONE[1], { seg: 1, r: 0.25, ao: 0.25 }), rbox(0.036, 0.4, 0.036, 0, 0.2, 0, WD[1], { seg: 1, r: 0.15, ao: 0.25 }), pl(0.046, 0.02, 0.046, 0, 0.405, 0, WDK, { ao: 0 })];
  [[0.33, 0.5, 0xe9dfc8], [0.25, -1.0, 0xc8a070]].forEach(([y, a, c]) => {
    const B = [pl(0.14, 0.046, 0.016, 0.085, y, 0.026, c, { ao: 0.1 }), pl(0.026, 0.034, 0.016, 0.168, y, 0.026, c, { ao: 0 }), pl(0.014, 0.018, 0.016, 0.188, y, 0.026, c, { ao: 0 })];
    for (let i = 0; i < 2; i++) B.push(pl(0.05 + R() * 0.04, 0.006, 0.004, 0.08, y + (i ? -0.009 : 0.009), 0.036, 0x4a3a2e, { ao: 0 }));
    for (const g of B) { g.rotateY(a); P.push(g); }
  });
  return { geometry: merge(P), anchors: {} };
}
/** 小木船（原点在水线，船头朝 +z）：一节节木船身，越往船头越窄、越翘；彩色船舷、两条横坐板、两支桨 */
export function vRowBoat(seed = 1) {
  const R = rng(seed * 37 + 11), P = [], rim = seed % 2 ? RED[0] : col(0x4f7fb0);
  const SEC = [[-0.24, 0.092], [-0.18, 0.116], [-0.12, 0.128], [-0.06, 0.132], [0, 0.13], [0.06, 0.122], [0.12, 0.104], [0.18, 0.076], [0.232, 0.042]];
  for (const [z, hw] of SEC) {
    const up = Math.max(0, z - 0.08) * 0.32, c = tone(R, WD, 0.14);
    P.push(pl(Math.max(0.03, hw * 2 - 0.03), 0.02, 0.06, 0, -0.042 + Math.max(0, z - 0.12) * 0.35, z, c.clone().multiplyScalar(0.8), { ao: 0 }));
    for (const s of [-1, 1]) P.push(pl(0.022, 0.1, 0.06, s * (hw - 0.011), 0.008 + up, z, c, { ao: 0.25 }), pl(0.026, 0.016, 0.06, s * (hw - 0.011), 0.066 + up, z, rim, { ao: 0 }));
  }
  P.push(pl(0.19, 0.1, 0.02, 0, 0.01, -0.272, tone(R, WD), { ao: 0.25 }), pl(0.2, 0.016, 0.024, 0, 0.066, -0.272, rim, { ao: 0 }));
  P.push(pl(0.03, 0.13, 0.03, 0, 0.045, 0.262, WDK, { ao: 0.1 }));
  P.push(pl(0.17, 0.01, 0.4, 0, -0.026, -0.01, WD[2].clone().multiplyScalar(1.1), { ao: 0 }));
  P.push(pl(0.24, 0.016, 0.05, 0, 0.036, -0.08, CUT, { ao: 0.1 }), pl(0.22, 0.016, 0.05, 0, 0.036, 0.08, CUT, { ao: 0.1 }));
  for (const s of [-1, 1]) P.push(pl(0.3, 0.012, 0.012, s * 0.13, 0.062, -0.02, CUT.clone().multiplyScalar(0.92), { ao: 0 }), pl(0.07, 0.006, 0.036, s * 0.25, 0.05, -0.02, WD[2], { ao: 0 }));
  return { geometry: merge(P), anchors: {} };
}
/** 浮标：红白相间的方块段 + 顶上一盏小灯 */
export function vBuoy() {
  return merge([pl(0.1, 0.04, 0.1, 0, -0.04, 0, RED[0], { ao: 0.2 }), rbox(0.088, 0.04, 0.088, 0, 0, 0, 0xf2efe8, { seg: 1, r: 0.2, ao: 0.1 }), rbox(0.076, 0.04, 0.076, 0, 0.04, 0, RED[1], { seg: 1, r: 0.2, ao: 0.1 }), pl(0.02, 0.03, 0.02, 0, 0.075, 0, IRON, { ao: 0 }), pl(0.032, 0.03, 0.032, 0, 0.1, 0, LAMPC, { ao: 0 })]);
}
/** 物资木箱 */
export function vSupplyCrate(seed = 1) {
  const R = rng(seed * 13 + 1), P = [pl(0.15, 0.14, 0.15, 0, 0.03, 0, tone(R, WD), { ao: 0.2 })];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(pl(0.022, 0.15, 0.022, sx * 0.072, 0.03, sz * 0.072, WDK, { ao: 0 }));
  for (const y of [-0.035, 0.095]) P.push(pl(0.158, 0.02, 0.158, 0, y, 0, WDK, { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.02, 0.17, 0.006, 0, 0.03, s * 0.077, CUT, { ao: 0, rz: 0.78 }));
  return { geometry: merge(P), anchors: {} };
}
/** 灯塔：岩石底座 + 红白相间、逐段收小的方塔 + 观景台栏杆 + 发光的灯室 + 阶梯红顶；塔前一间白墙红顶的守塔小屋 */
export function vLighthouse(seed = 1) {
  const R = rng(seed * 53 + 17), P = [], cells = [], v = 0.11;
  for (let i = -3; i <= 3; i++) for (let k = -3; k <= 3; k++) {
    const d = Math.hypot(i, k) + (R() - 0.5) * 0.6; if (d > 3.4) continue;
    cells.push({ i, j: 0, k, s: v * 0.99, x: i * v, y: v / 2, z: k * v, c: (R() < 0.18 ? MOSS[Math.floor(R() * 2)] : ROCK[Math.floor(R() * 4)]).clone().multiplyScalar(0.9 + R() * 0.14) });
  }
  P.push(...gridCubes(cells));
  let y = v;
  for (let k = 0; k < 9; k++) {
    const w = 0.36 - k * 0.012, h = 0.16, red = Math.floor(k / 2) % 2 === 1;
    P.push(rbox(w, h, w, 0, y + h / 2, 0, tone(R, red ? RED : PLASTER, 0.08), { seg: 1, r: 0.06, ao: k ? 0.1 : 0.3 }));
    if (k && red !== (Math.floor((k - 1) / 2) % 2 === 1)) P.push(pl(w + 0.02, 0.018, w + 0.02, 0, y, 0, STONE[2], { ao: 0 }));
    if (k === 2 || k === 5) P.push(pl(0.045, 0.065, 0.01, 0, y + h / 2, w / 2 + 0.004, GLASS, { ao: 0 }));
    if (k === 4 || k === 7) for (const s of [-1, 1]) P.push(pl(0.01, 0.065, 0.045, s * (w / 2 + 0.004), y + h / 2, 0, GLASS, { ao: 0 }));
    y += h;
  }
  // 观景台：平台 + 栏杆柱 + 一圈扶手
  P.push(pl(0.46, 0.04, 0.46, 0, y + 0.02, 0, STONE[2], { ao: 0.2 })); y += 0.04;
  for (const a of [-1, 0, 1]) for (const s of [-1, 1]) P.push(pl(0.014, 0.06, 0.014, a * 0.215, y + 0.03, s * 0.215, IRON, { ao: 0 }), pl(0.014, 0.06, 0.014, s * 0.215, y + 0.03, a * 0.215, IRON, { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.44, 0.012, 0.012, 0, y + 0.06, s * 0.215, IRON, { ao: 0 }), pl(0.012, 0.012, 0.44, s * 0.215, y + 0.06, 0, IRON, { ao: 0 }));
  // 灯室：亮黄方块 + 四根深色角柱；阶梯红顶 + 金色尖
  const lampY = y + 0.085;
  P.push(rbox(0.19, 0.16, 0.19, 0, lampY, 0, LAMPC, { seg: 1, r: 0.1, ao: 0 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(pl(0.022, 0.17, 0.022, sx * 0.1, lampY, sz * 0.1, IRON, { ao: 0 }));
  const top = stepRoof(P, R, RED, { w: 0.3, d: 0.3, y: y + 0.17, h: 0.05, n: 3, dw: 0.09 });
  P.push(pl(0.04, 0.05, 0.04, 0, top + 0.025, 0, IRON, { ao: 0 }), pl(0.03, 0.03, 0.03, 0, top + 0.065, 0, 0xd9b44a, { ao: 0 }));
  // 守塔小屋
  const hz = 0.3;
  P.push(rbox(0.3, 0.2, 0.18, 0, v + 0.1, hz, PLASTER[0], { seg: 1, r: 0.08, ao: 0.25 }));
  stepRoof(P, R, RED, { w: 0.34, d: 0.22, y: v + 0.2, h: 0.04, n: 3, dw: 0.09, dd: 0.06, z: hz });
  P.push(pl(0.1, 0.15, 0.01, 0, v + 0.075, hz + 0.093, WDK, { ao: 0 }), pl(0.075, 0.13, 0.012, 0, v + 0.065, hz + 0.097, 0x4f6f9a, { ao: 0.15 }));
  for (const s of [-1, 1]) P.push(pl(0.05, 0.05, 0.01, s * 0.09, v + 0.12, hz + 0.093, GLASS, { ao: 0 }));
  P.push(pl(0.12, 0.03, 0.06, 0, v + 0.015, hz + 0.12, STONE[1], { ao: 0.2 }));
  return { geometry: merge(P), anchors: { lamp: [0, lampY, 0], door: [0, 0, 0.46] } };
}
/** 风车：石台 + 白墙深色木柱的方塔（逐段收小）+ 阶梯红顶 + 伸出的木轴；风叶单独成件（四片方格帆） */
export function vWindmill(seed = 1) {
  const R = rng(seed * 71 + 13), P = [], HUB = [0, 1.05, 0.44];
  P.push(rbox(0.74, 0.08, 0.74, 0, 0.04, 0, STONE[2], { seg: 1, r: 0.15, ao: 0.3 }));
  let y = 0.08;
  for (let k = 0; k < 6; k++) {
    const w = 0.6 - k * 0.03, h = 0.14;
    P.push(rbox(w, h, w, 0, y + h / 2, 0, tone(R, PLASTER, 0.06), { seg: 1, r: 0.04, ao: k ? 0.08 : 0.3 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(pl(0.04, h, 0.04, sx * w / 2, y + h / 2, sz * w / 2, WDK, { ao: 0.1 }));
    if (k === 2 || k === 4) P.push(pl(w + 0.012, 0.024, w + 0.012, 0, y, 0, WDK, { ao: 0 }));
    y += h;
  }
  P.push(pl(0.16, 0.23, 0.01, 0, 0.08 + 0.115, 0.3 + 0.004, WDK, { ao: 0 }), pl(0.12, 0.2, 0.012, 0, 0.08 + 0.1, 0.3 + 0.009, DOORW, { ao: 0.15 }));
  P.push(pl(0.09, 0.09, 0.01, 0, 0.58, 0.27 + 0.004, WDK, { ao: 0 }), pl(0.065, 0.065, 0.012, 0, 0.58, 0.27 + 0.008, GLASS, { ao: 0 }), pl(0.11, 0.014, 0.03, 0, 0.53, 0.28, CUT, { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.01, 0.07, 0.06, s * (0.255 + 0.004), 0.72, 0, GLASS, { ao: 0 }));
  const top = stepRoof(P, R, RED, { w: 0.56, d: 0.6, y, h: 0.065, n: 5, dw: 0.1, z: 0.02 });
  P.push(pl(0.03, 0.07, 0.03, 0, top + 0.035, 0.02, WDK, { ao: 0 }));
  P.push(pl(0.05, 0.05, 0.2, HUB[0], HUB[1], HUB[2] - 0.1, WDK, { ao: 0 }));
  // 风叶：轮毂 + 四支桨臂，每支一片帆布 + 几道横格木条（世界坐标，绕 pivot 转）
  const S = [rbox(0.085, 0.085, 0.06, 0, 0, 0, WDK, { seg: 1, r: 0.2, ao: 0 })];
  for (let a = 0; a < 4; a++) {
    const A = [pl(0.03, 0.5, 0.024, 0, 0.29, 0, WDK, { ao: 0 }), pl(0.13, 0.36, 0.008, 0.075, 0.34, -0.012, tone(R, CANVAS, 0.08), { ao: 0 }), pl(0.012, 0.37, 0.014, 0.143, 0.34, 0.002, WD[0], { ao: 0 })];
    for (let i = 0; i < 4; i++) A.push(pl(0.15, 0.012, 0.014, 0.07, 0.18 + i * 0.106, 0.002, WD[0], { ao: 0 }));
    const g = merge(A); g.rotateZ(a * Math.PI / 2 + 0.3); S.push(g);
  }
  const sails = merge(S); sails.translate(HUB[0], HUB[1], HUB[2]); sails.computeBoundingBox();
  return { geometry: merge(P), anchors: { door: [0, 0, 0.46], hub: HUB }, parts: { sails: { geometry: sails, pivot: HUB } } };
}
/** 钟楼：石块砌的方塔（转角石浅一点）+ 木门、窄窗 + 四根石柱的开敞钟室 + 阶梯石板顶；铜钟单独成件（会摆） */
export function vBellTower(seed = 1) {
  const R = rng(seed * 47 + 19), P = [], cells = [], v = 0.1, PV = [0, 1.125, 0];
  for (let j = 0; j < 9; j++) for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) {
    const corner = Math.abs(i) === 2 && Math.abs(k) === 2, c = corner ? STONE[3] : j < 2 && R() < 0.15 ? MOSS[0] : STONE[Math.floor(R() * 3)];
    cells.push({ i, j, k, s: v, x: i * v, y: j * v + v / 2, z: k * v, c: c.clone().multiplyScalar(0.9 + R() * 0.14) });
  }
  P.push(...gridCubes(cells));
  const F = 0.25;
  P.push(pl(0.12, 0.22, 0.01, 0, 0.11, F + 0.004, WDK, { ao: 0 }), pl(0.09, 0.19, 0.012, 0, 0.095, F + 0.008, DOORW, { ao: 0.15 }));
  P.push(pl(0.03, 0.1, 0.01, 0, 0.56, F + 0.004, GLASS, { ao: 0 }));
  for (const s of [-1, 1]) P.push(pl(0.01, 0.1, 0.03, s * (F + 0.004), 0.66, 0, GLASS, { ao: 0 }));
  P.push(pl(0.56, 0.04, 0.56, 0, 0.92, 0, STONE[2], { ao: 0.2 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.push(rbox(0.1, 0.3, 0.1, sx * 0.2, 1.09, sz * 0.2, tone(R, STONE, 0.1), { seg: 1, r: 0.12, ao: 0.15 }));
  for (const s of [-1, 1]) P.push(pl(0.5, 0.05, 0.1, 0, 1.215, s * 0.2, STONE[1], { ao: 0.1 }), pl(0.1, 0.05, 0.5, s * 0.2, 1.215, 0, STONE[1], { ao: 0.1 }));
  P.push(pl(0.42, 0.03, 0.04, 0, 1.165, 0, WDK, { ao: 0 }));
  P.push(pl(0.56, 0.04, 0.56, 0, 1.26, 0, STONE[2], { ao: 0.1 }));
  const top = stepRoof(P, R, SLATE, { w: 0.5, d: 0.5, y: 1.28, h: 0.055, n: 5, dw: 0.1 });
  P.push(pl(0.02, 0.05, 0.02, 0, top + 0.025, 0, 0xd9b44a, { ao: 0 }));
  const BR = [0xc0903a, 0xa87a30, 0x8a6228].map(col), B = [pl(0.05, 0.025, 0.03, 0, 0.012, 0, WDK, { ao: 0 }), rbox(0.05, 0.03, 0.05, 0, -0.005, 0, BR[0], { seg: 1, r: 0.2, ao: 0 }), rbox(0.09, 0.07, 0.09, 0, -0.05, 0, BR[0], { seg: 1, r: 0.15, ao: 0.1 }), rbox(0.12, 0.05, 0.12, 0, -0.105, 0, BR[1], { seg: 1, r: 0.15, ao: 0.1 }), pl(0.15, 0.022, 0.15, 0, -0.14, 0, BR[2], { ao: 0 }), pl(0.02, 0.03, 0.02, 0, -0.165, 0, IRON, { ao: 0 })];
  const bell = merge(B); bell.translate(PV[0], PV[1], PV[2]); bell.computeBoundingBox();
  return { geometry: merge(P), anchors: { door: [0, 0, 0.4] }, parts: { bell: { geometry: bell, pivot: PV } } };
}
// ================= 体素主题：海边和夜里的小动物（鹬、白鹭、燕鸥、蝙蝠），和 models-land.js 同尺寸、同部件 =================
/** 部件 → { geometry, parts }（部件几何在模型坐标里，pivot 是关节点） */
function rigParts(parts) { const geometry = mergeGeometries(Object.values(parts).map((p) => p.geometry), false); geometry.computeBoundingSphere(); return { geometry, parts }; }
/** 鹬：褐背白肚的小方身子、细长黑嘴、两根细腿 */
export function vSandpiper() {
  const b = 0x9a7a5a, body = merge([rbox(0.012, 0.01, 0.022, 0, 0.019, 0, b, { seg: 1, r: 0.25, ao: 0.15 }), box(0.01, 0.004, 0.016, 0, 0.0145, 0.002, 0xf2eee6, { seg: 0, ao: 0 }), box(0.0125, 0.004, 0.012, 0, 0.0215, -0.003, 0x7a5f44, { seg: 0, ao: 0 }), rbox(0.009, 0.009, 0.009, 0, 0.026, 0.012, b, { seg: 1, r: 0.3, ao: 0 }), box(0.002, 0.002, 0.011, 0, 0.025, 0.021, 0x2a2420, { seg: 0, ao: 0 }), box(0.0095, 0.002, 0.002, 0, 0.0275, 0.0145, 0x1d1a1a, { seg: 0, ao: 0 }), box(0.008, 0.003, 0.006, 0, 0.021, -0.0125, 0x6a5a48, { seg: 0, ao: 0 })]);
  const parts = { body: { geometry: body } };
  for (const [k, s] of [['legL', 1], ['legR', -1]]) parts[k] = { geometry: box(0.0018, 0.0166, 0.0018, s * 0.0032, 0.0083, 0.001, 0x3a3028, { seg: 0, ao: 0 }), pivot: [s * 0.0032, 0.0166, 0.001] };
  return rigParts(parts);
}
/** 白鹭：白方身子、分节的长脖子（会低头）、黄嘴、两根细长黑腿 */
export function vEgret() {
  const W = 0xf6f6f2, body = merge([rbox(0.022, 0.024, 0.05, 0, 0.059, -0.005, W, { seg: 1, r: 0.25, ao: 0.15 }), box(0.016, 0.006, 0.014, 0, 0.064, -0.033, 0xe8e8e2, { seg: 0, ao: 0 })]);
  const neck = merge([box(0.008, 0.026, 0.008, 0, 0.077, 0.02, W, { seg: 0, ao: 0.05 }), box(0.008, 0.016, 0.008, 0, 0.095, 0.028, W, { seg: 0, ao: 0 }), rbox(0.012, 0.012, 0.016, 0, 0.104, 0.036, W, { seg: 1, r: 0.3, ao: 0 }), box(0.004, 0.004, 0.02, 0, 0.103, 0.053, 0xe8c040, { seg: 0, ao: 0 }), box(0.013, 0.002, 0.002, 0, 0.106, 0.04, 0x1d1a1a, { seg: 0, ao: 0 })]);
  const parts = { body: { geometry: body }, neck: { geometry: neck, pivot: [0, 0.064, 0.017] } };
  for (const [k, s] of [['legL', 1], ['legR', -1]]) parts[k] = { geometry: merge([box(0.003, 0.054, 0.003, s * 0.005, 0.028, -0.002, 0x2a2420, { seg: 0, ao: 0 }), box(0.006, 0.002, 0.01, s * 0.005, 0.001, 0.003, 0x2a2420, { seg: 0, ao: 0 })]), pivot: [s * 0.005, 0.054, -0.002] };
  return rigParts(parts);
}
/** 燕鸥：白身子黑头顶、红嘴、分叉尾；翅膀三段（翅尖灰） */
export function vTern() {
  const P = [[0.012, 0.01, 0.04, 0, 0.004, 0, 0xf4f4f0, 0], [0.011, 0.006, 0.012, 0, 0.009, 0.016, 0x1d1a1a, 0], [0.003, 0.003, 0.012, 0, 0.006, 0.028, 0xe0502a, 0]];
  for (const s of [-1, 1]) P.push([0.004, 0.002, 0.014, s * 0.004, 0.004, -0.027, 0xe8e8e4, 0], [0.024, 0.002, 0.016, s * 0.016, 0.006, 0, 0xe0e4e8, 1], [0.022, 0.002, 0.011, s * 0.036, 0.006, -0.004, 0xd0d4da, 1], [0.008, 0.0021, 0.008, s * 0.043, 0.006, -0.008, 0x8a8e94, 1]);
  return { geometry: flyer(P) };
}
/** 蝙蝠：深褐方身子、两只尖耳朵；翅膀两段 */
export function vBat() {
  const P = [[0.008, 0.007, 0.016, 0, 0.002, 0, 0x3a2e2a, 0], [0.007, 0.006, 0.006, 0, 0.003, 0.009, 0x3a2e2a, 0]];
  for (const s of [-1, 1]) P.push([0.002, 0.003, 0.002, s * 0.002, 0.0072, 0.009, 0x2a2220, 0], [0.018, 0.0015, 0.014, s * 0.013, 0.002, -0.001, 0x2a2220, 1], [0.008, 0.0015, 0.008, s * 0.022, 0.002, -0.004, 0x241c1a, 1]);
  return { geometry: flyer(P) };
}
// 给体素海洋生物（vmarine.js）用的几个底层工具
export { rbox, merge, gridCubes, tone, paint };
