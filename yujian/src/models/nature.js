// nature.js — 自然景物：树、灌木、花草、石头、山峰、作物、云。
// 约定：(rng, ...可选参数) => G；原点在底部中心；y 向上。
import { G, rr, pick } from '../geo.js';
import { PAL, FLOWER_COLORS } from '../palette.js';

const TAU = Math.PI * 2;

// ---------- 小工具 ----------
/** 带朝向修正的三角形：cen 为形体内部一点，保证法线朝外（凸/星形体适用） */
function T(g, a, b, c, col, cen) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const mx = (a[0] + b[0] + c[0]) / 3 - cen[0], my = (a[1] + b[1] + c[1]) / 3 - cen[1], mz = (a[2] + b[2] + c[2]) / 3 - cen[2];
  return nx * mx + ny * my + nz * mz >= 0 ? g.tri(a, b, c, col) : g.tri(a, c, b, col);
}
/** 没有底面的圆锥（只有侧面 seg 个三角形） */
function cone0(r, h, seg, col) {
  const g = new G(), cen = [0, h * 0.4, 0], apex = [0, h, 0];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    T(g, [Math.cos(a0) * r, 0, -Math.sin(a0) * r], [Math.cos(a1) * r, 0, -Math.sin(a1) * r], apex, col, cen);
  }
  return g;
}
/** 三棱细尖刺（3 个面）：底在 y0，尖偏移 lean=[dx,dz] */
function spike(g, cx, cz, r, h, col, lean = [0, 0], rot = 0, y0 = 0) {
  const b = [0, 1, 2].map((k) => [cx + Math.cos(rot + (k * TAU) / 3) * r, y0, cz - Math.sin(rot + (k * TAU) / 3) * r]);
  const apex = [cx + lean[0], y0 + h, cz + lean[1]];
  const cen = [(b[0][0] + b[1][0] + b[2][0] + apex[0]) / 4, y0 + h * 0.3, (b[0][2] + b[1][2] + b[2][2] + apex[2]) / 4];
  T(g, b[0], b[1], apex, col, cen); T(g, b[1], b[2], apex, col, cen); T(g, b[2], b[0], apex, col, cen);
  return g;
}
/** 把 y 范围拉伸/压缩到 [y0,y1] */
function span(g, y0, y1) {
  const b = g.bounds(), f = (y1 - y0) / (b.max[1] - b.min[1] || 1), p = g.p;
  for (let i = 1; i < p.length; i += 3) p[i] = (p[i] - b.min[1]) * f + y0;
  return g;
}
/** 底面落到 y = -sink*高度（轻微埋入地面，避免悬空感） */
function ground(g, sink = 0) {
  const b = g.bounds();
  return g.translate(0, -b.min[1] - sink * (b.max[1] - b.min[1]), 0);
}
/** 重新给第 [i0,i1) 个三角形上色 */
function paintTris(g, i0, i1, col) {
  const c = G.merge(new G().tri([0, 0, 0], [0, 0, 0], [0, 0, 0], col)).c;
  for (let t = i0; t < i1; t++) for (let j = 0; j < 9; j++) g.c[t * 9 + j] = c[j];
  return g;
}

// ---------- 树 ----------
export function conifer(rng, s = 1) {
  const h = rr(rng, 0.75, 1.25) * s, R = rr(rng, 0.22, 0.32) * s, g = new G();
  g.add(G.cyl(0.04 * s, 0.032 * s, h * 0.3, 6, PAL.trunk, true));
  const cols = [PAL.pineDark, PAL.pine, PAL.pineLight];
  for (let i = 0; i < 3; i++) {
    const t = G.merge(cone0(R * (1 - i * 0.28), h * 0.36, 8, cols[i]));
    g.add(t.rotateY(rng() * TAU).translate(0, h * (0.16 + 0.24 * i), 0));
  }
  return g.jitter(0.012 * s, 3).vary(0.07);
}

export function roundTree(rng, s = 1, kind = 'leaf') {
  const h = rr(rng, 0.6, 0.9) * s, g = new G();
  const cols = kind === 'blossom' ? [PAL.blossom, PAL.blossomLight]
    : kind === 'warm' ? [PAL.leafWarm, PAL.leafWarm] : [PAL.leafDark, PAL.leaf];
  g.add(G.cyl(0.045 * s, 0.032 * s, h * 0.5, 5, PAL.trunk, true));
  const n = rng() < 0.5 ? 2 : 3;
  const r1 = rr(rng, 0.2, 0.25) * s;
  // 主团块（最高）
  g.add(G.ico(r1, 0, cols[1]).scale(1, 0.92, 1).rotateY(rng() * TAU).translate(0, h - r1 * 0.8, 0));
  const a0 = rng() * TAU;
  for (let i = 0; i < n - 1; i++) {
    const r = r1 * rr(rng, 0.68, 0.86), a = a0 + i * (n === 3 ? Math.PI : 0) + (n === 2 ? 0 : rr(rng, -0.4, 0.4));
    const d = r1 * rr(rng, 0.7, 0.9);
    g.add(G.ico(r, 0, cols[0]).scale(1, 0.9, 1).rotateY(rng() * TAU)
      .translate(Math.cos(a) * d, h * rr(rng, 0.46, 0.56), -Math.sin(a) * d));
  }
  return g.jitter(0.012 * s, 5).vary(kind === 'warm' ? 0.09 : 0.07);
}

export function stump(rng) {
  const h = rr(rng, 0.08, 0.12), r = 0.07, pts = [];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, k = r * rr(rng, 0.92, 1.05); pts.push([Math.cos(a) * k, -Math.sin(a) * k]); }
  const g = G.extrude(pts, 0, h, PAL.woodDark, PAL.woodLight);
  return g.jitter(0.004, 2).vary(0.06);
}

export function bush(rng) {
  const g = new G(), h1 = rr(rng, 0.14, 0.22), r1 = rr(rng, 0.11, 0.15);
  g.add(span(G.ico(r1, 0, PAL.leafDark).rotateY(rng() * TAU), 0, h1));
  if (rng() < 0.7) {
    const r2 = r1 * rr(rng, 0.6, 0.8), a = rng() * TAU, d = r1 * 0.85;
    g.add(span(G.ico(r2, 0, PAL.leaf).rotateY(rng() * TAU), 0, h1 * rr(rng, 0.6, 0.8)).translate(Math.cos(a) * d, 0, -Math.sin(a) * d));
  }
  g.jitter(0.008, 4).vary(0.07);
  return ground(g, 0.06);
}

export function grassTuft(rng) {
  const g = new G(), n = rng() < 0.5 ? 3 : 4;
  const a0 = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + rr(rng, -0.4, 0.4), d = rr(rng, 0.005, 0.025);
    const h = rr(rng, 0.08, 0.16), tilt = rr(rng, 0.02, 0.05);
    spike(g, Math.cos(a) * d, -Math.sin(a) * d, 0.014, h, i % 2 ? PAL.grassDeep : PAL.forestFloor,
      [Math.cos(a) * tilt, -Math.sin(a) * tilt], rng() * TAU);
  }
  return g.vary(0.06);
}

export function flower(rng, color = PAL.pink) {
  const g = new G(), h = rr(rng, 0.1, 0.16), hh = 0.04;
  g.add(G.cyl(0.006, 0.005, h - hh * 0.6, 3, PAL.grassDeep, true));
  g.add(G.cone(0.032, hh, 5, color).rotateX(Math.PI).translate(0, h - hh * 0.55 + hh * 0.5 + 0.0, 0).rotateY(rng() * TAU));
  return g.jitter(0.002, 6).vary(0.05);
}

export function mushroom(rng) {
  const g = new G(), h = rr(rng, 0.08, 0.12), sh = h * 0.55;
  g.add(G.cyl(0.02, 0.016, sh, 5, PAL.cream, true));
  g.add(G.cone(0.055, h - sh * 0.8, 6, rng() < 0.6 ? PAL.red : PAL.wood).scale(1, 0.75, 1).rotateY(rng() * TAU).translate(0, sh * 0.8, 0));
  return g.jitter(0.003, 7).vary(0.05);
}

// ---------- 石头 ----------
export function rock(rng, s = 1) {
  const r = rr(rng, 0.08, 0.18) * s, col = pick(rng, [PAL.rock, PAL.rockDark, PAL.rockWarm]);
  const g = G.ico(r, 0, col).scale(rr(rng, 0.95, 1.2), rr(rng, 0.55, 0.75), rr(rng, 0.9, 1.1)).rotateY(rng() * TAU);
  g.jitter(r * 0.12, 8).vary(0.07);
  return ground(g, 0.1);
}

export function seaRock(rng, s = 1) {
  const g = new G();
  const stone = (rx, y1, x, z, col) => {
    const st = G.ico(1, 0, col).scale(rx, 1, rx * rr(rng, 0.85, 1.1)).rotateY(rng() * TAU);
    return span(st, -0.4, y1).translate(x, 0, z);
  };
  const top = rr(rng, 0.28, 0.45);
  g.add(stone(rr(rng, 0.2, 0.24) * s, top, 0, 0, PAL.rock));
  const n = rng() < 0.5 ? 1 : 2, a0 = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + i * 2.4 + rr(rng, -0.3, 0.3), d = rr(rng, 0.18, 0.24) * s;
    g.add(stone(rr(rng, 0.12, 0.16) * s, rr(rng, 0.15, top * 0.75), Math.cos(a) * d, -Math.sin(a) * d, i ? PAL.rockDark : PAL.rockWarm));
  }
  g.jitter(0.02 * s, 9).vary(0.08);
  return g;
}

export function peak(rng, r = 0.7, h = 1.5) {
  const n = rng() < 0.5 ? 6 : 7, g = new G(), cen = [0, h * 0.3, 0];
  const ring = (rad, y, jr, jy) => {
    const a0 = rng() * 0.4, out = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i + rr(rng, -0.18, 0.18)) / n) * TAU, k = rad * rr(rng, 1 - jr, 1 + jr);
      out.push([Math.cos(a) * k, y + rr(rng, -jy, jy) * h, -Math.sin(a) * k]);
    }
    return out;
  };
  const r0 = ring(r, 0, 0.12, 0), r1 = ring(r * 0.64, h * 0.4, 0.2, 0.04), r2 = ring(r * 0.34, h * 0.7, 0.22, 0.03);
  const apex = [rr(rng, -0.03, 0.03) * r, h, rr(rng, -0.03, 0.03) * r];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // 下段：底部略带暖色
    T(g, r0[i], r0[j], r1[i], PAL.rockWarm, cen);
    T(g, r0[j], r1[j], r1[i], rng() < 0.5 ? PAL.slate : PAL.slateDark, cen);
    // 中段
    T(g, r1[i], r1[j], r2[i], i % 2 ? PAL.slateDark : PAL.slate, cen);
    T(g, r1[j], r2[j], r2[i], i % 2 ? PAL.slate : PAL.slateDark, cen);
    // 雪顶
    T(g, r2[i], r2[j], apex, PAL.snow, cen);
    // 底面
    T(g, [0, 0, 0], r0[j], r0[i], PAL.slateDark, [0, h * 0.3, 0]);
  }
  return g.vary(0.06);
}

// ---------- 作物 ----------
export function cabbage(rng) {
  const g = new G(), r = rr(rng, 0.07, 0.09);
  g.add(G.ico(r, 0, PAL.cabbage).scale(1, 0.85, 1).rotateY(rng() * TAU).translate(0, r * 0.75, 0));
  const a0 = rng() * TAU;
  for (let i = 0; i < 4; i++) {
    const a = a0 + (i / 4) * TAU + rr(rng, -0.2, 0.2);
    // 外叶：压扁的四棱尖叶，贴着球体向外上方翘
    const leaf = cone0(r * 0.5, r * 0.75, 4, PAL.cabbageDark).scale(1, 1, 0.6)
      .rotateZ(-1.15).translate(r * 0.4, r * 0.1, 0).rotateY(a);
    g.add(leaf);
  }
  return ground(g.jitter(0.003, 10).vary(0.07), 0);
}

export function pumpkin(rng) {
  const g = new G(), r = rr(rng, 0.07, 0.1);
  g.add(ground(G.ico(r, 0, PAL.pumpkin).scale(1.1, 0.8, 1.1).rotateY(rng() * TAU).jitter(r * 0.06, 11), 0));
  g.add(G.cyl(0.011, 0.008, r * 0.4, 4, PAL.cabbageDark, true).translate(0, r * 0.8 * 0.82, 0));
  return g.vary(0.07);
}

export function sprout(rng) {
  const g = new G(), a0 = rng() * TAU;
  for (let i = 0; i < 2; i++) {
    const a = a0 + i * Math.PI;
    g.add(cone0(0.02, 0.045, 4, i ? PAL.leaf : PAL.leafDark).scale(1, 1, 0.5).rotateZ(-1.0).translate(0.004, 0.0, 0).rotateY(a));
  }
  return ground(g.vary(0.05), 0);
}

export function soilRow(rng, len = 1.0) {
  const g = new G(), x0 = -len / 2, x1 = len / 2, hb = 0.08, ht = 0.047, h = 0.05;
  const cen = [0, h * 0.5, 0];
  const P = (x, z, y) => [x, y, z];
  const bl = [P(x0, -hb, 0), P(x1, -hb, 0)], br = [P(x0, hb, 0), P(x1, hb, 0)];
  const tl = [P(x0, -ht, h), P(x1, -ht, h)], tr = [P(x0, ht, h), P(x1, ht, h)];
  const quad = (a, b, c, d, col) => { T(g, a, b, c, col, cen); T(g, a, c, d, col, cen); };
  quad(tl[0], tl[1], tr[1], tr[0], PAL.soil);          // 顶面
  quad(br[0], br[1], tr[1], tr[0], PAL.soilDark);      // +z 坡
  quad(bl[0], bl[1], tl[1], tl[0], PAL.soilDark);      // -z 坡
  T(g, bl[0], br[0], tr[0], PAL.soilDark, cen); T(g, bl[0], tr[0], tl[0], PAL.soilDark, cen);
  T(g, bl[1], br[1], tr[1], PAL.soilDark, cen); T(g, bl[1], tr[1], tl[1], PAL.soilDark, cen);
  // 土条上下起伏一点点（只抖顶面，端面不撕裂）
  g.jitter([0.0, 0.004, 0.003], 12);
  return g.vary(0.05);
}

export function wheatPatch(rng, w = 0.5, d = 0.3) {
  const g = new G();
  let cols = Math.max(2, Math.round(w / 0.1)), rows = Math.max(2, Math.round(d / 0.075));
  while (cols * rows > 23) { if (cols > rows) cols--; else rows--; }
  const lean = [rr(rng, 0.02, 0.05), rr(rng, -0.02, 0.02)];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5) / cols - 0.5) * w + rr(rng, -0.018, 0.018);
      const z = ((j + 0.5) / rows - 0.5) * d + rr(rng, -0.015, 0.015);
      const h = rr(rng, 0.22, 0.3);
      spike(g, x, z, 0.026, h, PAL.wheat, [lean[0] + rr(rng, -0.02, 0.02), lean[1] + rr(rng, -0.02, 0.02)], rng() * TAU);
    }
  }
  g.gradientY(PAL.wheat, PAL.wheatDark, 0.08, 0.28);
  return g.vary(0.06);
}

export function stubblePatch(rng, w = 0.5, d = 0.3) {
  const g = new G();
  // 收割后的干草底色
  const k = 0.02, hw = w / 2, hd = d / 2, y = 0.004;
  const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [x + rr(rng, -k, k), y, z + rr(rng, -k, k)]);
  T(g, c[0], c[3], c[2], PAL.grassDry, [0, -1, 0]); T(g, c[0], c[2], c[1], PAL.grassDry, [0, -1, 0]);
  let cols = Math.max(2, Math.round(w / 0.1)), rows = Math.max(2, Math.round(d / 0.075));
  while (cols * rows > 12) { if (cols > rows) cols--; else rows--; }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = ((i + 0.5) / cols - 0.5) * w * 0.92 + rr(rng, -0.02, 0.02);
      const z = ((j + 0.5) / rows - 0.5) * d * 0.9 + rr(rng, -0.015, 0.015);
      spike(g, x, z, rr(rng, 0.02, 0.028), rr(rng, 0.04, 0.06), pick(rng, [PAL.straw, PAL.sand, PAL.straw]),
        [rr(rng, -0.012, 0.012), rr(rng, -0.012, 0.012)], rng() * TAU, y);
    }
  }
  return g.vary(0.06);
}

export function hayBale(rng) {
  const seg = 8, L = 0.2, r = 0.09;
  const g = G.cyl(r, r, L, seg, PAL.straw).translate(0, -L / 2, 0);
  paintTris(g, seg * 2, seg * 4, PAL.wheat);        // 两个端面略深
  g.rotateZ(Math.PI / 2).rotateY(rng() * 0.5 - 0.25).translate(0, r, 0);
  return g.jitter(0.004, 13).vary(0.06);
}

export function reed(rng) {
  const g = new G(), n = rng() < 0.5 ? 3 : 4, a0 = rng() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + rr(rng, -0.3, 0.3), d = rr(rng, 0.01, 0.035);
    const x = Math.cos(a) * d, z = -Math.sin(a) * d, h = rr(rng, 0.25, 0.4);
    const lx = Math.cos(a) * rr(rng, 0.02, 0.06), lz = -Math.sin(a) * rr(rng, 0.02, 0.06);
    const f = 0.76;
    spike(g, x, z, 0.011, h * f + 0.02, i % 2 ? PAL.grassDeep : PAL.forestFloor, [lx * f, lz * f], 0);
    spike(g, x + lx * f, z + lz * f, 0.02, h * (1 - f) + 0.015, PAL.trunk, [lx * (1 - f), lz * (1 - f)], 0.5, h * f);
  }
  return g.vary(0.06);
}

// ---------- 云 ----------
export function cloud(rng) {
  const g = new G(), n = 3 + Math.floor(rng() * 3), yb = -0.2;
  const xs = [-0.5, -0.22, 0.04, 0.3, 0.56].slice(0, 5);
  const order = n === 5 ? [0, 1, 2, 3, 4] : n === 4 ? [0, 1, 3, 4] : [0, 2, 4];
  const radii = [0.24, 0.32, 0.38, 0.3, 0.22];
  for (const k of order) {
    const r = radii[k] * rr(rng, 0.92, 1.08);
    const b = G.ico(r, 0, PAL.white).scale(1.1, 0.85, 0.85).rotateY(rng() * 0.6)
      .translate(xs[k] * 1.0 + rr(rng, -0.03, 0.03), yb + r * 0.55, rr(rng, -0.04, 0.04));
    g.add(b);
  }
  // 平底：把低于 yb 的顶点压平
  for (let i = 1; i < g.p.length; i += 3) if (g.p[i] < yb) g.p[i] = yb;
  g.gradientY(PAL.cream, PAL.white, yb, yb + 0.22);
  return g.jitter(0.01, 14).vary(0.03);
}
