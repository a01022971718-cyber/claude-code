// Gait generation, quasi-static stability, and the evolution-strategy learner.
// Simplified physics: the robot is judged by its static stability margin (how far the
// projected centre of mass sits inside the support polygon), not by rigid-body dynamics.
export const LEGS = ['LF', 'LM', 'LR', 'RF', 'RM', 'RR'];
export const SAFE_MARGIN = 0.2;      // 20 mm safety line on the slope
export const SLOPE_DEG = 18;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const frac = (v) => v - Math.floor(v);

export const defaultGait = () => ({
  phases: { LF: 0, LM: 0, LR: 0, RF: 0, RM: 0, RR: 0 },
  swing: 0.5, stepLen: 0.62, stepH: 0.28, period: 1.3, bodyH: 0.8, lean: 0,
});
export const speedOf = (g) => g.stepLen / (g.period * (1 - g.swing));   // units/s

// ---- 2D geometry on the ground plane (x, z)
export function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
// signed distance from point to hull: positive inside
export function marginOf(hull, c) {
  if (hull.length < 3) return -1;
  let m = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x, ez = b.z - a.z, len = Math.hypot(ex, ez) || 1;
    const d = (ex * (c.z - a.z) - ez * (c.x - a.x)) / len;   // + on the left of a->b (hull is CCW)
    m = Math.min(m, d);
  }
  return m;
}
// where the centre of mass projects on the ground, in the robot's own frame
export function comPoint(form, g, slopeDeg) {
  return { x: 0, z: form.comZ + g.lean - g.bodyH * Math.tan(slopeDeg * Math.PI / 180) };
}

// ---- closed-form straight-line gait: foot position of leg k at cycle phase phi (robot frame)
export function footAt(form, g, k, phi) {
  const n = form.neutral[k];
  const p = frac(phi - g.phases[k]);
  if (p < g.swing) {
    const s = p / g.swing, e = s * s * (3 - 2 * s);
    return { x: n[0], y: g.stepH * Math.sin(Math.PI * s), z: n[2] - g.stepLen / 2 + g.stepLen * e, swing: true };
  }
  const s = (p - g.swing) / (1 - g.swing);
  return { x: n[0], y: 0, z: n[2] + g.stepLen / 2 - g.stepLen * s, swing: false };
}
function reachable(form, g, k, F) {
  const M = form.mounts[k];
  const dx = F.x - M[0], dz = F.z - g.lean - M[2], dy = F.y - g.bodyH - M[1];
  const r = Math.hypot(dx, dz) - form.coxa, D = Math.hypot(r, dy);
  return r > 0.2 && D < form.L1 + form.L2 - 0.03 && D > Math.abs(form.L1 - form.L2) + 0.08;
}

// ---- score one gait over a full cycle
export function evaluate(form, g, slopeDeg = 0, samples = 48) {
  const c = comPoint(form, g, slopeDeg);
  let minMargin = Infinity, minStance = 6, failPhi = -1;
  const curve = [];
  for (let i = 0; i < samples; i++) {
    const phi = i / samples, st = [];
    for (const k of LEGS) { const f = footAt(form, g, k, phi); if (!f.swing) st.push(f); }
    const m = st.length >= 3 ? marginOf(convexHull(st), c) : -1;
    curve.push(m);
    if (m < minMargin) { minMargin = m; failPhi = phi; }
    minStance = Math.min(minStance, st.length);
  }
  let reach = true;
  for (const k of LEGS) {
    const n = form.neutral[k];
    for (const [dz, y] of [[g.stepLen / 2, 0], [-g.stepLen / 2, 0], [0, g.stepH]]) {
      if (!reachable(form, g, k, { x: n[0], y, z: n[2] + dz })) reach = false;
    }
  }
  const swingT = g.period * g.swing;
  const footSpeed = Math.hypot(g.stepLen, 2 * g.stepH) / swingT;
  const servo = footSpeed <= 5.0;                         // servo speed limit, ~500 mm/s at the foot
  const speed = speedOf(g);
  const clearance = Math.min(g.stepH, g.bodyH - 0.27);    // foot lift vs. belly height
  const energy = (g.stepLen + 2.5 * g.stepH) / g.period + 1.2 * Math.max(0, 0.85 - g.bodyH);
  return { minMargin, minStance, failPhi, curve, reach, servo, speed, clearance, energy, feasible: reach && servo && minStance >= 3 && minMargin > 0 };
}

export function reward(ev, w) {
  if (!ev.feasible) return -2 + clamp(ev.minMargin, -1, 0) - (ev.reach ? 0 : 0.5) - (ev.servo ? 0 : 0.5);
  return w.speed * clamp(ev.speed / 2.5, 0, 1.3) + w.stable * clamp(ev.minMargin / 0.5, 0, 1)
    - w.energy * clamp(ev.energy / 3, 0, 1.5) + w.clear * clamp(ev.clearance / 0.4, 0, 1);
}

// ---- evolution strategy over the gait parameters
const BOUNDS = { swing: [0.2, 0.65], stepLen: [0.2, 1.3], stepH: [0.04, 0.5], bodyH: [0.42, 0.95], period: [0.5, 2.2], lean: [0, 0.35] };
const KEYS = Object.keys(BOUNDS);
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(R) { return Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(6.2831853 * R()); }

export function* learn(form, seedGait, w, { slopeDeg = SLOPE_DEG, gens = 14, pop = 8, seed = 1 } = {}) {
  const R = mulberry(seed);
  let mean = JSON.parse(JSON.stringify(seedGait));
  let best = { gait: mean, ev: evaluate(form, mean, slopeDeg) }; best.r = reward(best.ev, w);
  let sigma = 0.3;
  for (let gen = 1; gen <= gens; gen++) {
    const kids = [];
    for (let i = 0; i < pop; i++) {
      const g = JSON.parse(JSON.stringify(mean));
      for (const k of LEGS) g.phases[k] = frac(g.phases[k] + sigma * 0.35 * gauss(R));
      for (const key of KEYS) { const [lo, hi] = BOUNDS[key]; g[key] = clamp(g[key] + sigma * (hi - lo) * 0.6 * gauss(R), lo, hi); }
      const ev = evaluate(form, g, slopeDeg);
      kids.push({ gait: g, ev, r: reward(ev, w) });
    }
    kids.sort((a, b) => b.r - a.r);
    if (kids[0].r > best.r) best = kids[0];
    // recombine the top 3 (and keep the best so far in the mix)
    const top = [best, ...kids.slice(0, 3)];
    const next = JSON.parse(JSON.stringify(best.gait));
    for (const key of KEYS) next[key] = top.reduce((s, t) => s + t.gait[key], 0) / top.length;
    for (const k of LEGS) {
      let sx = 0, sy = 0;
      for (const t of top) { sx += Math.cos(6.2831853 * t.gait.phases[k]); sy += Math.sin(6.2831853 * t.gait.phases[k]); }
      next.phases[k] = frac(Math.atan2(sy, sx) / 6.2831853);
    }
    mean = next; sigma *= 0.86;
    yield { gen, gens, kids, best };
  }
  return best;
}

// ---- runtime walker: world-fixed stance feet, arbitrary forward speed + turn rate
export class Walker {
  constructor(form) { this.form = form; this.g = defaultGait(); this.reset(); }
  reset(x = 0, z = 0, yaw = 0) {
    this.x = x; this.z = z; this.yaw = yaw; this.t = 0; this.idle = 0; this.dist = 0;
    this.feet = {};
    for (const k of LEGS) { const w = this._toWorld(this.form.neutral[k][0], this.form.neutral[k][2]); this.feet[k] = { x: w.x, y: 0, z: w.z, swing: false, lx: w.x, lz: w.z }; }
  }
  setGait(g) { this.g = g; }
  _toWorld(lx, lz, x = this.x, z = this.z, yaw = this.yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
  }
  toLocal(wx, wz) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dx = wx - this.x, dz = wz - this.z;
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }
  get phase() { return frac(this.t / this.g.period); }
  // cmd: { v: fraction of nominal speed (0..1), w: yaw rate rad/s }
  update(dt, cmd) {
    const g = this.g, vNom = speedOf(g);
    const v = vNom * (cmd.v || 0), w = cmd.w || 0;
    const moving = Math.abs(v) > 1e-4 || Math.abs(w) > 1e-4;
    if (!moving) { this.idle += dt; if (this.idle > g.period * 1.1 && LEGS.every(k => !this.feet[k].swing)) return false; }
    else this.idle = 0;
    this.t += dt;
    const phi = this.phase, Tst = g.period * (1 - g.swing);
    this.yaw += w * dt;
    this.x += Math.sin(this.yaw) * v * dt; this.z += Math.cos(this.yaw) * v * dt;
    this.dist += Math.abs(v) * dt;
    for (const k of LEGS) {
      const f = this.feet[k], n = this.form.neutral[k];
      const p = frac(phi - g.phases[k]);
      if (p < g.swing) {
        if (!f.swing) { f.swing = true; f.lx = f.x; f.lz = f.z; }
        // touchdown target: where the neutral point will be when this foot lands, plus half a stride ahead
        const rem = (g.swing - p) * g.period;
        const yawT = this.yaw + w * (rem + Tst / 2);
        const xT = this.x + Math.sin(this.yaw) * v * rem, zT = this.z + Math.cos(this.yaw) * v * rem;
        const tgt = this._toWorld(n[0], n[2] + v * Tst / 2, xT, zT, yawT);
        const s = p / g.swing, e = s * s * (3 - 2 * s);
        f.x = f.lx + (tgt.x - f.lx) * e; f.z = f.lz + (tgt.z - f.lz) * e;
        f.y = g.stepH * Math.sin(Math.PI * s);
      } else { f.swing = false; f.y = 0; }
    }
    return true;
  }
  stanceLocal() { return LEGS.filter(k => !this.feet[k].swing).map(k => ({ k, ...this.toLocal(this.feet[k].x, this.feet[k].z) })); }
  margin(slopeDeg = 0) {
    const st = this.stanceLocal();
    if (st.length < 3) return { m: -1, n: st.length, hull: st };
    const hull = convexHull(st);
    return { m: marginOf(hull, comPoint(this.form, this.g, slopeDeg)), n: st.length, hull };
  }
}

export function describeGroups(g) {
  const a = LEGS.filter(k => Math.abs(g.phases[k] - g.phases.LF) < 0.13 || Math.abs(g.phases[k] - g.phases.LF) > 0.87);
  const tri = (s) => s.slice().sort().join(',');
  if (tri(a) === 'LF,LR,RM') return '三角步态';
  return '自定步态';
}
