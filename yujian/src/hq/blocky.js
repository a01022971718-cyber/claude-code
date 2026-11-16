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

export const STYLE = { blocky: typeof location !== 'undefined' && new URLSearchParams(location.search).get('style') === 'blocky' };

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
    const g = new THREE.BoxGeometry(s, s, s).toNonIndexed(); g.deleteAttribute('uv');
    paint(g, c, { ao: 0.12 }); g.translate(cx + i * v + (isFruit ? 0 : (R() - 0.5) * v * 0.08), cy + j * v, cz + k * v + (isFruit ? v * 0.25 : 0));
    out.push(g);
  }
}
/** 体素阔叶树（高约 0.85，底部 y=0）：树干是几节错开的圆角方块，树冠是两三团体素 */
export function voxelTree(seed = 1, kind = 'green') {
  const R = rng(seed * 71 + 5), T = [], C = [], H = 0.85, lean = (R() - 0.5) * 0.04;
  let y = 0;
  for (let i = 0; i < 8; i++) { const w = 0.052 - i * 0.003, h = 0.062; T.push(rbox(w, h, w, lean * i * 0.6 + (R() - 0.5) * 0.006, y + h / 2, lean * i * 0.3 + (R() - 0.5) * 0.006, BARK[i % 3].clone().multiplyScalar(0.88 + R() * 0.18), { seg: 1, r: 0.12, ao: i ? 0.04 : 0.25 })); y += h * 0.97; }
  T.push(rbox(0.022, 0.022, 0.12, lean * 3, 0.38, 0.055, BARK[1], { seg: 1, r: 0.2, ao: 0.05, rx: -0.55 }));
  const pal = kind === 'autumn' ? [0xd88a2e, 0xc8702a, 0xe0a040, 0xb85a28].map(col) : kind === 'lime' ? [0x7fb04a, 0x8fbe52, 0x6a9e40].map(col) : LEAF;
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
