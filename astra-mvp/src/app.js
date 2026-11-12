// Entry point: wires pointer input, resizing and the frame loop.
import './exps.js';
import './home.js';
import { stage, screens, go, currentScreen, app, $, S, useSpirit, spirit } from './core.js';

const canvas = $('#gl');
const fwd = (type) => (e) => { const s = currentScreen(); if (s && s.pointer) s.pointer(type, e); };
canvas.addEventListener('pointerdown', (e) => { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } fwd('down')(e); });
canvas.addEventListener('pointermove', fwd('move'));
canvas.addEventListener('pointerup', fwd('up'));
canvas.addEventListener('pointercancel', fwd('up'));

let rz = 0;
new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => stage.resize(), 120); }).observe(app);

let last = performance.now();
const dbg = { state: () => S, spirit: () => spirit, go, screens, stage, current: currentScreen, paused: false, speed: 1 };
function step(dt) { const s = currentScreen(); if (s && s.tick) s.tick(dt); stage.render(); }
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) * dbg.speed; last = now;
  if (!dbg.paused) step(dt);
  requestAnimationFrame(frame);
}
// Compile every look's shaders up front, so switching to the engineering view or the ledger never hitches.
{
  const sp = useSpirit(false);
  for (const look of ['eng', 'ink', 'habitat']) { sp.setLook(look, look === 'eng' ? null : { legs: { RF: true } }, look === 'eng' ? 'RF' : null); stage.render(); }
}
go(screens.Home());
requestAnimationFrame(frame);
{ const boot = $('#boot'); if (boot) boot.remove(); }
dbg.step = step;            // test hook: advance the simulation by hand while paused
window.__astra = dbg;
