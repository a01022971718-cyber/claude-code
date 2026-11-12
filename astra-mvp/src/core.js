// Shared state, the single stage, and small UI / 3D helpers used by every screen.
import * as THREE from 'three';
import { Spirit, makeForm, LEGS, V, PAL, lineMat } from './spirit.js';
import { Stage, PolyLine } from './stage.js';
import { defaultGait, comPoint } from './gait.js';

export const $ = (s, r = document) => r.querySelector(s);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const mm = (u) => Math.round(u * 100);
export const rad = (d) => d * Math.PI / 180;
export const deg = (r) => r * 180 / Math.PI;
export const clone = (o) => JSON.parse(JSON.stringify(o));

export const app = $('#app'), ui = $('#ui'), labels = $('#labels'), sheetEl = $('#sheet'), flashEl = $('#flash');
export const stage = new Stage(app);

// ---------------------------------------------------------------- saved progress (this browser only)
const KEY = 'astra-mvp-v1';
const fresh = () => ({ v: 1, stage: 0, evolved: false, traits: null, gait: null, slope: null, learned: null, ledger: [], t0: Date.now(), runs: 0 });
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) return s; } catch (e) { /* storage unavailable */ } return fresh(); }
export let S = load();
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ } }
export function resetAll() { S = fresh(); save(); delete spirits.evo; }
export function today() { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
export const dayCount = () => Math.floor((Date.now() - S.t0) / 864e5) + 1;

// ---------------------------------------------------------------- the spirit(s)
const spirits = {};
export let spirit = null;
export function useSpirit(evolved) {
  const key = evolved ? 'evo' : 'base';
  if (!spirits[key]) spirits[key] = new Spirit(makeForm(evolved ? S.traits : null));
  if (spirit !== spirits[key]) { if (spirit) stage.rig.remove(spirit.root); spirit = spirits[key]; stage.rig.add(spirit.root); }
  spirit.root.position.set(0, 0, 0); spirit.root.rotation.y = 0;
  return spirit;
}
// which parts are real (colored) at each stage; the rest are cyan holograms
export function solidFor(stg, evolved) {
  const legs = {};
  for (const k of LEGS) legs[k] = stg >= 2 || (stg >= 1 && k === 'RF');
  return { legs, sensor: evolved ? 'ghost' : null };
}
export const tripod = () => { const g = defaultGait(); Object.assign(g.phases, { RF: 0.5, LM: 0.5, RR: 0.5 }); return g; };
export function activeGait() {
  if (S.stage >= 5 && S.learned) return clone(S.learned.gait);
  const g = clone(S.gait || tripod());
  if (S.stage >= 4 && S.slope) Object.assign(g, S.slope);
  return g;
}
// the evolved body is bigger: scale the stride and stance height with it
export function gaitFor(form, g) {
  const out = clone(g), ls = form.L1 / 0.85;
  out.bodyH = g.bodyH * ls; out.stepLen = g.stepLen * ls; out.stepH = g.stepH * ls;
  return out;
}
export function applyWalker(sp, w, pose = {}) {
  sp.root.position.set(w.x, 0, w.z); sp.root.rotation.y = w.yaw;
  sp.setPose({ height: w.g.bodyH + (pose.bob || 0), lean: w.g.lean, pitch: pose.pitch || 0, roll: pose.roll || 0, drop: pose.drop || 0 });
  for (const k of LEGS) { const f = w.feet[k], l = w.toLocal(f.x, f.z); sp.setFoot(k, V(l.x, f.y, l.z)); }
}
export function standStill(sp, height = sp.form.H, lean = 0) {
  sp.root.position.set(0, 0, 0); sp.root.rotation.y = 0;
  sp.setPose({ height, lean });
  for (const k of LEGS) sp.setFoot(k, sp.neutral(k));
}

// ---------------------------------------------------------------- screens
export const screens = {};
let current = null;
export function go(scr) {
  if (current && current.exit) current.exit();
  ui.innerHTML = ''; labels.innerHTML = ''; closeSheet();
  current = scr; scr.enter();
}
export const currentScreen = () => current;

// ---------------------------------------------------------------- UI helpers
export function openSheet(html) { sheetEl.innerHTML = `<div class="sheet-card">${html}</div>`; sheetEl.hidden = false; return sheetEl.firstElementChild; }
export function closeSheet() { sheetEl.hidden = true; sheetEl.innerHTML = ''; }
export function toast(msg, kind = 'info') {
  const t = $('#toast'); if (!t) return;
  if (!msg) { t.hidden = true; return; }
  t.className = 'toast ' + kind; t.textContent = msg; t.hidden = false;
}
export function flash(long = false) {
  flashEl.hidden = false; flashEl.className = long ? 'long' : '';
  void flashEl.offsetWidth; flashEl.classList.add('go');
  setTimeout(() => { flashEl.hidden = true; }, long ? 1500 : 700);
}
export function label(text, cls = 'holo-note') { const el = document.createElement('div'); el.className = cls; el.textContent = text; labels.appendChild(el); return el; }
export function place(el, local, dx = 0, dy = 0) {
  const p = stage.project(local);
  el.style.transform = `translate(${Math.round(clamp(p.x + dx, 8, stage.w - 8))}px, ${Math.round(p.y + dy)}px)`;
}
export function slider(id, name, min, max, step, value, fmt) {
  return `<div class="sl"><label for="${id}">${name}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output id="${id}-o">${fmt(value)}</output></div>`;
}
export function bindSlider(id, fmt, fn) {
  const el = $('#' + id), out = $('#' + id + '-o');
  el.addEventListener('input', () => { const v = parseFloat(el.value); out.textContent = fmt(v); fn(v); });
}

// ---------------------------------------------------------------- 3D overlay helpers (engineering view)
const dashed = (c, w) => { const m = lineMat(c, w, 1, true); m.dashSize = 0.09; m.gapSize = 0.07; return m; };
export const MAT = { yel: lineMat(PAL.yellow, 1.5), yelDash: dashed(PAL.yellow, 1.6), red: lineMat(PAL.red, 1.6), redDash: dashed(PAL.red, 1.8), cyan: lineMat(PAL.cyan, 1.2, 0.8) };
const flat = (color, opacity = 1) => { const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, side: THREE.DoubleSide }); m.userData.outlineParameters = { visible: false }; return m; };
export function ring(color, r0, r1, opacity = 1) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40), flat(color, opacity)); m.rotation.x = -Math.PI / 2; return m; }
export function sector(color, r0, r1, a0, len, opacity) { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 40, 1, a0, len), flat(color, opacity)); m.rotation.x = -Math.PI / 2; return m; }
let dotTex = null;
export function glowDot(color, size) {
  if (!dotTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); dotTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  s.scale.setScalar(size); return s;
}
export function segment(a, b, mat) { const p = new PolyLine(2, mat); p.set([a, b]); return p; }

// support polygon + projected centre of mass, drawn on the ground
export class SupportViz {
  constructor() {
    this.group = new THREE.Group();
    this.poly = new PolyLine(8, MAT.redDash);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]);
    this.fill = new THREE.Mesh(g, flat(PAL.red, 0.16)); this.fill.frustumCulled = false;
    this.com = ring(PAL.red, 0.085, 0.125);
    this.cross = new PolyLine(2, MAT.red); this.cross2 = new PolyLine(2, MAT.red);
    this.plumb = new PolyLine(2, MAT.redDash);
    this.group.add(this.poly.line, this.fill, this.com, this.cross.line, this.cross2.line, this.plumb.line);
  }
  update(w, slopeDeg) {
    const { hull } = w.margin(slopeDeg);
    const W = (l) => { const p = w._toWorld(l.x, l.z); return V(p.x, 0.012, p.z); };
    const pts = hull.map(W);
    this.poly.line.visible = this.fill.visible = pts.length >= 3;
    if (pts.length >= 3) {
      this.poly.set([...pts, pts[0]]);
      const a = this.fill.geometry.attributes.position;
      for (let i = 0; i < 6; i++) { const p = pts[Math.min(i, pts.length - 1)]; a.setXYZ(i, p.x, 0.008, p.z); }
      a.needsUpdate = true;
    }
    const c = W(comPoint(w.form, w.g, slopeDeg));
    this.com.position.set(c.x, 0.016, c.z);
    this.cross.set([V(c.x - 0.2, 0.016, c.z), V(c.x + 0.2, 0.016, c.z)]);
    this.cross2.set([V(c.x, 0.016, c.z - 0.2), V(c.x, 0.016, c.z + 0.2)]);
    const b = w._toWorld(0, w.g.lean);
    this.plumb.set([V(b.x, w.g.bodyH, b.z), c]);
  }
}

// ---------------------------------------------------------------- ledger
export function record(unit, title, rows, extra = {}) {
  // versions count up as v0.N before the evolution and v1.N after it
  const evo = S.ledger.findIndex(e => e.ver === 'v1.0');
  const ver = evo >= 0 ? `v1.${S.ledger.length - evo}` : `v0.${S.ledger.length + 1}`;
  S.ledger.push({ ver, title, unit, date: today(), stage: S.stage, evolved: S.evolved, gait: clone(activeGait()), rows, ...extra });
  save();
}

export { THREE, V, PAL, LEGS, PolyLine };
