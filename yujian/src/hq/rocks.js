// 岩石：圆润的巨石（平滑着色、顶上长苔）和棱角分明的淡紫色山峰（大切面，像原画里的山）。
import * as THREE from 'three';
import { makeNoise, rng } from './noise.js';

const NZ = makeNoise(4242);
const C = (h) => new THREE.Color(h);

function colorize(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** 巨石：半径约 1（实例里缩放），底部压平埋进土里 */
export function boulder(seed = 1, tone = 0, mossy = 1) {
  const R = rng(seed), g = new THREE.IcosahedronGeometry(1, 4), p = g.attributes.position;
  const sx = 0.8 + R() * 0.5, sy = 0.55 + R() * 0.35, sz = 0.8 + R() * 0.4;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = NZ.fbm3(x * 1.3 + seed * 3.1, y * 1.3, z * 1.3 - seed, 4);
    // 少量切削面：让石头既圆又有棱
    const facet = Math.round(NZ.n3(x * 2.2 + seed, y * 2.2, z * 2.2) * 2.5) / 2.5;
    const f = 1 + n * 0.28 + facet * 0.06;
    x *= f * sx; y *= f * sy; z *= f * sz;
    if (y < -0.15) y = -0.15 + (y + 0.15) * 0.25;
    p.setXYZ(i, x, y + 0.12, z);
  }
  g.computeVertexNormals();
  const base = tone ? [C(0x7d7266), C(0x9c8f7f), C(0x4c443b)] : [C(0x7c7a76), C(0x9d9a93), C(0x4a4845)];
  return colorize(g, (x, y, z, nx, ny, nz, c) => {
    const n = NZ.fbm3(x * 2.5, y * 2.5, z * 2.5, 3);
    c.copy(base[0]).lerp(base[1], THREE.MathUtils.clamp(ny * 0.6 + n, 0, 1)).lerp(base[2], THREE.MathUtils.clamp(-ny - 0.1 + n * 0.5, 0, 1));
    const moss = THREE.MathUtils.smoothstep(ny + NZ.n3(x * 4, y * 4, z * 4) * 0.3, 0.72, 0.95) * mossy;
    c.lerp(C(0x5d7f2f), moss * 0.45);
    c.multiplyScalar(THREE.MathUtils.clamp(0.55 + (y + 0.05) * 0.8, 0.55, 1.0));     // 贴地处更暗
  });
}

/** 山峰：底半径 r，高 h；切面分明的岩峰（平面着色），带 surf 属性给岩石材质用 */
export function peak(seed = 1, r = 0.7, h = 1.5) {
  const R = rng(seed);
  let g = new THREE.ConeGeometry(r, h, 18, 12, true); g.translate(0, h / 2, 0);
  const p = g.attributes.position, tip = [ (R() - 0.5) * r * 0.25, (R() - 0.5) * r * 0.25 ];
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.max(0, Math.min(1, y / h)), rad = Math.hypot(x, z), a = Math.atan2(z, x);
    if (rad < 1e-4) { p.setXYZ(i, tip[0], h * (0.95 + R() * 0.06), tip[1]); continue; }
    // 山脊：沿方位角的脊状噪声，越往上越尖
    const ridge = NZ.ridge3(Math.cos(a) * 1.7 + seed * 0.37, t * 2.4, Math.sin(a) * 1.7, 4);
    const warp = NZ.fbm3(x * 2.2 + seed, y * 1.8, z * 2.2, 3);
    let rr = rad * (0.62 + ridge * 0.62 + warp * 0.22);
    rr *= 1 - Math.pow(t, 2.2) * 0.25;
    const ox = tip[0] * t, oz = tip[1] * t;
    let yy = y + warp * h * 0.06 + (t > 0.02 && t < 0.98 ? Math.round(NZ.n3(x * 3, y * 6, z * 3) * 1.5) * h * 0.012 : 0);
    if (t < 0.02) yy = -0.04;
    p.setXYZ(i, Math.cos(a) * rr + ox, yy, Math.sin(a) * rr + oz);
  }
  g = g.toNonIndexed(); g.computeVertexNormals();
  const P2 = g.attributes.position, N2 = g.attributes.normal, col = new Float32Array(P2.count * 3), surf = new Float32Array(P2.count * 3), c = new THREE.Color();
  const rockA = C(0x8b7f96), rockB = C(0xa79bb0), rockD = C(0x4d4458), grass = C(0x5c8a30), snow = C(0xe8e6ee);
  for (let i = 0; i < P2.count; i += 3) {
    const cy = (P2.getY(i) + P2.getY(i + 1) + P2.getY(i + 2)) / 3, cx = (P2.getX(i) + P2.getX(i + 1) + P2.getX(i + 2)) / 3, cz = (P2.getZ(i) + P2.getZ(i + 1) + P2.getZ(i + 2)) / 3, ny = N2.getY(i);
    const v = NZ.n3(cx * 4 + seed, cy * 4, cz * 4), t = cy / h;
    c.copy(rockA).lerp(rockB, THREE.MathUtils.clamp(ny * 0.7 + v * 0.5, 0, 1)).lerp(rockD, THREE.MathUtils.clamp(0.25 - ny * 0.6 - v * 0.6, 0, 0.75));
    const gr = THREE.MathUtils.clamp((0.24 - t) * 5 + ny * 0.9 + v * 0.4 - 0.55, 0, 1);
    c.lerp(grass, gr);
    let sn = 0; if (t > 0.8 && ny > 0.45) { sn = 0.35 + v * 0.25; c.lerp(snow, sn); }
    for (let k = 0; k < 3; k++) { const o = (i + k) * 3; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; surf[o] = gr > 0.5 ? 1 : 0; surf[o + 1] = gr > 0.5 ? 0 : 1; surf[o + 2] = 0; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('surf', new THREE.BufferAttribute(surf, 3));
  return g;
}
