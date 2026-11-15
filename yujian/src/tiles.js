// 地块几何：每种地块 = 六边形底座（顶面、倒角、岩壁、水下沙滩裙边）+ 程序化装饰。
import { G, mulberry32, hash3, lin, rr, pick } from './geo.js';
import { PAL, FLOWER_COLORS } from './palette.js';
import { CORNERS, hexPoint } from './hex.js';
import { TOP } from './config.js';
import * as N from './models/nature.js';
import * as B from './models/buildings.js';

let DETAIL = 1;
export const setDetail = (d) => { DETAIL = d; };
const cnt = (n) => Math.max(1, Math.round(n * DETAIL));
const mix = (a, b, t) => { const x = lin(a), y = lin(b); return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]; };

// 小木屋在出生地块上的摆放（烟囱冒烟、同伴站位都要用）
export const HOME_POSE = { x: -0.12, z: -0.14, ry: -0.45 };
export const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };

function base(seed, top) {
  const g = new G(), rT = 0.965, yB = TOP - 0.07;
  const h = (i, s) => hash3(seed, i, s) / 4294967296;
  const dark = top.map((v) => v * 0.8);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6, a = CORNERS[i], b = CORNERS[j];
    const tc = top.map((v) => v * (1 + (h(i, 1) - 0.5) * 0.08));
    g.tri([0, TOP, 0], [b[0] * rT, TOP, b[1] * rT], [a[0] * rT, TOP, a[1] * rT], tc);
    g.quad([a[0] * rT, TOP, a[1] * rT], [b[0] * rT, TOP, b[1] * rT], [b[0], yB, b[1]], [a[0], yB, a[1]], dark);
    // 岩壁两层
    const ra = 1.02 + h(i, 2) * 0.05, rb = 1.02 + h(j, 2) * 0.05;
    g.quad([a[0], yB, a[1]], [b[0], yB, b[1]], [b[0], -0.06, b[1]], [a[0], -0.06, a[1]], PAL.cliffA);
    g.quad([a[0], -0.06, a[1]], [b[0], -0.06, b[1]], [b[0] * rb, -0.62, b[1] * rb], [a[0] * ra, -0.62, a[1] * ra], PAL.cliffB);
    // 沙滩裙边：一小截露出水面，其余在浅水下透出来
    const oa = 1.24 + h(i, 3) * 0.2, ob = 1.24 + h(j, 3) * 0.2;
    g.quad([a[0], 0.07, a[1]], [b[0], 0.07, b[1]], [b[0] * ob, -0.13, b[1] * ob], [a[0] * oa, -0.13, a[1] * oa], PAL.sand);
  }
  return g;
}

function scatter(g, rng, n, rad, make, minD = 0.1, taken = []) {
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 8; k++) {
      const [x, z] = hexPoint(rng, rad);
      if (taken.every((t) => (t[0] - x) ** 2 + (t[1] - z) ** 2 > (minD + t[2]) ** 2)) {
        taken.push([x, z, minD]);
        g.add(make(rng).rotateY(rng() * 6.283).translate(x, TOP, z));
        break;
      }
    }
  }
  return taken;
}

const builders = {
  meadow(seed, rng) {
    const g = base(seed, mix(PAL.grass, rng() < 0.5 ? PAL.grassDeep : PAL.grassDry, rng() * 0.45)), taken = [];
    if (rng() < 0.22) scatter(g, rng, 1, 0.5, (r) => N.roundTree(r, rr(r, 0.75, 0.95), pick(r, ['blossom', 'blossom', 'warm', 'leaf'])), 0.3, taken);
    if (rng() < 0.5) scatter(g, rng, 1, 0.7, (r) => N.bush(r), 0.16, taken);
    if (rng() < 0.4) scatter(g, rng, 1, 0.7, (r) => N.rock(r, rr(r, 0.7, 1.1)), 0.14, taken);
    scatter(g, rng, cnt(7), 0.82, (r) => N.grassTuft(r), 0.05, taken);
    scatter(g, rng, cnt(5), 0.8, (r) => N.flower(r, pick(r, FLOWER_COLORS)), 0.05, taken);
    return g;
  },
  forest(seed, rng, o) {
    const g = base(seed, mix(PAL.forestFloor, PAL.grassDeep, rng() * 0.5)), taken = [];
    scatter(g, rng, o.harvested ? cnt(3) : cnt(9), 0.74, (r) => (r() < 0.82 ? N.conifer(r, rr(r, 0.8, 1.2)) : N.roundTree(r, rr(r, 0.8, 1), pick(r, ['leaf', 'leaf', 'blossom', 'warm']))), 0.13, taken);
    if (o.harvested) scatter(g, rng, cnt(4), 0.7, (r) => N.stump(r), 0.1, taken);
    scatter(g, rng, 2, 0.8, (r) => N.mushroom(r), 0.05, taken);
    scatter(g, rng, 1, 0.8, (r) => N.bush(r), 0.08, taken);
    return g;
  },
  mountain(seed, rng) {
    const g = base(seed, mix(PAL.grassDeep, PAL.rockWarm, 0.55));
    const ox = rr(rng, -0.1, 0.1), oz = rr(rng, -0.1, 0.1), a0 = rng() * 6.283;
    g.add(N.peak(rng, rr(rng, 0.56, 0.66), rr(rng, 1.3, 1.7)).rotateY(rng() * 6.283).translate(ox, TOP, oz));
    for (let i = 0; i < 2; i++) {
      const a = a0 + i * 2.2 + rr(rng, -0.3, 0.3), d = rr(rng, 0.42, 0.5);
      g.add(N.peak(rng, rr(rng, 0.28, 0.36), rr(rng, 0.6, 0.95)).rotateY(rng() * 6.283).translate(ox + Math.cos(a) * d, TOP, oz + Math.sin(a) * d));
    }
    const taken = [[ox, oz, 0.45]];
    scatter(g, rng, cnt(3), 0.82, (r) => N.rock(r, rr(r, 0.8, 1.4)), 0.08, taken);
    scatter(g, rng, cnt(2), 0.82, (r) => N.conifer(r, rr(r, 0.55, 0.75)), 0.1, taken);
    return g;
  },
  garden(seed, rng, o) {
    const g = base(seed, mix(PAL.soil, PAL.soilDark, rng() * 0.4)), rows = new G();
    [-0.45, -0.15, 0.15, 0.45].forEach((z, i) => {
      rows.add(N.soilRow(rng, 1.25).translate(0, 0, z));
      for (let j = 0; j < 4; j++) {
        const m = o.harvested ? N.sprout(rng) : (i % 2 ? N.pumpkin(rng) : N.cabbage(rng));
        rows.add(m.rotateY(rng() * 6.283).translate((j - 1.5) * 0.3 + rr(rng, -0.03, 0.03), 0.04, z));
      }
    });
    return g.add(rows.rotateY(Math.floor(rng() * 3) * Math.PI / 3).translate(0, TOP, 0));
  },
  wheat(seed, rng, o) {
    const g = base(seed, mix(PAL.straw, PAL.wheatDark, 0.35)), rows = new G();
    for (const [z, xs] of [[-0.52, [-0.3, 0.3]], [-0.17, [-0.56, 0, 0.56]], [0.17, [-0.56, 0, 0.56]], [0.52, [-0.3, 0.3]]]) {
      for (const x of xs) rows.add((o.harvested ? N.stubblePatch(rng, 0.5, 0.3) : N.wheatPatch(rng, 0.5, 0.3)).translate(x, 0, z));
    }
    if (o.harvested) for (let i = 0; i < 2; i++) rows.add(N.hayBale(rng).rotateY(rng() * 3).translate(rr(rng, -0.4, 0.4), 0, rr(rng, -0.3, 0.3)));
    return g.add(rows.rotateY(Math.floor(rng() * 3) * Math.PI / 3).translate(0, TOP, 0));
  },
  harbor(seed, rng, o) {
    const g = base(seed, mix(PAL.sand, PAL.sandWet, rng() * 0.3)), th = (o.dir || 0) * Math.PI / 3, cx = Math.cos(th), sz = Math.sin(th);
    g.add(B.pier(rng, 1.2).rotateY(Math.PI / 2 - th).translate(cx * 0.42, TOP - 0.03, sz * 0.42));
    const taken = [[cx * 0.6, sz * 0.6, 0.3], [cx * 0.2, sz * 0.2, 0.2]];
    scatter(g, rng, 2, 0.6, (r) => B.crate(r).scale(0.5), 0.12, taken);
    scatter(g, rng, 1, 0.7, (r) => N.rock(r, 1.1), 0.1, taken);
    scatter(g, rng, cnt(3), 0.85, (r) => N.reed(r), 0.05, taken);
    scatter(g, rng, cnt(3), 0.8, (r) => N.grassTuft(r), 0.05, taken);
    return g;
  },
  home(seed, rng) {
    const g = base(seed, mix(PAL.grass, PAL.grassDry, 0.2));
    g.add(B.cabin(rng).static.clone().rotateY(HOME_POSE.ry).translate(HOME_POSE.x, TOP, HOME_POSE.z));
    const taken = [[HOME_POSE.x, HOME_POSE.z, 0.42]];
    scatter(g, rng, 1, 0.75, (r) => N.roundTree(r, 0.8, 'blossom'), 0.2, taken);
    scatter(g, rng, 5, 0.85, (r) => N.grassTuft(r), 0.05, taken);
    scatter(g, rng, 5, 0.82, (r) => N.flower(r, pick(r, FLOWER_COLORS)), 0.05, taken);
    return g;
  },
  islet(seed, rng, o) {
    const g = base(seed, mix(PAL.grassDry, PAL.grass, 0.45));
    if (o.center) g.add(B.isletBase(rng).translate(0, TOP, 0));
    else {
      const taken = [];
      scatter(g, rng, 2, 0.7, (r) => N.rock(r, rr(r, 0.9, 1.5)), 0.12, taken);
      scatter(g, rng, 1, 0.6, (r) => N.bush(r), 0.14, taken);
      scatter(g, rng, cnt(5), 0.82, (r) => N.grassTuft(r), 0.05, taken);
      scatter(g, rng, cnt(3), 0.8, (r) => N.flower(r, pick(r, FLOWER_COLORS)), 0.05, taken);
    }
    return g;
  },
};

/** 生成一个地块的几何（局部坐标，中心在原点）。o: { harvested, dir, center } */
export function buildTile(type, q, r, o = {}) {
  const seed = hash3(q, r, 7);
  return (builders[type] || builders.meadow)(seed, mulberry32(seed), o);
}
// 收获提示标记悬浮的高度
export const MARK_Y = { forest: 1.55, garden: 0.75, wheat: 0.85, harbor: 0.85 };
