// The hexapod spirit: a real kinematic chain (3 joints per leg) with switchable looks.
// Units: 1 = 100 mm. Robot forward = +z, left = +x, up = +y.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export const PAL = { ink: '#14161c', white: '#f3f5f9', red: '#ff2e4d', yellow: '#ffd21f', cyan: '#5cf2ff' };
export const LEGS = ['LF', 'LM', 'LR', 'RF', 'RM', 'RR'];
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- line materials share one resolution uniform (CSS px => widths are in CSS px)
const lineMats = new Set();
export function setLineResolution(w, h) { for (const m of lineMats) m.resolution.set(w, h); }
export function lineMat(color, width, opacity = 1, dashed = false) {
  const m = new LineMaterial({ color: new THREE.Color(color).getHex(), linewidth: width, transparent: opacity < 1, opacity, dashed });
  lineMats.add(m);
  return m;
}

// ---- material sets, one per look
let SETS = null;
function sets() {
  if (SETS) return SETS;
  const data = new Uint8Array([80, 175, 255]);
  const grad = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const out = (m, p) => { m.userData.outlineParameters = p; return m; };
  const off = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  const toon = (c) => out(new THREE.MeshToonMaterial({ color: c, gradientMap: grad }), { color: [0.05, 0.05, 0.07], thickness: 0.004, visible: true });
  const basic = (c, o, p) => out(new THREE.MeshBasicMaterial({ color: c, ...o }), p);
  const kinds = ['ivory', 'gun', 'dark', 'red', 'yellow', 'glow', 'white'];
  const all = (m) => Object.fromEntries(kinds.map(k => [k, m]));
  const darkOut = { color: [0.05, 0.05, 0.07], thickness: 0.004, visible: true };
  const cyanOut = { color: [0.36, 0.95, 1.0], thickness: 0.0028, visible: true };
  const dimOut = { color: [0.16, 0.4, 0.5], thickness: 0.002, visible: true };
  const inkOut = { color: [0.08, 0.09, 0.11], thickness: 0.005, visible: true };
  const none = { visible: false };
  const color = {
    ivory: toon(PAL.white), gun: toon('#353a45'), dark: toon('#1a1c22'), red: toon('#ff3a57'), yellow: toon(PAL.yellow),
    glow: basic('#ff3b58', {}, darkOut), white: basic('#ffffff', {}, darkOut), edge: lineMat('#0e1016', 0.8, 0.5),
  };
  const g = basic('#5ce8ff', { transparent: true, opacity: 0.15, depthWrite: false }, none);
  const ghost = { ...all(g), edge: lineMat('#8ff9ff', 1.2, 1) };
  const hf = basic('#0e1930', off, cyanOut), hf2 = basic('#12284a', off, cyanOut);
  const holo = { ...all(hf), gun: hf2, dark: hf2, glow: basic('#ff3b58', off, cyanOut), edge: lineMat(PAL.cyan, 1.0, 0.95) };
  const df = basic('#0b1426', off, dimOut);
  const holoDim = { ...all(df), edge: lineMat('#2f7890', 0.8, 0.75) };
  const w = basic('#fbfaf6', off, inkOut);
  const ink = { ...all(w), gun: basic('#d3d6dc', off, inkOut), dark: basic('#8f95a0', off, inkOut), yellow: basic(PAL.yellow, off, inkOut), glow: basic(PAL.red, off, inkOut), edge: lineMat(PAL.ink, 1.0, 1) };
  const ig = basic('#f4f6fa', off, { color: [0.62, 0.68, 0.78], thickness: 0.003, visible: true });
  const inkGhost = { ...all(ig), edge: lineMat('#9fb2c8', 0.8, 1) };
  SETS = { color, ghost, holo, holoDim, ink, inkGhost };
  return SETS;
}

let GLOW_TEX = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(c);
  return GLOW_TEX;
}

const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const rbox = (w, h, d, r = 0.03, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, r);
const alongX = (g) => { g.rotateZ(-Math.PI / 2); return g; };   // +y -> +x
const axisZ = (g) => { g.rotateX(Math.PI / 2); return g; };     // cylinder axis -> z

// ---- body proportions. `traits` (from the player's own gait) shape the evolved form.
export function makeForm(traits = null) {
  const f = { L1: 0.85, L2: 1.15, coxa: 0.22, hullL: 1, hullW: 1, H: 0.8, comZ: -0.15, evolved: false, yawLimit: 0.9 };
  let ls = 1;
  if (traits) {
    f.evolved = true;
    ls = 1.06 + 0.16 * clamp((traits.stepLen - 0.2) / 0.9, 0, 1);   // longer strides -> longer legs
    f.L1 *= ls; f.L2 *= ls;
    f.hullW = 1.16 - 0.2 * clamp((traits.bodyH - 0.45) / 0.45, 0, 1); // lower stance -> wider shell
    f.hullL = 1.08;
    f.H = 0.8 * ls;
  }
  const m = (x, z) => [x * f.hullW, -0.08, z * f.hullL];
  f.mounts = { LF: m(0.60, 0.80), LM: m(0.80, 0), LR: m(0.66, -0.80), RF: m(-0.60, 0.80), RM: m(-0.80, 0), RR: m(-0.66, -0.80) };
  const n = (x, z) => [x * (0.5 * (f.hullW + ls)), 0, z * (0.5 * (f.hullL + ls))];
  f.neutral = { LF: n(1.42, 1.70), LM: n(1.86, 0.06), LR: n(1.50, -1.55), RF: n(-1.42, 1.70), RM: n(-1.86, 0.06), RR: n(-1.50, -1.55) };
  return f;
}

export class Spirit {
  constructor(form) {
    this.form = form;
    this.root = new THREE.Group();          // on the ground: position.xz + yaw
    this.body = new THREE.Group();          // lifted to body height, tilts when it tips
    this.root.add(this.body);
    this.parts = [];
    this.legs = {};
    this.height = form.H; this.lean = 0;
    this._build();
    this.setPose({});
    for (const k of LEGS) this.setFoot(k, this.neutral(k));
  }

  _add(geo, kind, group, parent, o = {}) {
    const S = sets();
    const mesh = new THREE.Mesh(geo, S.color[kind]);
    if (o.pos) mesh.position.set(...o.pos);
    if (o.rot) mesh.rotation.set(...o.rot);
    mesh.castShadow = true;
    const eg = new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(geo, o.angle ?? 32));
    const edge = new LineSegments2(eg, S.color.edge);
    mesh.add(edge);
    let sprite = null;
    if (kind === 'glow' && o.glow !== 0) {
      sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff3355, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
      sprite.scale.setScalar(0.42 * (o.glow || 1));
      mesh.add(sprite);
    }
    parent.add(mesh);
    this.parts.push({ mesh, edge, kind, group, sprite });
    return mesh;
  }

  _hull(s, dz, depth, bevel, yTop) {
    const f = this.form;
    const pts = [[0, 1.30], [0.42, 1.12], [0.70, 0.62], [0.84, 0.0], [0.76, -0.62], [0.52, -1.10], [0, -1.24]];
    const full = [...pts, ...pts.slice(1, -1).reverse().map(([x, z]) => [-x, z])];
    const sh = new THREE.Shape();
    full.forEach(([x, z], i) => { const X = x * s * f.hullW, Z = (z * s + dz) * f.hullL; i ? sh.lineTo(X, Z) : sh.moveTo(X, Z); });
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 });
    geo.rotateX(Math.PI / 2); geo.translate(0, yTop, 0);
    return geo;
  }

  _build() {
    const f = this.form, b = this.body, hz = f.hullL;
    const add = (geo, kind, o) => this._add(geo, kind, 'body', b, o);
    add(this._hull(0.86, -0.02, 0.14, 0.03, -0.10), 'gun');
    add(this._hull(1.0, 0, 0.14, 0.05, 0.08), 'ivory');
    add(this._hull(0.6, -0.14, 0.08, 0.035, 0.22), 'gun');
    add(new THREE.BoxGeometry(0.07, 0.02, 0.46), 'glow', { pos: [0, 0.262, 0.12 * hz], glow: 1.5 });
    add(cyl(0.1, 0.1, 0.018, 24), 'yellow', { pos: [0, 0.264, -0.52 * hz], angle: 40 });
    add(cyl(0.05, 0.05, 0.022, 24), 'dark', { pos: [0, 0.266, -0.52 * hz], angle: 40 });
    // shark fin
    const fh = f.evolved ? 0.42 : 0.30;
    const fin = new THREE.Shape(); fin.moveTo(-0.55, 0); fin.lineTo(0.05, 0); fin.lineTo(-0.35, fh); fin.closePath();
    const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: false }); finG.rotateY(-Math.PI / 2); finG.translate(0.03, 0.245, -0.32 * hz);
    add(finG, 'ivory');
    const t0 = fh * 0.66, xa = -0.55 + 0.2 * (t0 / fh), xb = 0.05 - 0.4 * (t0 / fh);
    const tip = new THREE.Shape(); tip.moveTo(xa, t0); tip.lineTo(xb, t0); tip.lineTo(-0.35, fh); tip.closePath();
    const tipG = new THREE.ExtrudeGeometry(tip, { depth: 0.07, bevelEnabled: false }); tipG.rotateY(-Math.PI / 2); tipG.translate(0.035, 0.245, -0.32 * hz);
    add(tipG, 'red');
    // head
    const hzp = 1.38 * hz;
    add(rbox(0.78, 0.42, 0.56, 0.08), 'ivory', { pos: [0, 0.05, hzp] });
    add(rbox(0.64, 0.15, 0.08, 0.03), 'dark', { pos: [0, 0.09, hzp + 0.265] });
    this.lens = add(axisZ(cyl(0.1, 0.1, 0.06, 24)), 'glow', { pos: [0, 0.09, hzp + 0.31], angle: 40, glow: 2.4 });
    add(new THREE.SphereGeometry(0.026, 10, 8), 'white', { pos: [0.04, 0.125, hzp + 0.34] });
    add(axisZ(cyl(0.034, 0.034, 0.04, 12)), 'glow', { pos: [0.24, 0.09, hzp + 0.31], angle: 40, glow: 0.8 });
    add(axisZ(cyl(0.034, 0.034, 0.04, 12)), 'glow', { pos: [-0.24, 0.09, hzp + 0.31], angle: 40, glow: 0.8 });
    add(new THREE.BoxGeometry(0.07, 0.016, 0.34), 'yellow', { pos: [0, 0.265, hzp - 0.02] });
    add(rbox(0.07, 0.07, 0.26, 0.015), 'gun', { pos: [0.2, -0.14, hzp + 0.3], rot: [0.55, 0, 0] });
    add(rbox(0.07, 0.07, 0.26, 0.015), 'gun', { pos: [-0.2, -0.14, hzp + 0.3], rot: [0.55, 0, 0] });
    // rear pod
    add(axisZ(cyl(0.17, 0.17, 0.3, 20)), 'gun', { pos: [0, -0.05, -1.30 * hz], angle: 40 });
    add(axisZ(cyl(0.178, 0.178, 0.05, 20)), 'glow', { pos: [0, -0.05, -1.30 * hz - 0.13], angle: 40, glow: 1.5 });
    add(axisZ(cyl(0.12, 0.12, 0.05, 20)), 'dark', { pos: [0, -0.05, -1.30 * hz - 0.17], angle: 40 });
    // antenna
    const an = cyl(0.014, 0.014, 0.55, 8); an.translate(0, 0.275, 0);
    add(an, 'gun', { pos: [0.32 * f.hullW, 0.12, -0.78 * hz], rot: [-0.38, 0, -0.18], angle: 50 });
    // vision sensor on a mast: the next lesson, shown as a hologram after evolution
    const sens = (geo, kind, o) => this._add(geo, kind, 'sensor', b, o);
    sens(cyl(0.12, 0.13, 0.08, 16), 'gun', { pos: [0, 0.3, hzp - 0.04] });
    sens(cyl(0.035, 0.035, 0.36, 10), 'gun', { pos: [0, 0.5, hzp - 0.04], angle: 50 });
    sens(rbox(0.46, 0.24, 0.32, 0.045, 1), 'ivory', { pos: [0, 0.76, hzp - 0.02], angle: 20 });
    sens(axisZ(cyl(0.075, 0.075, 0.07, 20)), 'glow', { pos: [0, 0.76, hzp + 0.175], angle: 40, glow: 0 });
    sens(axisZ(cyl(0.035, 0.035, 0.05, 12)), 'glow', { pos: [0.16, 0.76, hzp + 0.165], angle: 40, glow: 0 });
    this.sensorPos = V(0, 0.9, hzp);

    // ---- legs: mount (yaw j1) -> femur (j2) -> tibia (j3)
    const { L1, L2, coxa } = f;
    for (const k of LEGS) {
      const M = V(...f.mounts[k]), N = V(...f.neutral[k]);
      const baseYaw = Math.atan2(-(N.z - M.z), N.x - M.x);
      const mount = new THREE.Group(); mount.position.copy(M); b.add(mount);
      const femur = new THREE.Group(); femur.position.set(coxa, 0, 0); mount.add(femur);
      const tibia = new THREE.Group(); tibia.position.set(L1, 0, 0); femur.add(tibia);
      const grp = 'leg:' + k;
      const A = (geo, kind, parent, o) => this._add(geo, kind, grp, parent, o);
      if (k[1] !== 'M' || f.evolved) A(rbox(0.34, 0.1, 0.3, 0.035), 'ivory', mount, { pos: [0.02, 0.2, 0] });
      A(cyl(0.12, 0.12, 0.22, 20), 'gun', mount, { angle: 40 });
      A(cyl(0.085, 0.085, 0.03, 20), 'glow', mount, { pos: [0, 0.125, 0], angle: 40, glow: 0.9 });
      A(rbox(coxa + 0.06, 0.14, 0.16, 0.02), 'gun', mount, { pos: [coxa / 2, 0, 0] });
      A(axisZ(cyl(0.105, 0.105, 0.28, 20)), 'gun', femur, { angle: 40 });
      A(axisZ(cyl(0.062, 0.062, 0.31, 16)), 'glow', femur, { angle: 40, glow: 1.1 });
      A(rbox(L1 + 0.06, 0.17, 0.21, 0.035), 'ivory', femur, { pos: [L1 / 2, 0, 0] });
      A(new THREE.BoxGeometry(0.26, 0.02, 0.17), 'yellow', femur, { pos: [L1 * 0.72, 0.088, 0] });
      A(new THREE.BoxGeometry(0.05, 0.02, 0.17), 'dark', femur, { pos: [L1 * 0.88, 0.088, 0] });
      A(axisZ(cyl(0.09, 0.09, 0.25, 20)), 'gun', tibia, { angle: 40 });
      A(axisZ(cyl(0.05, 0.05, 0.27, 14)), 'dark', tibia, { angle: 40 });
      const Lt = L2 - 0.17;
      let tg = cyl(0.05, 0.108, Lt, 6); tg.translate(0, Lt / 2, 0); alongX(tg); tg = tg.toNonIndexed(); tg.computeVertexNormals();
      A(tg, 'gun', tibia, { angle: 30 });
      A(alongX(cyl(0.064, 0.064, 0.05, 16)), 'glow', tibia, { pos: [Lt, 0, 0], angle: 40, glow: 0.8 });
      const ft = cyl(0.018, 0.05, 0.17, 10); ft.translate(0, 0.085, 0); alongX(ft);
      A(ft, 'dark', tibia, { pos: [Lt, 0, 0], angle: 40 });
      this.legs[k] = { mount, femur, tibia, M, baseYaw, side: M.x < 0 ? 1 : -1, j1: 0, j2: 0, j3: 0 };
    }
  }

  // look: 'habitat' | 'eng' | 'ink'. solid: { legs: {RF:true,...}, sensor: null | 'ghost' | 'solid' }, focus: leg key
  setLook(view, solid = null, focus = null) {
    solid = solid || {};
    const S = sets();
    for (const p of this.parts) {
      let set, visible = true, isSolid = true;
      if (p.group === 'sensor') { if (!solid.sensor) visible = false; isSolid = solid.sensor === 'solid'; }
      else if (p.group.startsWith('leg:')) isSolid = !solid.legs || !!solid.legs[p.group.slice(4)];
      if (view === 'habitat') set = isSolid ? S.color : S.ghost;
      else if (view === 'ink') set = isSolid ? S.ink : S.inkGhost;
      else set = (!focus || p.group === 'leg:' + focus) ? S.holo : S.holoDim;
      p.mesh.visible = visible;
      p.mesh.material = set[p.kind];
      p.edge.material = set.edge;
      p.mesh.castShadow = view === 'habitat' && isSolid;
      if (p.sprite) p.sprite.visible = view === 'habitat' && isSolid;
    }
  }

  setPose({ height = this.height, lean = this.lean, pitch = 0, roll = 0, drop = 0 }) {
    this.height = height; this.lean = lean;
    this.body.position.set(0, height - drop, lean);
    this.body.rotation.set(pitch, 0, roll);
  }
  neutral(k) { return V(...this.form.neutral[k]); }

  setAngles(k, j1, j2, j3) {
    const L = this.legs[k];
    L.j1 = j1; L.j2 = j2; L.j3 = j3;
    L.mount.rotation.y = L.baseYaw + j1;
    L.femur.rotation.z = j2;
    L.tibia.rotation.z = j3;
  }
  // forward kinematics: joint angles -> foot position in the ground (root) frame
  fk(k, j1, j2, j3) {
    const L = this.legs[k], f = this.form, a = L.baseYaw + j1;
    const r = f.coxa + f.L1 * Math.cos(j2) + f.L2 * Math.cos(j2 + j3);
    const y = f.L1 * Math.sin(j2) + f.L2 * Math.sin(j2 + j3);
    return V(L.M.x + r * Math.cos(a), this.height + L.M.y + y, this.lean + L.M.z - r * Math.sin(a));
  }
  // inverse kinematics: foot position (root frame) -> joint angles; clamps to the workspace
  ik(k, F) {
    const L = this.legs[k], f = this.form;
    const dx = F.x - L.M.x, dz = F.z - this.lean - L.M.z, dy = F.y - this.height - L.M.y;
    let j1 = Math.atan2(-dz, dx) - L.baseYaw;
    j1 = Math.atan2(Math.sin(j1), Math.cos(j1));
    let ok = true;
    if (Math.abs(j1) > f.yawLimit) { j1 = clamp(j1, -f.yawLimit, f.yawLimit); ok = false; }
    const r = Math.hypot(dx, dz) - f.coxa;
    let D = Math.hypot(r, dy);
    const lo = Math.abs(f.L1 - f.L2) + 0.05, hi = f.L1 + f.L2 - 0.01;
    if (D > hi || D < lo || r < 0.15) { ok = false; D = clamp(D, lo, hi); }
    const a = Math.atan2(dy, Math.max(r, 0.15));
    const j2 = a + Math.acos(clamp((f.L1 * f.L1 + D * D - f.L2 * f.L2) / (2 * f.L1 * D), -1, 1));
    const j3 = -(Math.PI - Math.acos(clamp((f.L1 * f.L1 + f.L2 * f.L2 - D * D) / (2 * f.L1 * f.L2), -1, 1)));
    return { j1, j2, j3, ok };
  }
  setFoot(k, F) { const s = this.ik(k, F); this.setAngles(k, s.j1, s.j2, s.j3); return s.ok; }
  footNow(k) { const L = this.legs[k]; return this.fk(k, L.j1, L.j2, L.j3); }
}
