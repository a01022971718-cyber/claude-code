// 造物工坊：把 AI 设计的“造型配方”现场生成成 3D 模型。不是从已有素材里挑，而是按配方从几何体一块块搭出来：
//  - 植物：形态（乔木、松塔、椰子、灌木、蘑菇、花、仙人掌、水晶、芦苇）× 树冠形状（球、锥、层叠、伞、簇、尖塔、团）
//    × 尺寸、树干粗细和弯度、两种叶色渐变、点缀（果子、花、斑点、发光）。
//  - 动物：体型（圆、长、方、扁）× 腿数（0/2/4/6）× 头、眼睛、耳朵、角、尾巴、翅膀、花纹 × 两种颜色 × 大小。
// 体素主题下，同一份配方用方块搭（球换成方块团）。生成结果都是带顶点色的几何，植物带风摆属性，动物分部件（身体、腿、翅膀）好做动作。
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, makeNoise } from './noise.js';
import { kit } from './dressing.js';

const NZ = makeNoise(77);
const clamp = THREE.MathUtils.clamp;
/** "#rrggbb" → 颜色；不合法时用默认色 */
export function col(v, def = '#7fae4a') { const s = typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : def; return new THREE.Color(s[0] === '#' ? s : '#' + s); }
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

/** 统一属性：position / normal / color / wind，去掉 uv、转成非索引 */
function finish(g, color, { ao = 0.15, wind = 0, H = 1, top = null, jitter = 0.06 } = {}) {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.computeVertexNormals(); g.computeBoundingBox();
  const p = g.attributes.position, n = p.count, c = new Float32Array(n * 3), w = new Float32Array(n), y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y, t = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const f = clamp((p.getY(i) - y0) / (y1 - y0 || 1), 0, 1);
    t.copy(color); if (top) t.lerp(top, f);
    t.multiplyScalar((1 - ao * (1 - f)) * (1 + NZ.n2(p.getX(i) * 40, p.getZ(i) * 40 + p.getY(i) * 30) * jitter));
    c.set([t.r, t.g, t.b], i * 3); w[i] = wind ? clamp(p.getY(i) / H, 0, 1.2) * wind : 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('wind', new THREE.BufferAttribute(w, 1));
  return g;
}
const merge = (list) => { const g = mergeGeometries(list, false); for (const x of list) x.dispose(); g.computeBoundingSphere(); return g; };
/** 一团“叶子”：经典主题是凹凸的球，体素主题是方块团 */
function blob(R, voxel, r, sx, sy, sz, x, y, z, c1, c2, wind, H) {
  if (voxel) {
    const v = Math.max(0.025, r / 3.2), out = [], n = Math.ceil(1.2 * r / v);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let k = -n; k <= n; k++) {
      const e = (i * v / (r * sx)) ** 2 + (j * v / (r * sy)) ** 2 + (k * v / (r * sz)) ** 2; if (e > 1 || e < 0.45) continue;
      const g = new THREE.BoxGeometry(v * 0.97, v * 0.97, v * 0.97); g.translate(x + i * v, y + j * v, z + k * v);
      out.push(finish(g, c1.clone().lerp(c2, R()), { ao: 0.1, wind, H, jitter: 0.03 }));
    }
    return out.length ? [merge(out)] : [];
  }
  const g = new THREE.IcosahedronGeometry(r, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const f = 1 + NZ.n3(p.getX(i) * 7 + x * 9, p.getY(i) * 7, p.getZ(i) * 7 + z * 9) * 0.22; p.setXYZ(i, p.getX(i) * f * sx, p.getY(i) * f * sy, p.getZ(i) * f * sz); }
  g.translate(x, y, z);
  return [finish(g, c1, { top: c2, ao: 0.3, wind, H })];
}
const cyl = (r0, r1, h, x, y, z, c, seg = 7) => { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(x, y + h / 2, z); return g; };

// ---------- 换形换色：AI 造的树、松、椰子、灌木、芦苇，直接用原有素材当底子 ----------
// 底子的几何、噪声起伏、软体积法线、明暗关系全部保留，只做两件事：按轮廓缩放（含垂枝），把叶子的明暗映射到新色板、树皮换成新树皮色。
// 这样新植物和原有植物是同一种笔法，放进岛里不脱节。
const BASE = { tree: ['broad', 0], conifer: ['con', 1], palm: ['palm', 0], bush: ['bush', 0], reed: ['reed', 0] };
const SIL = { round: [1, 1], tall: [0.72, 1.15], wide: [1.32, 0.86], droop: [1.12, 0.96] };
function restyle(sp, H, voxel) {
  const [k, v] = BASE[sp.form], src = kit()[k][v];
  let g = src.clone(); if (g.index) g = g.toNonIndexed();
  g.computeBoundingBox();
  const bb = g.boundingBox, H0 = bb.max.y - Math.max(0, bb.min.y), [sxz, sy0] = SIL[sp.crownShape] || SIL.round;
  const sy = (H / H0) * sy0, sx = (H / H0) * sxz * (0.8 + clamp(+sp.crownSize || 0.6, 0.15, 1.2) * 0.35);
  const P = g.attributes.position, C = g.attributes.color, N = g.attributes.normal, n = P.count;
  const c1 = col(sp.crownColor, '#3f7d2c'), c2 = col(sp.crownColor2 || sp.crownColor, '#a6cf55'), tc = col(sp.trunkColor, '#5b3d29'), ac = col(sp.accentColor, '#d9452e');
  const dark = c1.clone().multiplyScalar(0.42), hsl = {}, t = new THREE.Color(), kind = new Uint8Array(n), lum = new Float32Array(n);
  let lo = Infinity, hi = -Infinity, bark = 0, nb = 0, R0 = 0;
  for (let i = 0; i < n; i++) {
    t.setRGB(C.getX(i), C.getY(i), C.getZ(i)); t.getHSL(hsl); const l = 0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b; lum[i] = l;
    kind[i] = hsl.s > 0.5 && hsl.h < 0.11 ? 2 : (hsl.h > 0.12 && hsl.h < 0.55 && hsl.s > 0.12) ? 1 : 0;   // 1 叶 · 0 树皮 · 2 果子
    if (kind[i] === 1) { lo = Math.min(lo, l); hi = Math.max(hi, l); R0 = Math.max(R0, Math.hypot(P.getX(i), P.getZ(i))); } else if (!kind[i]) { bark += l; nb++; }
  }
  bark = nb ? bark / nb : 0.05;
  const droop = sp.crownShape === 'droop';
  for (let i = 0; i < n; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (droop && kind[i] === 1) { const r = Math.hypot(x, z) / (R0 || 1); y -= r * r * H0 * 0.16; }
    P.setXYZ(i, x * sx, y * sy, z * sx);
    if (kind[i] === 1) { const f = clamp((lum[i] - lo) / (hi - lo || 1), 0, 1); t.copy(dark).lerp(c1, clamp(f * 1.8, 0, 1)).lerp(c2, clamp((f - 0.55) * 2.2, 0, 1)); }
    else if (kind[i] === 2) t.copy(sp.accent === 'fruit' ? ac : c2);
    else t.copy(tc).multiplyScalar(clamp(lum[i] / (bark || 0.05), 0.5, 1.6));
    C.setXYZ(i, t.r, t.g, t.b);
  }
  // 法线随不等比缩放修正
  for (let i = 0; i < n; i++) { const a = new THREE.Vector3(N.getX(i) / sx, N.getY(i) / sy, N.getZ(i) / sx).normalize(); N.setXYZ(i, a.x, a.y, a.z); }
  P.needsUpdate = C.needsUpdate = N.needsUpdate = true;
  // 点缀：撒在叶子的外表面上（果子、小花、斑点、微光），少量
  if (sp.accent && sp.accent !== 'none') {
    const cand = []; for (let i = 0; i < n; i += 3) if (kind[i] === 1 && Math.hypot(P.getX(i), P.getZ(i)) > R0 * sx * 0.55) cand.push(i);
    const Rr = rng(hash(sp.name) + 7), out = [g], vox = voxel, r = H * (sp.accent === 'spots' ? 0.022 : 0.017), cnt = Math.min(cand.length, sp.form === 'bush' ? 6 : 11);
    for (let j = 0; j < cnt; j++) {
      const i = cand[Math.floor(Rr() * cand.length)], a = vox ? new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6) : new THREE.IcosahedronGeometry(r, 1);
      a.translate(P.getX(i) + N.getX(i) * r * 0.5, P.getY(i) + N.getY(i) * r * 0.5, P.getZ(i) + N.getZ(i) * r * 0.5);
      out.push(conform(finish(a, sp.accent === 'glow' ? ac.clone().multiplyScalar(1.15) : ac, { ao: 0, jitter: 0, wind: 1, H: H }), g));
    }
    g = merge(out);
  }
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
/** 让一块小几何和底子的属性对齐（合并几何要求属性一致） */
function conform(a, base) {
  for (const k of Object.keys(a.attributes)) if (!base.attributes[k]) a.deleteAttribute(k);
  for (const [k, at] of Object.entries(base.attributes)) if (!a.attributes[k]) a.setAttribute(k, new THREE.BufferAttribute(new Float32Array(a.attributes.position.count * at.itemSize), at.itemSize));
  return a;
}

/** 植物配方 → 几何（底部 y=0，高约 height） */
export function plantGeo(sp, voxel = false) {
  if (BASE[sp.form]) return restyle(sp, clamp(+sp.height || 0.8, 0.1, 1.6), voxel);
  const R = rng(hash(sp.name)), H = clamp(+sp.height || 0.8, 0.1, 1.6), form = sp.form || 'tree';
  const tc = col(sp.trunkColor, '#6b4a32'), c1 = col(sp.crownColor, '#4f8a3a'), c2 = col(sp.crownColor2 || sp.crownColor, '#8fc050'), ac = col(sp.accentColor, '#e04a3a');
  const th = (0.012 + clamp(+sp.trunkThickness || 0.5, 0, 1) * 0.035) * Math.max(0.5, H / 0.85), bend = clamp(+sp.bend || 0, 0, 1), size = clamp(+sp.crownSize || 0.6, 0.15, 1.2);
  const P = [], trunk = (h) => { let y = 0, x = 0; const seg = 4; for (let i = 0; i < seg; i++) { const hh = h / seg, r0 = th * (1 - i * 0.18), r1 = th * (1 - (i + 1) * 0.18); P.push(finish(cyl(r0, r1, hh * 1.04, x, y, 0, null, voxel ? 4 : 7), tc, { ao: 0.25 })); y += hh; x += bend * 0.03 * (i + 1) * H; } return [x, y]; };
  const crown = (shape, cx, cy, r) => {
    const add = (list) => P.push(...list);
    if (shape === 'cone' || shape === 'spike') { const tall = shape === 'spike' ? 2.4 : 1.4; if (voxel) add(blob(R, true, r, 0.8, tall, 0.8, cx, cy + r * tall * 0.6, 0, c1, c2, 1, H)); else { const g = new THREE.ConeGeometry(r, r * tall * 1.6, 9, 3); g.translate(cx, cy + r * tall * 0.8, 0); P.push(finish(g, c1, { top: c2, ao: 0.3, wind: 1, H })); } }
    else if (shape === 'layers') for (let i = 0; i < 3; i++) add(blob(R, voxel, r * (1 - i * 0.22), 1.1, 0.45, 1.1, cx, cy + i * r * 0.55, 0, c1, c2, 1, H));
    else if (shape === 'umbrella') add(blob(R, voxel, r * 1.2, 1.3, 0.38, 1.3, cx, cy + r * 0.2, 0, c1, c2, 1, H));
    else if (shape === 'cluster') for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.28 + R(), d = i ? r * 0.55 : 0; add(blob(R, voxel, r * (i ? 0.5 : 0.62), 1, 0.9, 1, cx + Math.cos(a) * d, cy + (i ? (R() - 0.3) * r * 0.5 : r * 0.25), Math.sin(a) * d, c1, c2, 1, H)); }
    else add(blob(R, voxel, r, 1, 0.9, 1, cx, cy + r * 0.3, 0, c1, c2, 1, H));
  };
  const accents = (cx, cy, r, n) => {
    if (!sp.accent || sp.accent === 'none') return;
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, b = (R() - 0.3) * 1.2, x = cx + Math.cos(a) * Math.cos(b) * r, y = cy + Math.sin(b) * r * 0.9, z = Math.sin(a) * Math.cos(b) * r;
      const s = sp.accent === 'spots' ? 0.12 : sp.accent === 'glow' ? 0.1 : 0.09, g = voxel ? new THREE.BoxGeometry(r * s * 1.6, r * s * 1.6, r * s * 1.6) : new THREE.SphereGeometry(r * s, 6, 5);
      g.translate(x, y, z); P.push(finish(g, sp.accent === 'glow' ? ac.clone().multiplyScalar(1.15) : ac, { ao: 0, wind: 1, H, jitter: 0 }));
    }
  };
  if (form === 'conifer') { const [x, y] = trunk(H * 0.3); for (let i = 0; i < 4; i++) crown('cone', x, y + i * H * 0.16 - 0.02, H * 0.3 * size * (1 - i * 0.2)); }
  else if (form === 'palm') {
    const [x, y] = trunk(H * 0.85);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28 + R() * 0.3, L = H * 0.45 * size, g = voxel ? new THREE.BoxGeometry(L, 0.02, 0.06) : new THREE.SphereGeometry(1, 8, 4).scale(L / 2, 0.012, 0.05); g.translate(L / 2, 0, 0); g.rotateZ(-0.45); g.rotateY(a); g.translate(x, y, 0); P.push(finish(g, c1, { top: c2, ao: 0.1, wind: 1, H })); }
    accents(x, y - H * 0.04, H * 0.06, 4);
  } else if (form === 'bush') { crown(sp.crownShape || 'cluster', 0, 0, H * 0.45 * size); accents(0, H * 0.4, H * 0.45 * size, 8); }
  else if (form === 'mushroom') {
    const [x, y] = trunk(H * 0.6), r = H * 0.38 * size;
    const cap = voxel ? new THREE.BoxGeometry(r * 2, r * 0.6, r * 2).translate(x, y + r * 0.2, 0) : new THREE.SphereGeometry(r, 16, 8, 0, 6.29, 0, Math.PI / 2).scale(1, 0.7, 1).translate(x, y - r * 0.05, 0);
    P.push(finish(cap, c1, { top: c2, ao: 0.25, wind: 0.3, H }));
    if (sp.accent && sp.accent !== 'none') for (let i = 0; i < 7; i++) { const a = R() * 6.28, d = R() * r * 0.8, yy = y + Math.sqrt(Math.max(0, 1 - (d / r) ** 2)) * r * 0.7 - r * 0.02, g = voxel ? new THREE.BoxGeometry(r * 0.22, r * 0.08, r * 0.22) : new THREE.SphereGeometry(r * 0.12, 6, 4).scale(1, 0.4, 1); g.translate(x + Math.cos(a) * d, yy, Math.sin(a) * d); P.push(finish(g, sp.accent === 'glow' ? ac.clone().multiplyScalar(1.15) : ac, { ao: 0, wind: 0.3, H, jitter: 0 })); }
  } else if (form === 'flower') {
    const [x, y] = trunk(H * 0.85), r = H * 0.16 * size;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28, g = voxel ? new THREE.BoxGeometry(r, r * 0.25, r * 0.5) : new THREE.SphereGeometry(r * 0.55, 7, 4).scale(1, 0.25, 0.55); g.translate(r * 0.55, 0, 0); g.rotateY(a); g.translate(x, y, 0); P.push(finish(g, c1, { top: c2, ao: 0, wind: 1, H })); }
    const ctr = voxel ? new THREE.BoxGeometry(r * 0.5, r * 0.3, r * 0.5) : new THREE.SphereGeometry(r * 0.3, 8, 5); ctr.translate(x, y + r * 0.06, 0); P.push(finish(ctr, ac, { ao: 0, wind: 1, H }));
  } else if (form === 'cactus') {
    const r = th * 2.2 * size + 0.02, body = voxel ? new THREE.BoxGeometry(r * 1.6, H, r * 1.6).translate(0, H / 2, 0) : new THREE.CapsuleGeometry(r, H - r * 2, 4, 9).translate(0, H / 2, 0);
    P.push(finish(body, c1, { top: c2, ao: 0.25 }));
    for (const s of [-1, 1]) { const ah = H * (0.3 + R() * 0.15), arm = voxel ? new THREE.BoxGeometry(r * 1.1, ah, r * 1.1) : new THREE.CapsuleGeometry(r * 0.65, ah, 3, 8); arm.translate(s * r * 1.9, H * (0.45 + R() * 0.2) + ah / 2, 0); P.push(finish(arm, c1, { top: c2, ao: 0.2 })); const j = voxel ? new THREE.BoxGeometry(r * 1.6, r, r).translate(s * r * 1.2, H * 0.45, 0) : new THREE.CapsuleGeometry(r * 0.6, r * 1.2, 3, 8).rotateZ(Math.PI / 2).translate(s * r * 1.2, H * 0.45, 0); P.push(finish(j, c1, { ao: 0.2 })); }
    accents(0, H * 0.98, r * 1.3, 3);
  } else if (form === 'crystal') {
    for (let i = 0; i < 5; i++) { const h = H * (i ? 0.45 + R() * 0.35 : 1), r = h * 0.18 * size, g = voxel ? new THREE.BoxGeometry(r * 1.4, h, r * 1.4).translate(0, h / 2, 0) : new THREE.OctahedronGeometry(r, 0).scale(1, h / r / 2, 1).translate(0, h / 2, 0); g.rotateZ((R() - 0.5) * 0.7 * (i ? 1 : 0.2)); g.rotateY(R() * 6.28); g.translate((R() - 0.5) * H * 0.25 * (i ? 1 : 0), 0, (R() - 0.5) * H * 0.25 * (i ? 1 : 0)); P.push(finish(g, c1, { top: c2.clone().multiplyScalar(1.3), ao: 0.2, jitter: 0.02 })); }
  } else if (form === 'reed') {
    for (let i = 0; i < 7; i++) { const h = H * (0.6 + R() * 0.4), g = cyl(0.004, 0.002, h, (R() - 0.5) * 0.08, 0, (R() - 0.5) * 0.08, null, 4); g.rotateZ((R() - 0.5) * 0.3); P.push(finish(g, c1, { top: c2, ao: 0.2, wind: 1, H })); if (sp.accent && sp.accent !== 'none' && i % 2 === 0) { const tip = new THREE.CapsuleGeometry(0.007, H * 0.12, 3, 6); tip.translate(0, h, 0); P.push(finish(tip, ac, { ao: 0, wind: 1, H })); } }
  } else { const [x, y] = trunk(H * 0.55); const r = H * 0.32 * size; crown(sp.crownShape || 'sphere', x, y, r); accents(x, y + r * 0.3, r * 0.95, 9); }
  return merge(P);
}

/** 动物配方 → 分部件的几何：body（含头、耳、角、尾、花纹、眼睛）、legs（各带髋关节）、wings（各带肩关节） */
export function creatureParts(sp, voxel = false) {
  const R = rng(hash(sp.name)), S = clamp(+sp.size || 0.08, 0.03, 0.3), shape = sp.shape || 'round';
  const c1 = col(sp.color, '#c98a4a'), c2 = col(sp.color2 || sp.color, '#f0e2c8'), dark = new THREE.Color(0x221c1a);
  const legs = [0, 2, 4, 6].includes(+sp.legs) ? +sp.legs : 4, fly = sp.move === 'fly', swim = sp.move === 'swim';
  const dims = { round: [0.55, 0.5, 0.65], long: [0.38, 0.34, 1.0], box: [0.55, 0.5, 0.75], flat: [0.6, 0.24, 0.7] }[shape] || [0.55, 0.5, 0.65];
  const W = dims[0] * S, Hh = dims[1] * S, L = dims[2] * S, legH = legs ? (fly || swim ? 0.12 : sp.move === 'hop' ? 0.3 : 0.5) * S : 0, cy = legH + Hh / 2;
  const B = [], ell = (rx, ry, rz, x, y, z, c, o = {}) => { const g = voxel ? new THREE.BoxGeometry(rx * 1.8, ry * 1.8, rz * 1.8) : new THREE.SphereGeometry(1, 12, 9).scale(rx, ry, rz); g.translate(x, y, z); return finish(g, c, { ao: 0.2, jitter: 0.03, ...o }); };
  // 身体（下半部分可以是浅色的肚皮）
  B.push(ell(W / 2, Hh / 2, L / 2, 0, cy, 0, c1.clone().multiplyScalar(0.78), { top: c1.clone().lerp(new THREE.Color(1, 1, 1), 0.08), ao: 0.35 }));   // 和原有动物一样：下暗上亮
  if (sp.pattern === 'belly') B.push(ell(W * 0.4, Hh * 0.3, L * 0.42, 0, cy - Hh * 0.22, 0, c2, { ao: 0 }));
  if (sp.pattern === 'spots') for (let i = 0; i < 6; i++) B.push(ell(S * 0.07, S * 0.03, S * 0.07, (R() - 0.5) * W * 0.6, cy + Hh * 0.46, (R() - 0.5) * L * 0.7, c2, { ao: 0 }));
  if (sp.pattern === 'stripes') for (let i = 0; i < 3; i++) B.push(ell(W * 0.51, Hh * 0.51, S * 0.045, 0, cy, (i - 1) * L * 0.25, c2, { ao: 0 }));
  // 头
  const hs = clamp(+sp.head || 0.45, 0.2, 0.8) * S, hz = L / 2 + hs * 0.25, hy = cy + Hh * 0.25 + (swim ? 0 : hs * 0.2);
  B.push(ell(hs * 0.5, hs * 0.48, hs * 0.55, 0, hy, hz, c1.clone().multiplyScalar(0.85), { top: c1, ao: 0.25 }));
  B.push(ell(hs * 0.26, hs * 0.22, hs * 0.22, 0, hy - hs * 0.12, hz + hs * 0.42, c2, { ao: 0.1 }));   // 口鼻
  B.push(ell(hs * 0.07, hs * 0.05, hs * 0.04, 0, hy - hs * 0.04, hz + hs * 0.62, dark, { ao: 0, jitter: 0 }));   // 鼻头
  const er = (sp.eyes === 'big' ? 0.085 : 0.06) * hs;   // 眼睛小而亮，和原有动物一致（不做卡通大眼）
  for (const s of [-1, 1]) {
    B.push(ell(er, er * 1.1, er * 0.8, s * hs * 0.36, hy + hs * 0.1, hz + hs * 0.36, dark, { ao: 0, jitter: 0 }));
    B.push(ell(er * 0.3, er * 0.3, er * 0.3, s * hs * 0.36 + s * er * 0.2, hy + hs * 0.1 + er * 0.35, hz + hs * 0.36 + er * 0.7, new THREE.Color(0xffffff), { ao: 0, jitter: 0 }));
    if (sp.ears === 'round') B.push(ell(hs * 0.16, hs * 0.16, hs * 0.08, s * hs * 0.32, hy + hs * 0.48, hz - hs * 0.05, c1));
    else if (sp.ears === 'long') B.push(ell(hs * 0.09, hs * 0.38, hs * 0.07, s * hs * 0.2, hy + hs * 0.75, hz - hs * 0.1, c1));
    else if (sp.ears === 'pointy') { const g = voxel ? new THREE.BoxGeometry(hs * 0.18, hs * 0.3, hs * 0.1) : new THREE.ConeGeometry(hs * 0.13, hs * 0.34, 5); g.translate(s * hs * 0.3, hy + hs * 0.55, hz - hs * 0.05); B.push(finish(g, c1, { ao: 0 })); }
    if (sp.horns === 'small') { const g = voxel ? new THREE.BoxGeometry(hs * 0.1, hs * 0.3, hs * 0.1) : new THREE.ConeGeometry(hs * 0.07, hs * 0.32, 6); g.translate(s * hs * 0.18, hy + hs * 0.6, hz + hs * 0.05); B.push(finish(g, c2, { ao: 0 })); }
    else if (sp.horns === 'antlers') { for (let k = 0; k < 3; k++) { const g = new THREE.CylinderGeometry(hs * 0.025, hs * 0.035, hs * 0.4, 5); g.translate(0, hs * 0.2, 0); g.rotateZ(s * (0.3 + k * 0.4)); g.translate(s * hs * (0.18 + k * 0.1), hy + hs * (0.5 + k * 0.18), hz - hs * 0.05); B.push(finish(g, c2, { ao: 0 })); } }
  }
  // 尾巴
  const tz = -L / 2;
  if (sp.tail === 'short') B.push(ell(S * 0.07, S * 0.07, S * 0.07, 0, cy + Hh * 0.2, tz, c2));
  else if (sp.tail === 'long') { const g = voxel ? new THREE.BoxGeometry(S * 0.06, S * 0.06, L * 0.7) : new THREE.CapsuleGeometry(S * 0.03, L * 0.6, 3, 6).rotateX(Math.PI / 2 - 0.4); g.translate(0, cy + Hh * 0.25, tz - L * 0.3); B.push(finish(g, c1, { ao: 0 })); }
  else if (sp.tail === 'fluffy') B.push(ell(S * 0.16, S * 0.2, S * 0.16, 0, cy + Hh * 0.45, tz - S * 0.05, c2));
  else if (sp.tail === 'fin') B.push(ell(S * 0.02, Hh * 0.45, L * 0.2, 0, cy, tz - L * 0.12, c2));
  const parts = { body: merge(B), legs: [], wings: [], height: cy + Hh / 2 + hs * 0.6, length: L + hs, legH, S };
  // 腿：成对排在身体两侧，关节在髋
  const lw = clamp(S * 0.075, 0.003, 0.03);
  for (let i = 0; i < legs / 2; i++) {
    const z = legs === 2 ? 0 : (i / (legs / 2 - 1) - 0.5) * L * 0.6;
    for (const s of [-1, 1]) { const x = s * W * 0.32, g = voxel ? new THREE.BoxGeometry(lw, legH, lw) : new THREE.CapsuleGeometry(lw / 2, Math.max(0.001, legH - lw), 3, 6); g.translate(x, legH / 2, z); parts.legs.push({ geo: finish(g, c1.clone().multiplyScalar(0.8), { ao: 0.1 }), pivot: [x, legH, z] }); }
  }
  // 翅膀：扁的叶片，关节在肩
  if (sp.wings || fly) for (const s of [-1, 1]) { const span = L * 0.9, g = voxel ? new THREE.BoxGeometry(span, S * 0.03, L * 0.5) : new THREE.SphereGeometry(1, 10, 6).scale(span / 2, S * 0.02, L * 0.28); g.translate(s * span / 2, 0, 0); const px = s * W * 0.4, py = cy + Hh * 0.35; g.translate(px, py, 0); parts.wings.push({ geo: finish(g, c2, { ao: 0, jitter: 0.02 }), pivot: [px, py, 0], side: s }); }
  return parts;
}
