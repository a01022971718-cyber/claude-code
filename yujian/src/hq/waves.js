// 波浪物理：海面形状、漂浮物的浮力、水下的轨道运动，全部用同一组 Gerstner 波计算，CPU 和 GPU 结果一致。
// 尺度：1 个单位 = 10 米，所以重力加速度 g = 0.98 单位/秒²；波速按深水色散关系 c = √(g/k)。
export const G = 0.98;
// 方向、波长（单位）、陡度、振幅（单位）
export const WAVES = [
  { dir: [1.0, 0.35], L: 9.0, steep: 0.5, amp: 0.075 },
  { dir: [0.6, 1.0], L: 5.3, steep: 0.45, amp: 0.045 },
  { dir: [-0.4, 1.0], L: 3.1, steep: 0.4, amp: 0.026 },
  { dir: [1.0, -0.7], L: 2.2, steep: 0.35, amp: 0.015 },
  { dir: [-1.0, -0.2], L: 1.6, steep: 0.3, amp: 0.009 },
].map((w) => {
  const l = Math.hypot(w.dir[0], w.dir[1]), k = (2 * Math.PI) / w.L;
  return { ...w, dx: w.dir[0] / l, dz: w.dir[1] / l, k, c: Math.sqrt(G / k), Q: w.steep / (k * w.amp * 5) };
});
const f5 = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(+v.toFixed(6)));

/** GLSL：海面顶点位移（在 ocean.js 里调用） */
export const GLSL_WAVES = /* glsl */`
vec3 gerstnerSum(vec2 p, float t, inout vec3 T, inout vec3 B, inout float crest){
  vec3 disp = vec3(0.0);
  ${WAVES.map((w) => `{
    vec2 d = vec2(${f5(w.dx)}, ${f5(w.dz)}); float k = ${f5(w.k)}; float a = ${f5(w.amp)}; float Q = ${f5(w.Q)};
    float f = k * (dot(d, p) - ${f5(w.c)} * t); float s = sin(f), c = cos(f);
    T += vec3(-Q * d.x * d.x * a * k * s, d.x * a * k * c, -Q * d.x * d.y * a * k * s);
    B += vec3(-Q * d.x * d.y * a * k * s, d.y * a * k * c, -Q * d.y * d.y * a * k * s);
    crest += s * a;
    disp += vec3(Q * a * d.x * c, a * s, Q * a * d.y * c);
  }`).join('\n  ')}
  return disp;
}
// 水下 y 深处（y < 0）的水质点轨道位移：振幅随深度按 e^(k·y) 衰减
vec3 waveOrbit(vec2 p, float y, float t){
  vec3 o = vec3(0.0);
  ${WAVES.map((w) => `{
    vec2 d = vec2(${f5(w.dx)}, ${f5(w.dz)}); float k = ${f5(w.k)}; float a = ${f5(w.amp)};
    float f = k * (dot(d, p) - ${f5(w.c)} * t); float e = exp(k * min(y, 0.0));
    o += vec3(a * d.x * cos(f) * e, a * sin(f) * e, a * d.y * cos(f) * e);
  }`).join('\n  ')}
  return o;
}
`;

/** CPU：(x,z) 处的海面高度和法线；att 为近岸衰减（0..1） */
export function waveAt(x, z, t, att = 1) {
  let h = 0, tx = 1, ty = 0, tz = 0, bx = 0, by = 0, bz = 1;
  for (const w of WAVES) {
    const f = w.k * (w.dx * x + w.dz * z - w.c * t), s = Math.sin(f), c = Math.cos(f), a = w.amp * att, Q = w.Q;
    h += a * s;
    tx += -Q * w.dx * w.dx * a * w.k * s; ty += w.dx * a * w.k * c; tz += -Q * w.dx * w.dz * a * w.k * s;
    bx += -Q * w.dx * w.dz * a * w.k * s; by += w.dz * a * w.k * c; bz += -Q * w.dz * w.dz * a * w.k * s;
  }
  // 法线 = B × T
  let nx = by * tz - bz * ty, ny = bz * tx - bx * tz, nz = bx * ty - by * tx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return { h, nx, ny, nz };
}
/** CPU：水下 y 深处的水流速度（轨道运动的时间导数），鱼和水母随水漂动用 */
export function currentAt(x, y, z, t) {
  let vx = 0, vy = 0, vz = 0;
  for (const w of WAVES) {
    const f = w.k * (w.dx * x + w.dz * z - w.c * t), e = Math.exp(w.k * Math.min(y, 0)), om = w.k * w.c, a = w.amp * e;
    vx += a * om * Math.sin(f) * w.dx; vz += a * om * Math.sin(f) * w.dz; vy += -a * om * Math.cos(f);
  }
  return [vx, vy, vz];
}
