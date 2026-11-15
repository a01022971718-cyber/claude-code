// buildings.js — 建筑、船、人物等程序化小模型。
// 单位：六边形外接圆半径 = 1；y 向上；原点在底部中心；正面朝 +z。
import { G, rr, pick } from '../geo.js';
import { PAL } from '../palette.js';

const PI = Math.PI;
const seedOf = (rng) => Math.floor(rng() * 9973);

/** 轴对齐长方体（x0..x1, y0..y1, z0..z1），可按面指定颜色并跳过某些面。
 *  col: 数字，或 { px,nx,py,ny,pz,nz, d }；skip: ['px','ny',...] */
function rawBox(x0, y0, z0, x1, y1, z1, col, skip = []) {
  const g = new G();
  const c = (k) => (typeof col === 'number' ? col : (col[k] ?? col.d));
  const f = {
    px: () => g.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], c('px')),
    nx: () => g.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], c('nx')),
    py: () => g.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], c('py')),
    ny: () => g.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], c('ny')),
    pz: () => g.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], c('pz')),
    nz: () => g.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], c('nz')),
  };
  for (const k in f) if (!skip.includes(k)) f[k]();
  return g;
}
const bx = (w, h, d, col, x = 0, y = 0, z = 0) => G.box(w, h, d, col).translate(x, y, z);
/** 八边形截面的柱体，绕 y 转半个边，使正面（+z）是一个平面而不是棱 */
const oct = (rb, rt, h, col, open = false) => G.cyl(rb, rt, h, 8, col, open).rotateY(PI / 8);
const COS8 = Math.cos(PI / 8);

// ---------------------------------------------------------------- 守屿人小木屋
export function cabin(rng = Math.random) {
  const g = new G();
  const wallY = 0.04, wallH = 0.3, wallTop = wallY + wallH;
  g.add(bx(0.53, 0.04, 0.43, PAL.stoneDark).vary(0.06, seedOf(rng)));
  g.add(bx(0.5, wallH, 0.4, PAL.wall, 0, wallY, 0).vary(0.04, seedOf(rng)));
  // 屋顶：檐口出挑
  g.add(G.roof(0.64, 0.2, 0.5, PAL.roof).translate(0, wallTop, 0).vary(0.06, seedOf(rng)));
  // 烟囱（右后坡）
  g.add(bx(0.07, 0.26, 0.07, PAL.stoneDark, 0.16, wallTop - 0.02, -0.06).vary(0.05, seedOf(rng)));
  g.add(bx(0.095, 0.025, 0.095, PAL.stone, 0.16, wallTop + 0.24, -0.06));
  // 门（左）+ 窗（右）
  const zf = 0.2;
  g.add(bx(0.12, 0.2, 0.03, PAL.woodDark, -0.1, wallY, zf));
  g.add(bx(0.1, 0.17, 0.03, PAL.wood, -0.1, wallY, zf + 0.004));
  g.add(bx(0.14, 0.12, 0.03, PAL.woodDark, 0.13, wallY + 0.1, zf));
  g.add(bx(0.1, 0.08, 0.03, PAL.lampGlow, 0.13, wallY + 0.12, zf + 0.004));
  // 木台阶
  g.add(bx(0.18, 0.02, 0.1, PAL.woodLight, -0.1, 0, 0.27));
  g.add(bx(0.18, 0.04, 0.06, PAL.wood, -0.1, 0, 0.235));
  return {
    static: g,
    anchors: { chimney: [0.16, wallTop + 0.27, -0.06], door: [-0.1, 0, 0.38] },
  };
}

// ---------------------------------------------------------------- 风车
export function windmill(rng = Math.random) {
  const g = new G();
  const H = 1.3;
  const tower = oct(0.38, 0.24, H, PAL.wall, true).gradientY(PAL.wallShade, PAL.wall, 0, 0.6).vary(0.05, seedOf(rng));
  g.add(tower);
  g.add(oct(0.405, 0.385, 0.14, PAL.stone).vary(0.06, seedOf(rng)));
  // 环廊
  g.add(oct(0.41, 0.41, 0.03, PAL.wood).translate(0, 0.3, 0).vary(0.05, seedOf(rng)));
  // 帽顶
  g.add(G.cone(0.31, 0.4, 8, PAL.roof).translate(0, H, 0).vary(0.06, seedOf(rng)));
  g.add(G.cone(0.025, 0.07, 4, PAL.woodDark).translate(0, H + 0.4, 0));
  // 门
  g.add(bx(0.12, 0.22, 0.08, PAL.woodDark, 0, 0, 0.35));
  // 窗：y=0.7 与 y=1.0，贴在塔面上
  const face = (y) => (0.38 - 0.14 * y / H) * COS8;
  g.add(bx(0.07, 0.1, 0.03, PAL.ink, 0, 0.62, face(0.67)));
  g.add(bx(0.06, 0.09, 0.03, PAL.lampGlow, 0, 0.95, face(1.0)));

  // 扇叶：XY 平面，原点在轮毂
  const s = new G();
  s.add(G.cyl(0.05, 0.045, 0.07, 5, PAL.woodDark).translate(0, -0.035, 0).rotateX(PI / 2));
  for (let i = 0; i < 4; i++) {
    const b = new G();
    b.add(rawBox(-0.018, 0.04, -0.015, 0.018, 0.75, 0.015, PAL.woodDark));
    const q = [[0.018, 0.22, 0], [0.16, 0.28, 0], [0.16, 0.72, 0], [0.018, 0.74, 0]];
    b.quad(q[0], q[1], q[2], q[3], PAL.cream).quad(q[3], q[2], q[1], q[0], PAL.cream);
    s.add(b.rotateZ(i * PI / 2));
  }
  return {
    static: g,
    parts: { sails: { g: s, at: [0, 1.15, 0.38] } },
    anchors: { door: [0, 0, 0.5] },
  };
}

// ---------------------------------------------------------------- 灯塔
export function lighthouse(rng = Math.random) {
  const g = new G();
  const y0 = 0.12, y1 = 1.6, n = 4;
  const rAt = (y) => 0.36 + (0.22 - 0.36) * (y - y0) / (y1 - y0);
  for (let i = 0; i < n; i++) {
    const a = y0 + (y1 - y0) * i / n, b = y0 + (y1 - y0) * (i + 1) / n;
    g.add(oct(rAt(a), rAt(b), b - a, i % 2 ? PAL.roof : PAL.white, true).translate(0, a, 0).vary(0.04, seedOf(rng)));
  }
  g.add(oct(0.4, 0.385, 0.14, PAL.stone).vary(0.07, seedOf(rng)));
  // 平台 + 栏杆
  const py = y1;
  g.add(oct(0.31, 0.31, 0.04, PAL.woodDark).translate(0, py, 0));
  const top = py + 0.04;
  for (let i = 0; i < 8; i++) {
    const a = PI / 8 + i * PI / 4;
    g.add(G.cyl(0.012, 0.012, 0.1, 3, PAL.stone, true).translate(Math.sin(a) * 0.29, top, Math.cos(a) * 0.29));
  }
  g.add(oct(0.3, 0.3, 0.016, PAL.roofDark, true).translate(0, top + 0.1, 0));
  // 灯室 + 小圆锥顶
  g.add(oct(0.13, 0.13, 0.2, PAL.lampGlow, true).translate(0, top, 0));
  g.add(G.cone(0.18, 0.16, 8, PAL.ink).translate(0, top + 0.2, 0));
  // 门、窗
  g.add(bx(0.11, 0.2, 0.08, PAL.woodDark, 0, 0, 0.36));
  const ap = (y) => rAt(y) * COS8;
  g.add(bx(0.06, 0.09, 0.03, PAL.ink, 0, 0.85, ap(0.9)));
  return { static: g, anchors: { lamp: [0, top + 0.1, 0], door: [0, 0, 0.48] } };
}

// ---------------------------------------------------------------- 钟楼
export function bellTower(rng = Math.random) {
  const g = new G();
  const W = 0.58, hb = 1.12, zf = W / 2;
  g.add(bx(W, hb, W, PAL.stone).vary(0.08, seedOf(rng)));
  for (const y of [0.32, 0.55]) g.add(bx(0.62, 0.035, 0.62, PAL.stoneDark, 0, y, 0));
  g.add(bx(0.64, 0.05, 0.64, PAL.stoneDark, 0, hb, 0));
  // 钟室：四根角柱，中间留空
  const fy = hb + 0.05, ty = 1.5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(bx(0.075, ty - fy, 0.075, PAL.stone, sx * 0.235, fy, sz * 0.235).vary(0.06, seedOf(rng)));
  g.add(bx(0.4, 0.03, 0.04, PAL.woodDark, 0, 1.44, 0));
  g.add(bx(0.68, 0.05, 0.68, PAL.stoneDark, 0, ty, 0));
  g.add(G.pyramid(0.7, 0.25, 0.7, PAL.roofTeal).translate(0, ty + 0.05, 0).vary(0.06, seedOf(rng)));
  g.add(G.cone(0.02, 0.07, 4, PAL.gold).translate(0, ty + 0.3, 0));
  // 门
  g.add(bx(0.15, 0.26, 0.04, PAL.woodDark, 0, 0, zf));
  // 金色钟面
  g.add(G.cyl(0.13, 0.13, 0.025, 8, PAL.gold).translate(0, -0.0125, 0).rotateX(PI / 2).translate(0, 0.85, zf + 0.008));
  const zh = zf + 0.0225;
  g.quad([-0.008, 0.85, zh], [0.008, 0.85, zh], [0.008, 0.945, zh], [-0.008, 0.945, zh], PAL.ink);
  g.quad([0, 0.842, zh], [0.075, 0.842, zh], [0.075, 0.858, zh], [0, 0.858, zh], PAL.ink);

  const b = new G();
  b.add(G.cyl(0.02, 0.02, 0.03, 3, PAL.woodDark, true).translate(0, -0.02, 0));
  b.add(G.cyl(0.075, 0.04, 0.12, 6, PAL.gold).translate(0, -0.13, 0));
  b.add(G.cone(0.018, 0.035, 3, PAL.woodDark).rotateX(PI).translate(0, -0.12, 0));
  return { static: g, parts: { bell: { g: b, at: [0, 1.44, 0] } }, anchors: { door: [0, 0, 0.42] } };
}

// ---------------------------------------------------------------- 木栈桥
export function pier(rng = Math.random, len = 1.0) {
  const g = new G();
  const hw = 0.15, n = Math.max(2, Math.round(len / 0.12)), pl = len / n;
  for (let i = 0; i < n; i++) {
    const skip = ['ny'];
    if (i > 0) skip.push('nz');
    if (i < n - 1) skip.push('pz');
    const top = i % 2 ? PAL.woodLight : PAL.wood;
    g.add(rawBox(-hw, 0.02, i * pl, hw, 0.06, (i + 1) * pl, { py: top, d: PAL.woodDark }, skip));
  }
  g.vary(0.04, seedOf(rng));
  const np = Math.max(2, Math.round(len / 0.3) + 1);
  const r = 0.02, step = (len - 0.12) / (np - 1);
  const posts = new G();
  for (let i = 0; i < np; i++) {
    const z = 0.06 + i * step;
    for (const sx of [-1, 1]) {
      const x = sx * (hw + r + 0.005), top = 0.14 + rr(rng, -0.01, 0.015);
      posts.add(rawBox(x - r, -0.5, z - r, x + r, top, z + r, { py: PAL.wood, d: PAL.woodDark }, ['ny']));
    }
  }
  g.add(posts.jitter(0.003, 5).vary(0.05, seedOf(rng)));
  return g;
}

// ---------------------------------------------------------------- 小渔船
export function boat(rng = Math.random) {
  const g = new G();
  const yb = [-0.05, -0.06, -0.05, 0.0];
  const yt = [0.1, 0.09, 0.1, 0.12];
  const zs = [-0.27, -0.02, 0.17, 0.28];
  const tw = [0.1, 0.125, 0.09, 0];
  const bw = [0.05, 0.06, 0.04, 0];
  const yf = [-0.025, -0.035, -0.025, 0.06];
  const iw = tw.map((w) => Math.max(0, w - 0.02));
  const ib = bw.map((w) => w * 0.8);
  const W = PAL.wood, L = PAL.woodLight, D = PAL.woodDark;
  const P = (x, y, z) => [x, y, z];
  for (let i = 0; i < 3; i++) {
    const j = i + 1;
    for (const s of [-1, 1]) {
      const o = (k, x, y) => P(s * x, y, zs[k]);
      // 外壳
      g.quad(o(i, bw[i], yb[i]), o(i, tw[i], yt[i]), o(j, tw[j], yt[j]), o(j, bw[j], yb[j]), W);
      // 舷边
      g.quad(o(i, tw[i], yt[i]), o(i, iw[i], yt[i]), o(j, iw[j], yt[j]), o(j, tw[j], yt[j]), D);
      // 内壁
      g.quad(o(i, iw[i], yt[i]), o(i, ib[i], yf[i]), o(j, ib[j], yf[j]), o(j, iw[j], yt[j]), L);
    }
    // 船底外 / 内
    g.quad(P(-bw[i], yb[i], zs[i]), P(bw[i], yb[i], zs[i]), P(bw[j], yb[j], zs[j]), P(-bw[j], yb[j], zs[j]), D);
    g.quad(P(-ib[i], yf[i], zs[i]), P(ib[i], yf[i], zs[i]), P(ib[j], yf[j], zs[j]), P(-ib[j], yf[j], zs[j]), L);
  }
  // 船尾板
  g.quad(P(-bw[0], yb[0], zs[0]), P(bw[0], yb[0], zs[0]), P(tw[0], yt[0], zs[0]), P(-tw[0], yt[0], zs[0]), W);
  g.quad(P(-ib[0], yf[0], zs[0] + 0.02), P(ib[0], yf[0], zs[0] + 0.02), P(iw[0], yt[0], zs[0] + 0.02), P(-iw[0], yt[0], zs[0] + 0.02), L);
  g.vary(0.05, seedOf(rng));
  // 坐板
  g.add(bx(0.2, 0.02, 0.05, L, 0, 0.03, -0.12));
  g.add(bx(0.19, 0.02, 0.05, L, 0, 0.03, 0.05));
  // 桅杆 + 帆 + 小旗
  const mz = 0.12;
  g.add(G.cyl(0.012, 0.009, 0.44, 4, D).translate(0, -0.03, mz));
  const sa = [0, 0.1, mz + 0.012], sb = [0, 0.38, mz + 0.012], sc = [0, 0.1, -0.12];
  g.tri(sa, sb, sc, PAL.cream).tri(sc, sb, sa, PAL.cream);
  g.tri([0, 0.4, mz], [0, 0.45, mz], [0, 0.425, mz - 0.05], PAL.red);
  return g;
}

// ---------------------------------------------------------------- 补给箱
export function crate(rng = Math.random) {
  const g = new G();
  g.add(bx(0.27, 0.24, 0.27, PAL.wood).vary(0.06, seedOf(rng)));
  g.add(bx(0.3, 0.04, 0.3, PAL.woodDark, 0, 0.24, 0));
  // 四角木条（只做四个竖直外侧面）
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 0.125, z = sz * 0.125, h = 0.02;
    g.add(rawBox(x - h, 0, z - h, x + h, 0.24, z + h, PAL.woodDark, ['py', 'ny']));
  }
  // 红色绳带
  g.add(bx(0.292, 0.03, 0.292, PAL.red, 0, 0.18, 0));
  const t = 0.281;
  g.quad([-0.02, 0.28, 0.1], [0.02, 0.28, 0.1], [0.02, 0.28, -0.1], [-0.02, 0.28, -0.1], PAL.red);
  g.quad([-0.1, 0.281, 0.02], [0.1, 0.281, 0.02], [0.1, 0.281, -0.02], [-0.1, 0.281, -0.02], PAL.red);
  // 金色锁扣
  const zl = 0.148;
  g.quad([-0.025, 0.11, zl], [0.025, 0.11, zl], [0.025, 0.17, zl], [-0.025, 0.17, zl], PAL.gold);
  g.quad([-0.025, 0.17, zl], [0.025, 0.17, zl], [0.025, 0.17, zl - 0.0], [-0.025, 0.17, zl - 0.0], PAL.gold);
  return g;
}

// ---------------------------------------------------------------- Q 版小人
export function person(rng = Math.random, opts = {}) {
  const o = opts || {};
  const shirt = o.shirt ?? PAL.cloth, hat = o.hat ?? 'straw', hatColor = o.hatColor ?? PAL.straw, skin = o.skin ?? PAL.skin;
  const g = new G();
  // 脚
  for (const sx of [-1, 1]) g.add(G.cyl(0.025, 0.025, 0.05, 3, PAL.woodDark, true).translate(sx * 0.03, 0, 0.005));
  // 身体：下窄上宽
  g.add(G.cyl(0.042, 0.058, 0.11, 6, shirt).translate(0, 0.05, 0));
  // 手
  for (const sx of [-1, 1]) g.add(bx(0.028, 0.07, 0.035, shirt, sx * 0.07, 0.085, 0));
  // 头
  const hy = 0.215, hr = 0.065;
  g.add(G.ico(hr, 0, skin).translate(0, hy, 0));
  // 眼睛
  for (const sx of [-1, 1]) {
    const x = sx * 0.026, z = 0.066;
    g.quad([x - 0.008, hy - 0.012, z], [x + 0.008, hy - 0.012, z], [x + 0.008, hy + 0.01, z], [x - 0.008, hy + 0.01, z], PAL.ink);
  }
  if (hat === 'straw') {
    g.add(G.cone(0.12, 0.04, 8, hatColor).translate(0, hy + 0.025, 0));
    g.add(G.cone(0.055, 0.06, 6, hatColor).translate(0, hy + 0.045, 0));
  } else if (hat === 'cap') {
    g.add(G.cone(0.072, 0.065, 6, hatColor).translate(0, hy + 0.02, 0));
    const z0 = 0.05, z1 = 0.1, y = hy + 0.035;
    g.quad([-0.035, y, z0], [0.035, y, z0], [0.035, y - 0.01, z1], [-0.035, y - 0.01, z1], hatColor);
  }
  return g.vary(0.04, seedOf(rng));
}

// ---------------------------------------------------------------- 海鸥
export function gull(rng = Math.random) {
  const g = new G();
  g.add(G.cone(0.04, 0.13, 4, PAL.white).rotateX(-PI / 2).scale(1, 0.85, 1));
  g.add(G.cone(0.04, 0.08, 4, PAL.white).rotateX(PI / 2).scale(1, 0.85, 1));
  g.add(G.pyramid(0.026, 0.045, 0.02, PAL.yellow).rotateX(PI / 2).translate(0, 0, 0.045));
  const y = 0.015;
  for (const s of [-1, 1]) {
    g.quad([s * 0.025, y, 0.04], [s * 0.025, y, -0.05], [s * 0.11, y + 0.03, -0.07], [s * 0.11, y + 0.03, 0.03], PAL.white);
    g.tri([s * 0.11, y + 0.03, 0.03], [s * 0.11, y + 0.03, -0.07], [s * 0.17, y + 0.06, -0.04], PAL.ink);
  }
  return g.vary(0.03, seedOf(rng));
}

// ---------------------------------------------------------------- 小岛碎石与野草
export function isletBase(rng = Math.random) {
  const g = new G();
  const nR = rng() < 0.5 ? 3 : 4, nT = nR === 3 ? 5 : 4;
  const a0 = rng() * PI * 2;
  const cols = [PAL.rock, PAL.rockDark, PAL.rockWarm, PAL.slate];
  for (let i = 0; i < nR; i++) {
    const a = a0 + i * PI * 2 / nR + rr(rng, -0.25, 0.25), d = rr(rng, 0.4, 0.5), r = rr(rng, 0.055, 0.08);
    const rock = i < 3
      ? G.ico(r, 0, cols[i % 4]).scale(1, 0.7, 1).translate(0, r * 0.5, 0)
      : G.cone(r * 0.9, r * 1.1, 5, cols[i % 4]);
    rock.rotateY(rng() * 6).jitter(0.008, i + 3).vary(0.07, seedOf(rng)).translate(Math.sin(a) * d, 0, Math.cos(a) * d);
    g.add(rock);
  }
  const gc = [PAL.grassDeep, PAL.leaf, PAL.leafDark];
  for (let i = 0; i < nT; i++) {
    const a = a0 + (i + 0.5) * PI * 2 / nT + rr(rng, -0.2, 0.2), d = rr(rng, 0.34, 0.55);
    const tuft = new G();
    for (let k = 0; k < 4; k++) {
      const h = rr(rng, 0.07, 0.11), lean = rr(rng, 0.015, 0.035);
      const b = new G().tri([-0.016, 0, 0], [0.016, 0, 0], [lean, h, 0], gc[(i + k) % 3]);
      tuft.add(b.translate(0, 0, 0.01).rotateY(k * PI / 2 + rng() * 0.6));
    }
    g.add(tuft.translate(Math.sin(a) * d, 0, Math.cos(a) * d));
  }
  return g;
}
