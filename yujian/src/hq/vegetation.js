// 高画质植被：
//  - 树（松树、阔叶树、灌木）：程序生成几种变体，用实例化绘制；法线向外“蓬松化”，得到柔和的体积光影；顶点色里烘焙了自遮蔽
//  - 草叶、花、麦穗：数万个实例，在顶点着色器里随风摆动，颜色取自脚下的地表，和地面无缝融合
import * as THREE from 'three';
import { makeNoise, rng } from './noise.js';
import { foliageMaterial, U } from './materials.js';
import { GLSL_NOISE, GLSL_CLOUD } from './noise.js';
import { GLSL_WAVES } from './waves.js';
import { GLSL_CAUSTIC } from './materials.js';
import { STYLE } from './blocky.js';

const NZ = makeNoise(77);
const C = (h) => new THREE.Color(h);

/** 把若干带 color/wind 的几何合并成一个 */
function merge(list) {
  let n = 0; for (const g of list) n += g.index ? g.index.count : g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), wind = new Float32Array(n);
  let o = 0;
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0, c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    if (g.attributes.wind) wind.set(g.attributes.wind.array, o);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('wind', new THREE.BufferAttribute(wind, 1));
  out.computeBoundingSphere();
  return out;
}
function paint(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), wind = new Float32Array(p.count), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const w = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; wind[i] = w || 0; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('wind', new THREE.BufferAttribute(wind, 1));
  return g;
}
/** 法线向“从中心向外”的方向弯曲，让树冠看起来是一团柔软的体积 */
function fluff(g, cx, cy, cz, k = 0.65, up = 0.25) {
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - cx, p.getY(i) - cy, p.getZ(i) - cz).normalize(); v.y += up;
    m.set(n.getX(i), n.getY(i), n.getZ(i)).lerp(v.normalize(), k).normalize();
    n.setXYZ(i, m.x, m.y, m.z);
  }
  return g;
}

// ---------------- 松树 ----------------
export function conifer(seed = 1) {
  const R = rng(seed), H = 1.0, parts = [];
  const trunk = new THREE.CylinderGeometry(0.022, 0.04, 0.4, 7, 2); trunk.translate(0, 0.2, 0);
  parts.push(paint(trunk, (x, y, z, nx, ny, nz, c) => { c.set(0x4f3423).multiplyScalar(0.8 + NZ.n3(x * 40, y * 12, z * 40) * 0.15); }));
  const tiers = 6 + Math.floor(R() * 3);
  const deep = C(0x1d4632), mid = C(0x2f6b45), tip = C(0x6f9f52), under = C(0x14301f);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), yb = 0.16 + t * 0.66 * H, th = 0.3 * (1 - t * 0.45), rad = 0.31 * (1 - t * 0.8) + 0.035;
    const M = 12, pos = [], idx = [], rot = R() * 6.28;   // 每层 12 个尖（原来 16 个，远看一样）
    pos.push(0, yb + th, 0);                                           // 0 顶点
    for (let j = 0; j < M; j++) {                                      // 1..M 中圈（略外鼓）
      const a = rot + j / M * Math.PI * 2; pos.push(Math.cos(a) * rad * 0.62, yb + th * 0.42, Math.sin(a) * rad * 0.62);
    }
    for (let j = 0; j < M; j++) {                                      // M+1..2M 外缘：一尖一凹，尖的往下垂
      const a = rot + j / M * Math.PI * 2, spike = j % 2 === 0, rr = rad * (spike ? 1.08 + R() * 0.12 : 0.8 + R() * 0.08);
      pos.push(Math.cos(a) * rr, yb - (spike ? 0.06 + R() * 0.03 : 0.0) + R() * 0.012, Math.sin(a) * rr);
    }
    for (let j = 0; j < M; j++) {                                      // 2M+1..3M 底面内圈
      const a = rot + (j + 0.5) / M * Math.PI * 2; pos.push(Math.cos(a) * rad * 0.35, yb + 0.03, Math.sin(a) * rad * 0.35);
    }
    pos.push(0, yb + 0.05, 0);                                         // 3M+1 底心
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M, m1 = 1 + j, m2 = 1 + j2, r1 = 1 + M + j, r2 = 1 + M + j2, u1 = 1 + 2 * M + j, u2 = 1 + 2 * M + j2;
      idx.push(0, m2, m1, m1, m2, r1, m2, r2, r1, r1, r2, u1, r2, u2, u1, u1, u2, 3 * M + 1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.computeVertexNormals(); fluff(g, 0, yb, 0, 0.55, 0.45);
    const occl = 0.55 + t * 0.45;                                      // 越低的层被上面挡得越多
    paint(g, (x, y, z, nx, ny, nz, c) => {
      const r = Math.hypot(x, z) / rad, h = (y - yb) / th;
      c.copy(deep).lerp(mid, THREE.MathUtils.clamp(r * 0.9 + h * 0.2, 0, 1)).lerp(tip, THREE.MathUtils.clamp((r - 0.85) * 3.2, 0, 1) * 0.75);
      if (ny < -0.2) c.copy(under);
      c.multiplyScalar(occl * (0.85 + NZ.n3(x * 30, y * 30, z * 30) * 0.12));
      return Math.pow(y / H, 1.4) * (0.6 + r * 0.6);
    });
    parts.push(g);
  }
  return merge(parts);
}

// ---------------- 阔叶树 ----------------
const LEAF = {
  green: [0x3f7d2c, 0x6aa83a, 0xa6cf55, 0x21401a],
  lime: [0x5c8f2a, 0x8fc23e, 0xc9e06a, 0x2c4a17],
  autumn: [0x9a4e1c, 0xd98a2b, 0xf2c45a, 0x4a2410],
  blossom: [0xc96b8c, 0xeea3bc, 0xfbd5e2, 0x6a3448],
};
export function broadleaf(seed = 1, kind = 'green', H = 0.85) {
  const R = rng(seed), parts = [], pal = LEAF[kind].map(C);
  const trunk = new THREE.CylinderGeometry(0.025, 0.045, H * 0.55, 7, 3); trunk.translate(0, H * 0.275, 0);
  const tp = trunk.attributes.position; for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + Math.sin(y * 9 + seed) * 0.012); }
  trunk.computeVertexNormals();
  parts.push(paint(trunk, (x, y, z, nx, ny, nz, c) => { c.set(0x5b3d29).multiplyScalar(0.75 + NZ.n3(x * 50, y * 15, z * 50) * 0.2); }));
  // 两根斜枝
  for (let b = 0; b < 2; b++) {
    const br = new THREE.CylinderGeometry(0.01, 0.018, H * 0.3, 5); br.translate(0, H * 0.15, 0); br.rotateZ((b ? -1 : 1) * 0.7); br.rotateY(R() * 6); br.translate(0, H * 0.42, 0);
    parts.push(paint(br, (x, y, z, nx, ny, nz, c) => { c.set(0x5b3d29).multiplyScalar(0.7); }));
  }
  const cy = H * 0.72, blobs = 8 + Math.floor(R() * 4), canopyR = H * 0.36;
  // 树冠：原来是 8–11 个起伏的球叠在一起（每棵 1700 多个三角形，大半藏在里面看不见）。
  // 现在只做一层外壳：从树冠中心往每个方向打一条射线，取它穿出这些球的最远点——轮廓和原来一样，三角形少了四倍多
  const B = [];
  for (let i = 0; i < blobs; i++) {
    const a = R() * 6.28, d = i === 0 ? 0 : canopyR * (0.45 + R() * 0.35), yy = cy + (i === 0 ? canopyR * 0.15 : (R() - 0.35) * canopyR * 0.6);
    B.push([Math.cos(a) * d, yy - cy, Math.sin(a) * d, canopyR * (i === 0 ? 0.68 : 0.36 + R() * 0.18)]);
  }
  const shell = new THREE.IcosahedronGeometry(1, 3), sp = shell.attributes.position;
  for (let k = 0; k < sp.count; k++) {
    const dx = sp.getX(k), dy = sp.getY(k), dz = sp.getZ(k); let t = canopyR * 0.4;
    for (const [bx, by, bz, br] of B) { const p = dx * bx + dy * by + dz * bz, q = p * p - (bx * bx + by * by + bz * bz) + br * br; if (q >= 0) t = Math.max(t, p + Math.sqrt(q)); }
    const n = NZ.fbm3(dx * 3 + seed, dy * 3, dz * 3, 3), f = t * (1 + n * 0.22 + NZ.n3(dx * 9, dy * 9, dz * 9) * 0.05);
    sp.setXYZ(k, dx * f, cy + dy * f * 0.88, dz * f);
  }
  shell.computeVertexNormals();
  const canopy = merge([paint(shell, () => 0)]);
  fluff(canopy, 0, cy, 0, 0.72, 0.3);
  paint(canopy, (x, y, z, nx, ny, nz, c) => {
    const up = THREE.MathUtils.clamp((y - cy) / canopyR * 0.5 + 0.5, 0, 1), out = Math.hypot(x, z, (y - cy) * 0.8) / canopyR;
    c.copy(pal[0]).lerp(pal[1], up).lerp(pal[2], THREE.MathUtils.clamp(up * out - 0.45, 0, 1) * 1.2);
    c.lerp(pal[3], THREE.MathUtils.clamp(0.55 - out, 0, 1) * 0.9);
    const n = NZ.n3(x * 22, y * 22, z * 22); c.multiplyScalar(0.88 + n * 0.12);
    return THREE.MathUtils.clamp(y / H, 0, 1.2);
  });
  return merge([...parts.slice(0, 3), canopy]);
}
export function bush(seed = 1, kind = 'green') {
  const R = rng(seed), pal = LEAF[kind].map(C), parts = [];
  for (let i = 0; i < 3; i++) {
    const r = 0.07 + R() * 0.05, s = new THREE.IcosahedronGeometry(r, 1), sp = s.attributes.position;
    for (let k = 0; k < sp.count; k++) { const f = 1 + NZ.n3(sp.getX(k) * 20 + i, sp.getY(k) * 20, sp.getZ(k) * 20 + seed) * 0.25; sp.setXYZ(k, sp.getX(k) * f, sp.getY(k) * f * 0.8, sp.getZ(k) * f); }
    s.translate((R() - 0.5) * 0.12, r * 0.7, (R() - 0.5) * 0.12); s.computeVertexNormals(); parts.push(paint(s, () => 0));
  }
  const g = merge(parts); fluff(g, 0, 0.05, 0, 0.7, 0.3);
  return paint(g, (x, y, z, nx, ny, nz, c) => { c.copy(pal[0]).lerp(pal[1], THREE.MathUtils.clamp(y / 0.16, 0, 1)).lerp(pal[2], THREE.MathUtils.clamp(ny - 0.4, 0, 1) * 0.5); c.multiplyScalar(0.85 + NZ.n3(x * 30, y * 30, z * 30) * 0.15); return y * 2; });
}

/** 一组树变体 + 摆放位置 → 实例化网格。items: [{v: 变体序号, x, y, z, s, ry, tint}] */
export function instanced(variants, items, material) {
  const grp = new THREE.Group(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  variants.forEach((geo, vi) => {
    const list = items.filter((it) => it.v === vi);
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((it, i) => {
      e.set((it.tilt || 0) * (Math.sin(it.ry * 3)), it.ry, (it.tilt || 0) * Math.cos(it.ry * 2)); q.setFromEuler(e);
      sc.set(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sx || 1)); p.set(it.x, it.y, it.z);
      mesh.setMatrixAt(i, m4.compose(p, q, sc));
      mesh.setColorAt(i, col.setRGB(it.tint?.[0] ?? 1, it.tint?.[1] ?? 1, it.tint?.[2] ?? 1));
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    grp.add(mesh);
  });
  return grp;
}

// ---------------- 草叶 / 花 / 麦穗：大量实例，着色器里摆动 ----------------
function bladeGeometry() {
  // 一片弯曲的草叶：4 段、9 个顶点，高 1、宽 1（实例里再缩放）
  const pos = [], col = [], idx = [], segs = 4;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = (1 - t) * 0.5;
    if (i < segs) { pos.push(-w, t, 0, w, t, 0); col.push(t, 0, 0, t, 0, 0); }
    else { pos.push(0, 1, 0); col.push(1, 0, 0); }
  }
  for (let i = 0; i < segs - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const a = (segs - 1) * 2; idx.push(a, a + 1, a + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uvh', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function flowerGeometry() {
  // 细茎 + 5 瓣花冠（一个扁平的五角星）+ 花心
  const pos = [], h = [], idx = [];
  const add = (x, y, z, k) => { pos.push(x, y, z); h.push(y, k, 0); return pos.length / 3 - 1; };
  const s0 = add(-0.06, 0, 0, 0), s1 = add(0.06, 0, 0, 0), s2 = add(-0.04, 0.9, 0, 0), s3 = add(0.04, 0.9, 0, 0); idx.push(s0, s1, s2, s1, s3, s2);
  const c = add(0, 1.0, 0, 2);
  const ring = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 0.22 : 0.62; ring.push(add(Math.cos(a) * r, 0.96 + (i % 2 ? 0 : 0.05), Math.sin(a) * r, 1)); }
  for (let i = 0; i < 10; i++) idx.push(c, ring[(i + 1) % 10], ring[i]);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uvh', new THREE.Float32BufferAttribute(h, 3)); g.setIndex(idx);
  return g;
}
function wheatGeometry() {
  // 麦秆 + 麦穗（细长的六棱锥）
  const pos = [], h = [], idx = [];
  const add = (x, y, z, k) => { pos.push(x, y, z); h.push(y, k, 0); return pos.length / 3 - 1; };
  const a = add(-0.04, 0, 0, 0), b = add(0.04, 0, 0, 0), c = add(-0.03, 0.72, 0, 0), d = add(0.03, 0.72, 0, 0); idx.push(a, b, c, b, d, c);
  const base = [], top = add(0, 1.0, 0, 1);
  for (let i = 0; i < 6; i++) { const t = i / 6 * Math.PI * 2; base.push(add(Math.cos(t) * 0.09, 0.72, Math.sin(t) * 0.09, 1)); }
  const mid = []; for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6 * Math.PI * 2; mid.push(add(Math.cos(t) * 0.1, 0.86, Math.sin(t) * 0.1, 1)); }
  for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; idx.push(base[i], base[j], mid[i], base[j], mid[j], mid[i], mid[i], mid[j], top); }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uvh', new THREE.Float32BufferAttribute(h, 3)); g.setIndex(idx);
  return g;
}

// ---------------- 体素主题的草、花、麦子：小方块搭的，和原版体素树、灌木同一种画风 ----------------
// 每个部件是一个没有底面的方块（底面贴地看不见），带真实的面法线，所以每个面明暗不同、有方块感。
// uvh：x = 高度（0 底 / 1 顶，风只吹动顶部），y = 部位（0 茎 / 1 花瓣、麦穗 / 2 花心）
function voxelParts(parts) {
  const pos = [], nor = [], uvh = [], idx = [];
  for (const [w, y0, y1, part, dx = 0, dz = 0] of parts) {
    const b = new THREE.BoxGeometry(w, y1 - y0, w); b.translate(dx, (y0 + y1) / 2, dz);
    const P = b.attributes.position, N = b.attributes.normal, I = b.index.array, base = pos.length / 3;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); uvh.push(P.getY(i), part, 0); }
    for (let g = 0; g < 6; g++) { if (g === 3) continue; for (let k = g * 6; k < g * 6 + 6; k++) idx.push(base + I[k]); }   // 第 4 组是底面，不要
    b.dispose();
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uvh', new THREE.Float32BufferAttribute(uvh, 3)); g.setIndex(idx);
  return g;
}
/** 草：一根方柱草茎（实例宽高在着色器里定）；10 个三角形 */
const voxelBlade = () => voxelParts([[1, 0, 1, 0]]);
/** 花：细方茎 + 一片扁方花瓣 + 一颗小方花心 */
const voxelFlower = () => voxelParts([[0.14, 0, 0.84, 0], [0.62, 0.8, 0.96, 1], [0.26, 0.94, 1.06, 2]]);
/** 麦子：方麦秆 + 两节上小下大的方麦穗 */
const voxelWheat = () => voxelParts([[0.09, 0, 0.7, 0], [0.22, 0.66, 0.85, 1], [0.17, 0.84, 1.0, 1]]);

/** 实例化的小草类材质。kind: grass | flower | wheat */
function bladeMaterial(kind) {
  const vox = STYLE.blocky;
  const m = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: kind === 'wheat' ? 0.7 : 0.9, metalness: 0, side: vox ? THREE.FrontSide : THREE.DoubleSide, envMapIntensity: 0.8 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 uvh; attribute vec4 iPos; attribute vec4 iShape; attribute vec3 iTint; attribute vec3 iTint2;
        uniform float uTime; uniform float uWind;
        varying vec3 vTint; varying float vH; varying float vPart; varying vec3 vWP2;
        ${GLSL_NOISE}
        ${kind === 'seagrass' ? GLSL_WAVES : ''}`)
      .replace('#include <beginnormal_vertex>', vox ? 'vec3 objectNormal = vec3(normal.x * cos(iPos.w) - normal.z * sin(iPos.w), normal.y, normal.x * sin(iPos.w) + normal.z * cos(iPos.w));' : 'vec3 objectNormal = normalize(vec3(sin(iPos.w) * 0.25, 1.0, cos(iPos.w) * 0.25));')
      .replace('#include <begin_vertex>', /* glsl */`
        float hgt = iShape.x, wid = iShape.y, lean = iShape.z, ph = iShape.w;
        ${vox && kind === 'grass' ? 'hgt *= 0.72; wid *= 1.5;' : vox && kind === 'seagrass' ? 'hgt *= 0.85; wid *= 1.4;' : vox ? 'wid *= 1.15;' : ''}
        vec3 transformed = vec3(position.x * wid, position.y * hgt, position.z * wid);
        float ca = cos(iPos.w), sa = sin(iPos.w);
        transformed = vec3(transformed.x * ca - transformed.z * sa, transformed.y, transformed.x * sa + transformed.z * ca);
        float t = uvh.x;
        // 风：大尺度阵风噪声 + 小幅高频抖动，越靠近顶端弯得越多
        float gust = snoise2(iPos.xz * 0.35 + vec2(uTime * 0.35, uTime * 0.12)) * 0.5 + 0.5;
        ${kind === 'seagrass' ? `
        // 水下：跟着波浪的水质点轨道运动来回摆
        vec3 orb = waveOrbit(iPos.xz, iPos.y + t * hgt, uTime);
        transformed.xz += orb.xz * 2.4 * t * t + vec2(sin(uTime * 1.3 + ph), cos(uTime * 1.1 + ph)) * 0.006 * t;` : `
        float bend = (lean + gust * 0.9 * uWind + sin(uTime * 2.2 + ph) * 0.12) * t * t;
        vec2 dir = normalize(vec2(1.0, 0.45) + vec2(sin(ph), cos(ph)) * 0.35);
        transformed.xz += dir * bend * hgt * 0.55;
        transformed.y *= 1.0 - bend * bend * 0.12;`}
        transformed += iPos.xyz;
        vTint = mix(iTint2, iTint, uvh.y > 0.5 ? 1.0 : 0.0);
        vTint = uvh.y > 1.5 ? vec3(0.95, 0.75, 0.2) : vTint;
        vH = t; vPart = uvh.y; vWP2 = transformed;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uCloud; uniform vec3 uSunCol; uniform float uCaustic; varying vec3 vTint; varying float vH; varying float vPart; varying vec3 vWP2;
        ${GLSL_NOISE}${GLSL_CLOUD}${GLSL_CAUSTIC}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${vox && kind === 'grass' ? 'diffuseColor.rgb = vTint * mix(0.62, 1.12, vH);' : kind === 'grass' || kind === 'seagrass' ? 'diffuseColor.rgb = vTint * mix(0.5, 1.18, vH);' : kind === 'wheat' ? 'diffuseColor.rgb = vTint * (vPart > 0.5 ? 1.0 : mix(0.55, 0.95, vH));' : 'diffuseColor.rgb = vPart > 0.5 ? vTint : vec3(0.18, 0.36, 0.1) * mix(0.6, 1.0, vH);'}
        diffuseColor.rgb *= 1.0 - cloudShadow(vWP2.xz, uTime) * 0.22 * uCloud;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        { vec3 L = directionalLights[0].direction; vec3 V = normalize(vViewPosition);
          float back = pow(clamp(dot(V, L), 0.0, 1.0), 2.0) * vH;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[0].color * back * 0.45; }
        #endif
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * caustics(vWP2, uTime) * uCaustic;`);
  };
  m.customProgramCacheKey = () => 'hq-blade-' + kind + (vox ? '-vox' : '');
  return m;
}

const BLADE_MATS = {};
/** list: [{x,y,z, h, w, lean, rot, tint:[r,g,b], tint2:[r,g,b]}]；cull: 按实例范围做视锥剔除（游戏里分区块用） */
export function bladeField(kind, list, { cull = false } = {}) {
  const vox = STYLE.blocky;
  const g = vox ? (kind === 'grass' || kind === 'seagrass' ? voxelBlade() : kind === 'flower' ? voxelFlower() : voxelWheat()) : kind === 'grass' || kind === 'seagrass' ? bladeGeometry() : kind === 'flower' ? flowerGeometry() : wheatGeometry();
  // 打乱顺序（固定种子）：远处只画前一部分实例时，草是均匀变稀，而不是整块消失
  if (list.length > 64) { list = list.slice(); let sd = (list.length * 2654435761) >>> 0; for (let i = list.length - 1; i > 0; i--) { sd = (sd * 1664525 + 1013904223) >>> 0; const j = sd % (i + 1), t = list[i]; list[i] = list[j]; list[j] = t; } }
  const n = list.length, P = new Float32Array(n * 4), S = new Float32Array(n * 4), T = new Float32Array(n * 3), T2 = new Float32Array(n * 3);
  list.forEach((b, i) => {
    P.set([b.x, b.y, b.z, b.rot], i * 4); S.set([b.h, b.w, b.lean || 0, b.ph ?? i * 0.37], i * 4);
    T.set(b.tint, i * 3); T2.set(b.tint2 || b.tint, i * 3);
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(P, 4)); g.setAttribute('iShape', new THREE.InstancedBufferAttribute(S, 4));
  g.setAttribute('iTint', new THREE.InstancedBufferAttribute(T, 3)); g.setAttribute('iTint2', new THREE.InstancedBufferAttribute(T2, 3));
  // 体素主题：方块草茎比细草叶粗、占地大，用更少的实例就能铺满（实例顺序已打乱，取前面一部分是均匀变稀）
  const keep = vox ? Math.ceil(n * (kind === 'grass' || kind === 'seagrass' ? 0.5 : kind === 'flower' ? 0.55 : 0.6)) : n;
  g.instanceCount = keep; g.userData.n = keep;
  if (cull && n) {
    // 按实例位置算包围球，区块不在画面里时整块跳过
    const bb = new THREE.Box3(); const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) bb.expandByPoint(v.set(P[i * 4], P[i * 4 + 1], P[i * 4 + 2]));
    g.boundingSphere = bb.getBoundingSphere(new THREE.Sphere()); g.boundingSphere.radius += 0.4;
  } else g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200);
  const mesh = new THREE.Mesh(g, BLADE_MATS[kind] ||= bladeMaterial(kind));
  mesh.frustumCulled = cull; mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = kind + '-field';
  return mesh;
}

export const foliage = {
  tree: () => foliageMaterial({ sway: 1, translucency: 0.4 }),
  bush: () => foliageMaterial({ sway: 0.6, translucency: 0.3 }),
};
export { NZ as vegNoise };
