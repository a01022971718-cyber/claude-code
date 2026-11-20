const app = window.__game, v = app.view, cv = app.canvasMode, wait = (ms) => new Promise((r) => setTimeout(r, ms));
document.querySelector('#startBtn')?.click(); await wait(800); app.hud?.endTutorial?.(); app.setTimeMode('fixed', 15);
await app.rig.flyTo(0.6, -0.9, 2.2, 0.3, { pitch: 0.6 }); await wait(2500);
const p = { x: 0.6, z: -0.9, land: true }; const D = { id: 'hut', name: '茅屋', prop: 'strawHut', s: 1.05, r: 0.34 };
const before = v.items.items.size; let n = 0, spot = null;
for (const [x, z] of [[0.6, -0.9], [-0.4, 0.2], [0.3, 0.9], [-1.3, 0.4], [1.4, 0.3]]) { cv.placeItem({ x, z, land: true }, D); if (v.items.items.size > before) { n = v.items.fx.length; spot = [x, z]; break; } }
await app.rig.flyTo(spot[0], spot[1], 2.2, 0.01, { pitch: 0.6 }); await wait(60); await window.__shot('pop'); await wait(600);
app.hud.setOpen(true); await wait(400); app.hud.setCat('plant'); await wait(600); await window.__shot('hud');
const rect = (s) => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
return { spot, fxActive: n, fxAfter: v.items.fx.length, bl: rect('.c-bl'), strip: rect('.c-strip') };
