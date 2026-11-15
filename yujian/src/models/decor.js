// decor.js — 小装饰物（篱笆、灯、长椅、井、稻草人等）。每个导出函数 (rng) => G。
// 约定：原点在底部中心，y=0 落地，正面朝 +z。颜色只用 PAL。
import { G, rr, pick } from '../geo.js';
import { PAL } from '../palette.js';

// ---------- 小工具：三角面按期望外法线定向，不依赖渲染器的背面剔除设置 ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

/** 三角面；out 为期望的朝外方向，必要时交换顶点顺序 */
function tri(g, a, b, c, col, out) {
  if (dot(crs(sub(b, a), sub(c, a)), out) < 0) { const t = b; b = c; c = t; }
  g.tri(a, b, c, col);
}
/** 四边形（a,b,c,d 依次相连） */
function quad(g, a, b, c, d, col, out) { tri(g, a, b, c, col, out); tri(g, a, c, d, col, out); }

/** 扇形封面：中心 c，边界 pts（凸或星形），朝向 out */
function fan(g, pts, c, out, col) {
  const n = pts.length;
  for (let i = 0; i < n; i++) tri(g, c, pts[i], pts[(i + 1) % n], col, out);
}
/** 侧带：A、B 两圈同长的点一一相连；c 为形心（用于判断朝外）；sign=-1 则朝内 */
function band(g, A, B, c, col, sign = 1) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const out = [
      sign * ((A[i][0] + A[j][0]) / 2 - c[0]),
      sign * ((A[i][1] + A[j][1]) / 2 - c[1]),
      sign * ((A[i][2] + A[j][2]) / 2 - c[2]),
    ];
    quad(g, A[i], A[j], B[j], B[i], col, out);
  }
}
/** 水平圆（多边形）顶点，中心 (cx, y, cz) */
function ringPts(n, r, cx, y, cz, a0 = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    pts.push([cx + Math.sin(a) * r, y, cz + Math.cos(a) * r]);
  }
  return pts;
}
/** 方锥（四坡顶），底面中心 (cx, y0, cz)，底宽 w，高 h */
function pyr(g, cx, cz, w, y0, h, col) {
  const hw = w / 2, apex = [cx, y0 + h, cz];
  const c = [[cx - hw, y0, cz - hw], [cx + hw, y0, cz - hw], [cx + hw, y0, cz + hw], [cx - hw, y0, cz + hw]];
  for (let i = 0; i < 4; i++) {
    const a = c[i], b = c[(i + 1) % 4];
    tri(g, a, b, apex, col, [(a[0] + b[0]) / 2 - cx, 0, (a[2] + b[2]) / 2 - cz]);
  }
}
/** 沿 z 挤出的凸多边形薄片（pts 为 [x,y]，z 从 z0 到 z1） */
function slab(g, pts, z0, z1, col) {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0] / n; cy += p[1] / n; }
  const F = pts.map((p) => [p[0], p[1], z1]), B = pts.map((p) => [p[0], p[1], z0]);
  fan(g, F, [cx, cy, z1], [0, 0, 1], col);
  fan(g, B, [cx, cy, z0], [0, 0, -1], col);
  band(g, B, F, [cx, cy, (z0 + z1) / 2], col);
}
/** 沿 x 轴的方截面圆木（侧面 8 + 两端各 2 个三角面） */
function sqLog(g, y, z, half, x0, x1, col, capCol) {
  const cs = [[y - half, z - half], [y - half, z + half], [y + half, z + half], [y + half, z - half]];
  for (let i = 0; i < 4; i++) {
    const a = cs[i], b = cs[(i + 1) % 4];
    const out = [0, (a[0] + b[0]) / 2 - y, (a[1] + b[1]) / 2 - z];
    quad(g, [x0, a[0], a[1]], [x1, a[0], a[1]], [x1, b[0], b[1]], [x0, b[0], b[1]], col, out);
  }
  for (const [x, d] of [[x0, -1], [x1, 1]]) {
    quad(g, [x, cs[0][0], cs[0][1]], [x, cs[1][0], cs[1][1]], [x, cs[2][0], cs[2][1]], [x, cs[3][0], cs[3][1]], capCol, [d, 0, 0]);
  }
}

// ---------- 竹篱：5 根竖竿 + 2 根横杆，长 0.8，高 0.22 ----------
export function bambooFence(rng) {
  const g = new G();
  [-0.32, -0.16, 0, 0.16, 0.32].forEach((x, i) => {
    const h = i === 2 ? 0.22 : rr(rng, 0.19, 0.21);
    g.add(G.box(0.022, h, 0.022, PAL.grassDry).translate(x, 0, 0));
  });
  g.add(G.box(0.8, 0.02, 0.018, PAL.leafDark).translate(0, 0.05, 0));
  g.add(G.box(0.8, 0.02, 0.018, PAL.leafDark).translate(0, 0.15, 0));
  return g.vary(0.05, 1);
}

// ---------- 木栅栏：3 根立柱 + 2 根横板，长 0.8，高 0.2 ----------
export function woodFence(rng) {
  const g = new G();
  for (const x of [-0.36, 0, 0.36]) g.add(G.box(0.04, 0.2, 0.04, PAL.woodDark).translate(x, 0, 0));
  for (const y of [0.04, 0.12]) g.add(G.box(0.8, 0.05, 0.014, PAL.wood).translate(0, y, 0.02));
  return g.vary(0.06, 2);
}

// ---------- 矮石墙：5–6 块大小不一的石块，长 0.8，高 0.16，厚约 0.12 ----------
export function stoneWall(rng) {
  const g = new G();
  const n = 5 + Math.floor(rng() * 2);
  const raw = Array.from({ length: n }, () => rr(rng, 0.8, 1.2));
  const sum = raw.reduce((a, b) => a + b, 0);
  const tallIdx = Math.floor(rng() * n);
  let x = -0.4;
  for (let i = 0; i < n; i++) {
    const w = (raw[i] / sum) * 0.8;
    const h = i === tallIdx ? 0.16 : rr(rng, 0.1, 0.14);
    const d = rr(rng, 0.1, 0.12);
    const col = pick(rng, [PAL.stone, PAL.stoneDark, PAL.rock]);
    g.add(G.box(w * 0.94, h, d, col).rotateY(rr(rng, -0.08, 0.08)).translate(x + w / 2, 0, rr(rng, -0.01, 0.01)));
    x += w;
  }
  return g.jitter([0.006, 0, 0.006], 4).vary(0.08, 4);
}

// ---------- 路灯：细木杆 + 横臂 + 挂着的亮黄灯笼，高 0.45 ----------
export function lampPost(rng) {
  const g = new G();
  g.add(G.box(0.07, 0.04, 0.07, PAL.stone));
  g.add(G.cyl(0.018, 0.014, 0.41, 6, PAL.woodDark).translate(0, 0.04, 0));
  g.add(G.box(0.14, 0.02, 0.02, PAL.woodDark).translate(0.07, 0.36, 0));
  g.add(G.box(0.08, 0.08, 0.08, PAL.lampGlow).translate(0.13, 0.27, 0));
  g.add(pyrOf(0.13, 0.35, 0.1, 0.05, PAL.ink));
  return g.vary(0.05, 3);
}
/** 返回一个方锥 G（便于链式 add） */
function pyrOf(cx, y0, w, h, col) { const g = new G(); pyr(g, cx, 0, w, y0, h, col); return g; }

// ---------- 石灯：石座 + 石柱 + 方形灯室（四面小窗）+ 石质四坡小顶，高 0.3 ----------
export function stoneLantern(rng) {
  const g = new G();
  g.add(G.box(0.14, 0.04, 0.14, PAL.stoneDark));
  g.add(G.cyl(0.035, 0.028, 0.1, 6, PAL.stone).translate(0, 0.04, 0));
  g.add(G.box(0.12, 0.09, 0.12, PAL.stone).translate(0, 0.14, 0));
  // 一扇小窗（朝 +z），再绕 y 轴转出另外三面
  const win = new G();
  quad(win, [-0.025, 0.16, 0.063], [0.025, 0.16, 0.063], [0.025, 0.21, 0.063], [-0.025, 0.21, 0.063], PAL.lampGlow, [0, 0, 1]);
  for (let k = 0; k < 4; k++) g.add(win.clone().rotateY(k * Math.PI / 2));
  pyr(g, 0, 0, 0.18, 0.23, 0.07, PAL.stoneDark);
  return g.vary(0.05, 5);
}

// ---------- 长椅：座板、靠背、四条腿，长 0.36，高 0.2 ----------
export function bench(rng) {
  const g = new G();
  for (const x of [-0.15, 0.15]) for (const z of [-0.04, 0.04]) g.add(G.box(0.03, 0.1, 0.03, PAL.woodDark).translate(x, 0, z));
  g.add(G.box(0.36, 0.03, 0.12, PAL.wood).translate(0, 0.1, 0));
  g.add(G.box(0.36, 0.1, 0.025, PAL.woodLight).translate(0, 0.1, -0.07));
  return g.vary(0.06, 6);
}

// ---------- 路牌：木杆 + 两块指向相反方向的箭头木牌，高 0.38 ----------
export function signpost(rng) {
  const g = new G();
  g.add(G.box(0.04, 0.34, 0.04, PAL.woodDark));
  pyr(g, 0, 0, 0.05, 0.34, 0.04, PAL.woodDark);
  const arrowR = [[-0.1, -0.035], [0.06, -0.035], [0.12, 0], [0.06, 0.035], [-0.1, 0.035]];
  slab(g, arrowR.map(([x, y]) => [x + 0.1, y + 0.3]), -0.012, 0.012, PAL.woodLight);
  slab(g, arrowR.map(([x, y]) => [-x - 0.1, y + 0.2]), -0.012, 0.012, PAL.woodLight);
  return g.vary(0.05, 7);
}

// ---------- 花盆：陶土盆 + 一团绿叶 + 3 朵小花，高 0.2 ----------
export function flowerPot(rng) {
  const g = new G();
  g.add(G.cyl(0.055, 0.075, 0.1, 6, PAL.roofDark));
  g.add(G.ico(0.07, 0, PAL.leaf).scale(1, 0.8, 1).translate(rr(rng, -0.004, 0.004), 0.14, rr(rng, -0.004, 0.004)));
  const flowers = [[0.03, 0.03, PAL.pink], [-0.035, 0.01, PAL.yellow], [0, -0.04, PAL.white]];
  for (const [x, z, col] of flowers) g.add(G.cone(0.02, 0.03, 5, col).translate(x, 0.17, z));
  return g.jitter([0.003, 0, 0.003], 8).vary(0.06, 8);
}

// ---------- 木桶：中间略鼓，上下两道深色箍，高 0.2，半径 0.09 ----------
export function barrel(rng) {
  const g = new G();
  g.add(G.cyl(0.08, 0.09, 0.1, 6, PAL.wood));
  g.add(G.cyl(0.09, 0.08, 0.1, 6, PAL.wood).translate(0, 0.1, 0));
  for (const y of [0.03, 0.15]) g.add(G.cyl(0.09, 0.09, 0.02, 6, PAL.ink, true).translate(0, y, 0));
  return g.rotateY(rr(rng, 0, Math.PI)).vary(0.05, 9);
}

// ---------- 水井：石井圈（中空）+ 两根木柱 + 珊瑚红小人字顶 + 蓝色水面，高 0.42，半径 0.16 ----------
export function well(rng) {
  const g = new G();
  const N = 8, R = 0.16, r = 0.13, H = 0.14, WATER = 0.1;
  const lo = ringPts(N, R, 0, 0, 0), hi = ringPts(N, R, 0, H, 0);
  const inLo = ringPts(N, r, 0, WATER, 0), inHi = ringPts(N, r, 0, H, 0);
  band(g, lo, hi, [0, H / 2, 0], PAL.stone);                 // 外壁
  band(g, inLo, inHi, [0, (WATER + H) / 2, 0], PAL.stoneDark, -1); // 内壁（井口以下可见）
  for (let i = 0; i < N; i++) {                              // 井沿顶面
    const j = (i + 1) % N;
    quad(g, hi[i], hi[j], inHi[j], inHi[i], PAL.stoneDark, [0, 1, 0]);
  }
  fan(g, inLo, [0, WATER, 0], [0, 1, 0], PAL.blue);          // 水面
  g.add(G.box(0.03, 0.16, 0.03, PAL.woodDark).translate(-0.13, 0.14, 0));
  g.add(G.box(0.03, 0.16, 0.03, PAL.woodDark).translate(0.13, 0.14, 0));
  g.add(G.roof(0.36, 0.12, 0.2, PAL.roof).translate(0, 0.3, 0));
  return g.vary(0.05, 10);
}

// ---------- 稻草人：十字木架 + 草色身体 + 圆头 + 小草帽 + 红色小围巾，高 0.42 ----------
export function scarecrow(rng) {
  const g = new G();
  g.add(G.box(0.03, 0.42, 0.03, PAL.woodDark));                         // 立柱
  g.add(G.box(0.34, 0.03, 0.03, PAL.wood).translate(0, 0.25, 0));       // 横臂
  g.add(G.box(0.12, 0.16, 0.08, PAL.straw).translate(0, 0.14, 0));      // 身体
  g.add(G.box(0.13, 0.03, 0.09, PAL.red).translate(0, 0.28, 0));        // 围巾
  g.add(G.ico(0.045, 0, PAL.straw).translate(0, 0.34, 0));              // 圆头
  g.add(G.cone(0.06, 0.05, 5, PAL.wheatDark).translate(0, 0.37, 0));    // 草帽顶
  fan(g, ringPts(5, 0.08, 0, 0.37, 0), [0, 0.37, 0], [0, 1, 0], PAL.wheatDark); // 帽檐
  return g.vary(0.05, 11);
}

// ---------- 小旗：细杆 + 顶端三角小旗 + 金色小球，高 0.5 ----------
export function flagPole(rng) {
  const g = new G();
  g.add(G.box(0.05, 0.04, 0.05, PAL.stone));
  g.add(G.cyl(0.012, 0.01, 0.44, 5, PAL.woodDark, true).translate(0, 0.04, 0));
  g.add(G.ico(0.02, 0, PAL.gold).translate(0, 0.48, 0));
  const A = [0.012, 0.45, 0], B = [0.012, 0.37, 0], C = [0.2, 0.41, 0];
  tri(g, A, B, C, PAL.roof, [0, 0, 1]);
  tri(g, A, B, C, PAL.roof, [0, 0, -1]);
  return g.vary(0.05, 12);
}

// ---------- 草垛：圆锥形，下部 PAL.straw，顶部 PAL.wheatDark，高 0.28，半径 0.16 ----------
export function haystack(rng) {
  const g = new G();
  g.add(G.cyl(0.16, 0.09, 0.2, 8, PAL.straw, true));
  g.add(G.cone(0.09, 0.08, 8, PAL.wheatDark).translate(0, 0.2, 0));
  return g.rotateY(rr(rng, 0, Math.PI * 2)).jitter([0.005, 0, 0.005], 13).vary(0.08, 13);
}

// ---------- 踏脚石：5 块扁平圆角石片，沿 z 方向错落，长 0.8，高 0.02 ----------
export function pathStones(rng) {
  const g = new G();
  const h = 0.02;
  [-0.34, -0.17, 0, 0.17, 0.34].forEach((zc) => {
    const cx = rr(rng, -0.05, 0.05), rad = rr(rng, 0.065, 0.08);
    const top = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rr(rng, -0.25, 0.25), r = rad * rr(rng, 0.85, 1.05);
      top.push([cx + Math.sin(a) * r, h, zc + Math.cos(a) * r * 0.9]);
    }
    const low = top.map((p) => [p[0], 0, p[2]]);
    const col = pick(rng, [PAL.stone, PAL.stoneDark]);
    fan(g, top, [cx, h, zc], [0, 1, 0], col);
    band(g, low, top, [cx, h / 2, zc], col);
  });
  return g.vary(0.06, 14);
}

// ---------- 帐篷：人字形，布面 PAL.cream，正面（+z）开口为 PAL.ink 三角，两侧地钉；长 0.4，高 0.26 ----------
export function tent(rng) {
  const g = new G();
  const W = 0.16, H = 0.26, L = 0.2;
  // 两侧坡面（屋脊沿 z 轴）
  quad(g, [-W, 0, L], [0, H, L], [0, H, -L], [-W, 0, -L], PAL.cream, [-1, 0.6, 0]);
  quad(g, [W, 0, -L], [0, H, -L], [0, H, L], [W, 0, L], PAL.cream, [1, 0.6, 0]);
  // 正面三角（+z）与背面三角
  tri(g, [-W, 0, L], [W, 0, L], [0, H, L], PAL.cream, [0, 0, 1]);
  tri(g, [-W, 0, -L], [W, 0, -L], [0, H, -L], PAL.cream, [0, 0, -1]);
  // 入口：略靠外的深色三角
  tri(g, [-0.06, 0, L + 0.002], [0.06, 0, L + 0.002], [0, 0.17, L + 0.002], PAL.ink, [0, 0, 1]);
  // 两侧地钉
  for (const x of [-0.26, 0.26]) for (const z of [-0.12, 0.12]) pyr(g, x, z, 0.03, 0, 0.05, PAL.woodDark);
  return g.vary(0.05, 15);
}

// ---------- 柴堆：6 根短圆木（方截面近似）码成三角形，长 0.3，高 0.16 ----------
export function woodPile(rng) {
  const g = new G();
  const half = 0.0265;
  const rows = [
    [half, -0.053], [half, 0], [half, 0.053],          // 底层 3 根
    [half * 3, -half], [half * 3, half],                // 中层 2 根
    [half * 5, 0],                                      // 顶层 1 根
  ];
  for (const [y, z] of rows) {
    const x0 = -0.15 + rr(rng, 0, 0.01), x1 = 0.15 - rr(rng, 0, 0.01);
    sqLog(g, y, z, half, x0, x1, PAL.wood, PAL.woodLight);
  }
  return g.vary(0.05, 16);
}

// ---------- 清单 ----------
export const DECOR_LIST = [
  { id: 'bambooFence', name: '竹篱', fn: bambooFence },
  { id: 'woodFence', name: '木栅栏', fn: woodFence },
  { id: 'stoneWall', name: '矮石墙', fn: stoneWall },
  { id: 'lampPost', name: '路灯', fn: lampPost },
  { id: 'stoneLantern', name: '石灯', fn: stoneLantern },
  { id: 'bench', name: '长椅', fn: bench },
  { id: 'signpost', name: '路牌', fn: signpost },
  { id: 'flowerPot', name: '花盆', fn: flowerPot },
  { id: 'barrel', name: '木桶', fn: barrel },
  { id: 'well', name: '水井', fn: well },
  { id: 'scarecrow', name: '稻草人', fn: scarecrow },
  { id: 'flagPole', name: '小旗', fn: flagPole },
  { id: 'haystack', name: '草垛', fn: haystack },
  { id: 'pathStones', name: '踏脚石', fn: pathStones },
  { id: 'tent', name: '帐篷', fn: tent },
  { id: 'woodPile', name: '柴堆', fn: woodPile },
];
