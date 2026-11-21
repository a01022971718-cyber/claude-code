// 造物台 · 生态：新建、拖滑条调颜色和植物（预览实时变）、保存；AI 配一个（模拟回复）、看图精修、撤回
const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)), S = g.studio;
localStorage.removeItem('yujian_biomes_v1');
S.open(); await wait(500);
document.querySelector('.s-sheet [data-s="bnew"]').click(); await wait(800);
const P = () => document.querySelector('.s-bpanel'), set = (n, v) => { const f = P().querySelector(`[name="${n}"]`); f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); };
const meshes = () => S.bview.children.filter((o) => o.isMesh && !o.isInstancedMesh).length - 1;   // 植物（去掉侧面）
const out = { mode: document.querySelector('.studio').classList.contains('s-bmode'), panel: !!P(), plants0: meshes() };
set('c0', '#c8a060'); set('pl_con', 0.7); set('pl_broad:3', 0.4); set('grass', 0.9); set('flowers', 0.6); await wait(500);
out.plants1 = meshes(); out.colors = S.biome.colors; out.picked = S.biome.plants.map((p) => p.name + ':' + p.density);
await window.__shot('edit');
document.querySelector('.s-name').value = '金秋松林'; P().querySelector('[data-s="bsave"]').click(); await wait(200);
out.saved = JSON.parse(localStorage.getItem('yujian_biomes_v1') || '[]').map((b) => b.name);
// AI 配一个（新的）：植物名字里混一个不存在的，要被丢掉
Object.defineProperty(g.ai, 'ready', { value: true, configurable: true });
let sent = null; g.ai._ask = async (params) => { sent = params; return { text: JSON.stringify({ name: '蓝月苔原', colors: ['#5f86a8', '#4c7090', '#7aa0c0'], height: 0.42, roughness: 0.2, grass: 0.7, grassColor: '#7fa8c8', flowers: 0.4, flowerColors: ['#f4f6ff', '#c8d8ff'], plants: [{ name: '石头', density: 0.3 }, { name: '火星草', density: 0.5 }, { name: '松树', density: 0.1 }] }), res: {} }; };
document.querySelector('.s-top [data-s="ai"]').click(); await wait(300);
document.querySelector('.s-aitext').value = '月光下的蓝色苔原'; document.querySelector('[data-s="baiGo"]').click(); await wait(1200);
out.ai = { name: S.biome.name, plants: S.biome.plants.map((p) => p.name), listsPlants: typeof sent?.messages?.[0]?.content === 'string' && sent.messages[0].content.includes('秋叶树'), refineShown: !document.querySelector('.s-refine').hidden };
await window.__shot('ai');
// 精修：带预览图，结果替换，能撤回
g.ai._ask = async (params) => { sent = params; return { text: JSON.stringify({ name: '蓝月苔原', colors: ['#5f86a8', '#4c7090', '#7aa0c0'], height: 0.42, roughness: 0.25, grass: 0.6, grassColor: '#8fb4c8', flowers: 0.5, flowerColors: ['#f4f6ff', '#c8d8ff', '#ffe8a0'], plants: [{ name: '石头', density: 0.25 }, { name: '松树', density: 0.2 }], notes: '草色太冷，调暖一点并加了一种淡黄花' }), res: {} }; };
await S.refineBiome(); await wait(300);
const img = Array.isArray(sent?.messages?.[0]?.content) && sent.messages[0].content.some((b) => b.type === 'image');
out.refine = { img, notes: (document.querySelector('.s-toast')?.textContent || '').includes('草色太冷'), fc: S.biome.flowerColors.length, undoBtn: !!P().querySelector('[data-s="bundo"]') };
P().querySelector('[data-s="bundo"]').click(); await wait(200); out.refine.undone = S.biome.flowerColors[2] !== '#ffe8a0';
// 回到库：两个都在（AI 配的那个先保存）
S.saveBiome(); S.library(); await wait(200);
out.lib = [...document.querySelectorAll('.s-sheet [data-s="bopen"]')].map((b) => b.textContent.slice(0, 4));
return out;
