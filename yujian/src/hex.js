// 六边形网格（尖顶朝 z 轴，轴向坐标 q,r）。地块外接圆半径 = 1。坐标不设边界，地图可以无限延伸。
export const SQ3 = Math.sqrt(3);
// 六个邻居方向，世界角度依次为 0°,60°,…,300°（x=cos, z=sin）
export const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
export const key = (q, r) => q + ',' + r;
export const unkey = (k) => { const i = k.indexOf(','); return [Number(k.slice(0, i)), Number(k.slice(i + 1))]; };
export const toWorld = (q, r) => [SQ3 * (q + r / 2), 1.5 * r];
export function fromWorld(x, z) {
  const rf = z / 1.5, qf = x / SQ3 - rf / 2;
  let q = Math.round(qf), r = Math.round(rf);
  const s = Math.round(-qf - rf);
  const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s + qf + rf);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return [q, r];
}
export const hexDist = (q1, r1, q2, r2) => (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
export const neighbors = (q, r) => DIRS.map((d) => [q + d[0], r + d[1]]);
// 六个角（单位半径），角度 30°+60°i
export const CORNERS = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i + 30); return [Math.cos(a), Math.sin(a)]; });
/** 在半径 rad 的六边形内均匀取点 */
export function hexPoint(rng, rad = 1) {
  for (let i = 0; i < 20; i++) {
    const x = (rng() * 2 - 1) * rad * SQ3 / 2, z = (rng() * 2 - 1) * rad;
    if (Math.abs(z) <= rad - Math.abs(x) / SQ3) return [x, z];
  }
  return [0, 0];
}
/** 以 (q,r) 为中心、半径 n 的所有格子 */
export function disk(q, r, n) {
  const out = [];
  for (let dq = -n; dq <= n; dq++) for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) out.push([q + dq, r + dr]);
  return out;
}
