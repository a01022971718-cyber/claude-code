// AI 自主代理（模拟 Claude 回复）：看岛 → 自由造物 + 设计生态 → 铺地、摆放 → 截图检查 → 调时间海水 → 收尾；撤销能回到原样
const app = window.__game, v = app.view, cv = app.canvasMode, wait = (ms) => new Promise((r) => setTimeout(r, ms));
document.querySelector('#startBtn')?.click(); await wait(800); app.hud?.endTutorial?.(); app.setTimeMode('fixed', 10);
localStorage.removeItem('yujian_makes_v1'); localStorage.removeItem('yujian_biomes_v1'); window.confirm = () => true;
Object.defineProperty(app.ai, 'ready', { value: true, configurable: true });
const tiles0 = cv.s.tiles.length, items0 = cv.s.items.length;
const MAKE = { name: '灯笼兽', use: 'creature', behavior: 'walk', size: 1, parts: [
  { name: '身体', pivot: [0, 0, 0], motion: 'none', axis: 'x', amp: 1, speed: 1, phase: 0, boxes: [{ p: [0, 7, 0], s: [7, 6, 9], r: [0, 0, 0], c: '#f2a03a', shade: true }, { p: [0, 11, 3], s: [5, 5, 5], r: [0, 0, 0], c: '#f6c060', shade: true }, { p: [1.3, 12, 5.6], s: [1, 1.2, 0.4], r: [0, 0, 0], c: '#1d1a1a', shade: false }, { p: [-1.3, 12, 5.6], s: [1, 1.2, 0.4], r: [0, 0, 0], c: '#1d1a1a', shade: false }] },
  ...[['左腿', 2, 1, 0], ['右腿', -2, 1, 0.5]].map(([name, x, z, phase]) => ({ name, pivot: [x, 4, z], motion: 'walk', axis: 'x', amp: 1, speed: 1, phase, boxes: [{ p: [x, 2, z], s: [2, 4, 2], r: [0, 0, 0], c: '#8a5a30', shade: false }] })) ] };
const BIOME = { name: '金色苔原', colors: ['#c8b060', '#b09850', '#d8c070'], height: 0.44, roughness: 0.3, grass: 0.7, grassColor: '#c8b060', flowers: 0.3, flowerColors: ['#f4f0e8', '#f2c45a'], plants: [{ name: '松树', density: 0.3 }, { name: '石头', density: 0.2 }, { name: '火星草', density: 0.5 }] };
let uid = 0; const tu = (name, input) => ({ type: 'tool_use', id: 'tu' + (++uid), name, input });
const lastResults = (p) => { const m = p.messages[p.messages.length - 1]; return Array.isArray(m.content) ? m.content : []; };
const textOf = (r) => (typeof r.content === 'string' ? r.content : (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''));
let mk = '', bm = '';
const script = [
  () => ({ content: [{ type: 'text', text: '先看看这座岛现在的样子。' }, tu('look_island', {})], stop_reason: 'tool_use' }),
  () => ({ content: [{ type: 'text', text: '东边加一片金色苔原，住几只灯笼兽。先造它们。' }, tu('create_make', MAKE), tu('create_biome', BIOME)], stop_reason: 'tool_use' }),
  (p) => { const rs = lastResults(p); mk = (textOf(rs[0]).match(/mk_[a-z0-9]+/) || [''])[0]; bm = (textOf(rs[1]).match(/bm_[a-z0-9]+/) || [''])[0];
    return { content: [tu('set_tiles', { tiles: [{ q: 4, r: -2, type: bm }, { q: 4, r: -1, type: bm }, { q: 5, r: -2, type: bm }, { q: 5, r: -1, type: 'beach' }, { q: 9, r: 9, type: 'lava' }] }), tu('place', { items: [{ k: mk, q: 4, r: -1, n: 2 }, { k: 'pine', q: 4, r: -2, n: 2 }, { k: 'boat', q: 4, r: -1 }] })], stop_reason: 'tool_use' }; },
  () => ({ content: [tu('screenshot', { view: 'island' }), tu('set_scene', { hour: 17, sea: 'jade' })], stop_reason: 'tool_use' }),
  () => ({ content: [{ type: 'text', text: '做好了：东边铺了一片金色苔原，住着两只灯笼兽，旁边种了松树。' }], stop_reason: 'end_turn' }),
];
const sent = []; let i = 0;
app.ai.client = () => ({ beta: { messages: { create: async (params) => { sent.push(JSON.parse(JSON.stringify(params))); await wait(50); return script[Math.min(i++, script.length - 1)](params); } } } });
app.ui.openAIIsland(); await wait(300);
const P = () => document.querySelector('.agent');
P().querySelector('textarea').value = '在东边加一片金色的苔原，住几只像灯笼一样会发光的小兽';
P().querySelector('[data-ag="go"]').click();
for (let k = 0; k < 120 && app.ui.agent?.running !== false; k++) await wait(500);
await wait(1500); await window.__shot('panel');
const res = sent[4] ? lastResults(sent[4]) : [], shotRes = res.find((r) => Array.isArray(r.content) && r.content.some((c) => c.type === 'image'));
const out = {
  steps: sent.length, tools: (sent[0]?.tools || []).map((t) => t.name), schemaOk: (sent[0]?.tools || []).every((t) => t.input_schema?.type === 'object'),
  mk, bm, newTiles: cv.s.tiles.filter((t) => t[2] === bm).length, placedMk: cv.s.items.filter((it) => it.k === mk).length, pine: cv.s.items.length - items0,
  badReported: res.length === 0 ? null : textOf(lastResults(sent[3])[0]).includes('lava'), shotImage: !!shotRes, sea: cv.s.sea,
  makes: JSON.parse(localStorage.getItem('yujian_makes_v1') || '[]').length, biomes: JSON.parse(localStorage.getItem('yujian_biomes_v1') || '[]').map((b) => b.name + ':' + b.plants.map((p) => p.name).join('/')),
  log: P().querySelectorAll('.ag-log > div').length, summary: P().querySelector('.ag-log').textContent.includes('做好了'), undoBtn: !P().querySelector('[data-ag="undo"]').hidden,
};
// 面板里看美术圣经能返回
P().querySelector('[data-ag="more"]').click(); await wait(100); P().querySelector('[data-ag="bible"]').click(); await wait(100);
const inBible = !P().querySelector('.ag-bible').hidden; P().querySelector('[data-ag="back"]').click(); await wait(100);
out.bibleBack = inBible && !P().querySelector('.ag-input').hidden && P().querySelector('.ag-bible').hidden;
// 撤销这次的全部改动
P().querySelector('[data-ag="undo"]').hidden = false; P().querySelector('[data-ag="undo"]').click(); await wait(1500);
out.undo = { tiles: cv.s.tiles.length === tiles0, items: cv.s.items.length === items0, makes: JSON.parse(localStorage.getItem('yujian_makes_v1') || '[]').length, biomes: JSON.parse(localStorage.getItem('yujian_biomes_v1') || '[]').length };
return out;
