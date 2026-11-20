const app = window.__game, v = app.view, r = v.renderer, wait = (ms) => new Promise((res) => setTimeout(res, ms));
document.querySelector('#startBtn')?.click(); await wait(800); app.hud?.endTutorial?.(); app.setTimeMode('fixed', 9); app.game.s.settings.autoQuality = false;
Object.defineProperty(v, 'lodK', { get: () => 1, set: () => {}, configurable: true });
await app.rig.flyTo(-0.6, 0.6, 1.6, 0.3, { pitch: 0.32 }); await wait(4000);
const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
r.info.autoReset = false; r.info.reset(); for (let f = 0; f < 4; f++) await frame(); const tris = Math.round(r.info.render.triangles / 4), calls = Math.round(r.info.render.calls / 4);
const top = app.perfMon.breakdown();
// 近景草层重建一次要多久（镜头每走半个单位就重建）
const M = v.macro; let ms = null, worst = 0; if (M?._build) { const job = M._build(-0.2, 0.9), t0 = performance.now(); let r; do { const a = performance.now(); do { r = job.next(); } while (!r.done && performance.now() - a < 3); worst = Math.max(worst, performance.now() - a); } while (!r.done); ms = Math.round(performance.now() - t0); }
await window.__shot('close');
return { tris, calls, macroRebuildMs: ms, worstSliceMs: Math.round(worst), macroBlades: M?.grass?.geometry?.instanceCount ?? M?.grass?.count, top };
