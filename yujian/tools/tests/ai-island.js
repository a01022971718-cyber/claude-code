const app = window.__game, v = app.view, cv = app.canvasMode, wait = (ms) => new Promise((r) => setTimeout(r, ms));
document.querySelector('#startBtn')?.click(); await wait(800); app.hud?.endTutorial?.(); app.setTimeMode('fixed', 15);
localStorage.removeItem('yujian_makes_v1');
const tiles = cv.layout().tiles;
const island = { name: '苔光岛', note: '测试', sea: 'clear', hour: 15,
  biomes: [{ name: '苔光林', colors: ['#6f8a4a'], height: 0.45, roughness: 0.3, grass: 0.6, grassColor: '#6f8a4a', flowers: 0.3, flowerColors: ['#ddd0ea'], plants: [{ name: '灯笼菇', density: 0.5 }] }],
  plants: [{ name: '灯笼菇', form: 'mushroom', height: 0.3, trunkColor: '#ece8e0', trunkThickness: 0.5, bend: 0.1, crownShape: 'round', crownColor: '#6fa8b8', crownColor2: '#8fc8b4', crownSize: 0.6, accent: 'glow', accentColor: '#f7f4ea' }],
  creatures: [{ name: '苔团兽', shape: 'round', size: 0.07, color: '#8a9a5a', color2: '#f0e2c8', legs: 4, head: 0.5, eyes: 'big', ears: 'round', horns: 'none', tail: 'short', wings: false, pattern: 'belly', move: 'walk', habitat: '苔光林', count: 3 }],
  tiles: tiles.map((t, i) => ({ q: t.q, r: t.r, t: i < 4 ? '苔光林' : t.t })), items: [] };
const mush = { name: 'x', use: 'plant', behavior: 'still', size: 1, parts: [{ name: '柄', pivot: [0,0,0], motion: 'none', axis: 'x', amp: 1, speed: 1, phase: 0, boxes: [{ p: [0,3,0], s: [2,6,2], r: [0,0,0], c: '#ece8e0', shade: false }] }, { name: '伞', pivot: [0,6,0], motion: 'sway', axis: 'x', amp: 1, speed: 1, phase: 0, boxes: [{ p: [0,7,0], s: [8,3,8], r: [0,0,0], c: '#6fa8b8', shade: true }, { p: [2,8.6,1], s: [1,0.6,1], r: [0,0,0], c: '#f7f4ea', shade: false }] }] };
const beast = { name: 'y', use: 'creature', behavior: 'walk', size: 1, parts: [{ name: '身体', pivot: [0,0,0], motion: 'none', axis: 'x', amp: 1, speed: 1, phase: 0, boxes: [{ p: [0,6,0], s: [7,6,9], r: [0,0,0], c: '#8a9a5a', shade: true }, { p: [0,4.4,0.5], s: [5,2,7], r: [0,0,0], c: '#f0e2c8', shade: false }, { p: [0,8,6], s: [6,5,5], r: [0,0,0], c: '#8a9a5a', shade: true }, { p: [1.4,8.6,8.6], s: [0.9,1,0.4], r: [0,0,0], c: '#1d1a1a', shade: false }, { p: [-1.4,8.6,8.6], s: [0.9,1,0.4], r: [0,0,0], c: '#1d1a1a', shade: false }] },
  ...[[2,3,0],[-2,3,0.5],[2,-3,0.5],[-2,-3,0]].map(([x,z,ph], i) => ({ name: '腿' + i, pivot: [x,3,z], motion: 'walk', axis: 'x', amp: 1, speed: 1, phase: ph, boxes: [{ p: [x,1.5,z], s: [2,3,2], r: [0,0,0], c: '#5a6a3a', shade: false }] }))] };
Object.defineProperty(app.ai, 'ready', { value: true, configurable: true });
let calls = 0; app.ai._ask = async (p) => { calls++; const sys = p.system || ''; if (sys.includes('造物师')) { const t = typeof p.messages[0].content === 'string' ? p.messages[0].content : p.messages[0].content.map((c) => c.text || '').join(''); return { text: JSON.stringify(t.includes('植物') ? mush : beast), res: {} }; } if (p.output_config?.format?.schema?.properties?.score) return { text: JSON.stringify({ score: 8, notes: '风格一致', biomes: island.biomes, plants: [], creatures: [] }), res: {} }; return { text: JSON.stringify(island), res: {} }; };
app.ui.openAIIsland(); await wait(300);
document.querySelector('[data-m="create"]').click(); document.querySelector('#aiPrompt').value = '苔藓光林'; document.querySelector('#aiGo').click();
for (let i = 0; i < 150 && !document.querySelector('#aiOk'); i++) await wait(200);
document.querySelector('#aiOut img')?.scrollIntoView(); await window.__shot('modal');
const msg = document.querySelector('.aimsg')?.textContent;
document.querySelector('#aiOk').click(); await wait(4000);
const mk = JSON.parse(localStorage.getItem('yujian_makes_v1') || '[]');
const items = cv.s.items.filter((it) => it.k.startsWith('mk_')).map((it) => it.k);
const biomePlants = cv.s.custom.biomes.map((b) => b.plants.map((p) => p.id));
const m0 = v.items.makes[0]?.holder.position; if (m0) { await app.rig.flyTo(m0.x, m0.z, 1.4, 0.3, { pitch: 0.5 }); await wait(3000); await window.__shot('island'); }
return { calls, msg, makes: mk.map((m) => m.name + ':' + m.use + ':size' + m.size.toFixed(2)), items, biomePlants };
