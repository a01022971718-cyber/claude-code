// 造物台做的生态：六边形岛地块栏「✦ 我造的」里有它，铺下去按配方长植物；删掉后地块变回草地
const app = window.__game, v = app.view, cv = app.canvasMode, wait = (ms) => new Promise((r) => setTimeout(r, ms));
document.querySelector('#startBtn')?.click(); await wait(800); app.hud?.endTutorial?.(); app.setTimeMode('fixed', 10);
const B = { id: 'btest1', name: '金秋松林', colors: ['#c8a060', '#b08a50', '#d8b474'], height: 0.46, roughness: 0.4, grass: 0.8, grassColor: '#c8b060', flowers: 0.3, flowerColors: ['#e8763a', '#f2c45a', '#f4f0e8'], plants: [{ id: 'con', name: '松树', density: 0.6 }, { id: 'broad', v: 3, name: '秋叶树', density: 0.4 }, { id: 'rock', s: 0.07, name: '石头', density: 0.3 }] };
localStorage.setItem('yujian_biomes_v1', JSON.stringify([B])); cv.registerCustom(); app.hud.refresh?.();
app.hud.setOpen(true); await wait(300); app.hud.setCat('land'); await wait(500);
const chip = [...document.querySelectorAll('.c-strip *')].some((e) => e.textContent.includes('我造的')), named = document.querySelector('.c-strip')?.textContent.includes('金秋松林');
await window.__shot('hud'); app.hud.setOpen(false);
// 在岛边上铺三块
const def = { id: 'bm_btest1', name: '✦金秋松林', tile: 'bm_btest1' }; let placed = 0, at = null;
for (let x = 1.5; x <= 4.5 && placed < 3; x += 0.9) for (let z = -1.5; z <= 1.5 && placed < 3; z += 0.9) { const n0 = cv.s.tiles.length, has = cv.s.tiles.some(([q, r, t]) => t === 'bm_btest1'); cv.placeTile({ x, z }, def); const c = cv.s.tiles.filter((t) => t[2] === 'bm_btest1').length; if (c > placed) { placed = c; at ||= [x, z]; } }
await app.rig.flyTo(at[0], at[1], 3.4, 0.3, { pitch: 0.6 }); await wait(4000); await window.__shot('tiles');
// 删掉这个生态再登记：铺过的地块变回草地
localStorage.setItem('yujian_biomes_v1', '[]'); cv.registerCustom();
return { chip, named, placed, after: cv.s.tiles.filter((t) => t[2] === 'bm_btest1').length };
