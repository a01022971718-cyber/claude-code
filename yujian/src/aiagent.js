// AI 自主代理：给接入的大模型一组“游戏权限”（工具），让它像玩家一样（而且更快）自己动手——
// 先看岛、想方案，再铺地、摆东西、用方块自由造新东西、设计新生态，每做完一批就截图看效果，不满意自己改，直到满意为止。
// 不是“填一个模板再由游戏生成”：做什么、造成什么样、要不要返工，全由模型自己判断。
//
// 两个场景：
//  - 六边形岛（islandAgent）：看岛 / 截图 / 铺地块 / 摆放 / 移除 / 新开一座岛 / 自由造物 / 做生态 / 调时间和海水
//  - 造物台（studioAgent）：看造物（数据 + 两张渲染图）/ 改造物（改完自动渲染给它看）
// 界面（AgentPanel）：输入心愿 → 实时显示 AI 每一步在想什么、做了什么、截图；可以收起看它干活、随时停止、
// 做完后继续提要求（它记得前面做过的）、或者一键撤销这次的全部改动。
import * as THREE from 'three';
import { MAKE_SCHEMA, BIOME_SCHEMA, MAKE_SYSTEM, BIOME_SYSTEM, sanitizeMake, stripMake, aiError } from './ai.js';
import { sopPrompt, sopHTML } from './artsop.js';
import { ITEMS, findItem } from './catalog.js';
import { toWorld, fromWorld } from './hex.js';
import { TYPES } from './hq/terrain.js';
import { loadMakes, saveMakes, mergedGeo, bounds, HEX_UNIT } from './make/model.js';
import { registerMakes } from './make/register.js';
import { loadBiomes, saveBiomes, plantOptions, sanitizeBiome, biomePreview, tileId } from './make/biome.js';

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const T = (name, description, properties = {}, required = []) => ({ name, description, schema: { type: 'object', properties, required } });
const newId = (p) => p + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);

/** 把一张大截图缩到最长边 900、JPEG（省流量、省额度，模型看得清） */
function shrink(url, max = 900) {
  return new Promise((res) => { const i = new Image(); i.onload = () => { const k = Math.min(1, max / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = Math.round(i.width * k); c.height = Math.round(i.height * k); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.82)); }; i.onerror = () => res(null); i.src = url; });
}
/** 造物的两张渲染图（斜前方 + 正侧面）拼成一张 */
async function renderMake(m) {
  try {
    const { thumb, thumbMaterial } = await import('./thumbs.js'), g = mergedGeo(m); if (!g) return null;
    const a = thumb(new THREE.Mesh(g, thumbMaterial()), { w: 480, h: 480, pitch: 0.38, yaw: -0.6, bg: 0xe6eef0 }), b = thumb(new THREE.Mesh(g, thumbMaterial()), { w: 480, h: 480, pitch: 0.12, yaw: Math.PI / 2, bg: 0xe6eef0 });
    g.dispose();
    const im = await Promise.all([a, b].map((u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = u; })));
    if (im.some((x) => !x)) return null;
    const c = document.createElement('canvas'); c.width = 960; c.height = 480; const x = c.getContext('2d'); x.drawImage(im[0], 0, 0); x.drawImage(im[1], 480, 0);
    return c.toDataURL('image/jpeg', 0.82);
  } catch { return null; }
}

// ================= 通用循环 =================
/** 跑一轮：st 为空就开新的一局，否则接着上一局（模型记得前面做过的）。onEvent({ type: 'think'|'call'|'result', ... }) */
export async function runAgent(ai, { st, system, goal, tools, exec, onEvent, onState, signal, maxCalls = 40 }) {
  if (!st) st = ai.agentInit(system, goal); else ai.agentSay(st, goal);
  onState?.(st);   // 先交出对话状态：中途出错也能接着上一局继续
  let calls = 0, last = '';
  for (;;) {
    if (signal?.aborted) return { st, stopped: true, summary: last, calls };
    const step = await ai.agentStep(st, tools, signal);
    if (step.text) { last = step.text; onEvent({ type: 'think', text: step.text }); }
    if (!step.calls.length) return { st, done: true, summary: last, calls };
    const results = [];
    for (const c of step.calls) {
      calls++; onEvent({ type: 'call', name: c.name, input: c.input });
      let r;
      try { const o = await exec(c.name, c.input || {}); r = { id: c.id, ok: o.ok !== false, text: String(o.text ?? ''), image: o.image || null }; }
      catch (e) { r = { id: c.id, ok: false, text: '出错：' + (e?.message || e) }; }
      onEvent({ type: 'result', name: c.name, ok: r.ok, text: r.text, image: r.image }); results.push(r);
    }
    if (calls >= maxCalls) results[results.length - 1].text += `\n（这次的步数快用完了：请停止调用工具，用一两句话告诉玩家做了什么、还可以接着让你做什么。）`;
    ai.agentResults(st, results);
    if (calls >= maxCalls + 6) return { st, done: false, summary: last, calls };
  }
}

// ================= 六边形岛 =================
const ISLAND_RULES = `你是治愈系六边形海岛游戏《屿见》里的 AI 造岛师。玩家把这座岛的操作权限交给了你：你可以像玩家一样（而且更快）动手——看岛、截图看效果、铺地块、摆植物动物建筑、用方块自由造游戏里没有的新东西、设计新生态（新地块）、调时间和海水。
怎么做：
1. 先 look_island 看清现状（已有的地块、物件、可用的地块类型和物件），必要时 screenshot 看画面。
2. 想清楚整体方案（这是什么样的地方、分哪几片、每片有什么），然后分批动手：先铺地块，再摆放；玩家要的东西游戏里没有时，用 create_make 自己搭、用 create_biome 自己设计生态——不要硬套现有的东西，也不要套固定模板，按玩家的心愿自己想造型和配色。
3. 每做完一批就 screenshot 看一眼（看整体用 island，看细节用 tile），发现不好看、不合理（比如东西挤在一起、地块不连贯、颜色突兀、尺寸不对）就自己改，直到满意。
4. 做完后停止调用工具，用两三句话告诉玩家做了什么、他可以接着让你做什么。
坐标：地块是六边形，用轴坐标 (q, r)；相邻的六格是 (q±1, r)、(q, r±1)、(q+1, r-1)、(q-1, r+1)。一块地外接圆半径 1 个单位，岛的中心通常在 (0,0) 附近。地块要连成片、像真实的地方：沙滩在岸边，溪流连成一条线流向海边，同类地块成片。
摆放：每块地摆 1–4 个东西就很满了，别挤；动物放在合适的地块上（羊在草地、螃蟹在沙滩、小船和浮标在紧挨岛的海面上）。
自由造物（create_make）：用“部件 + 任意大小的长方块”搭，单位是小格；size 是放到岛上的缩放（建筑 1.5–3）。形状、颜色、数量都不限制，但要符合下面的美术圣经，和游戏原有素材像同一个游戏。
`;
const MAKE_RULES = MAKE_SYSTEM;

export function islandAgent(app) {
  const cv = app.canvasMode, v = app.view, created = { makes: [], biomes: [] };
  const typeName = (t) => ITEMS.land.find((x) => (x.tile || x.id) === t)?.name || t;
  const tools = [
    T('look_island', '读取这座岛的现状：所有地块（按类型分组）、已经摆的东西（编号、种类、所在地块）、可以用的地块类型、可以摆放的物件（含玩家和你造的）、时间和海水。动手前先看。'),
    T('screenshot', '截一张游戏画面看效果（镜头会飞过去）。view=island 看整座岛（俯视）；view=tile 看某块地附近的细节（要给 q、r）。', { view: { type: 'string', enum: ['island', 'tile'] }, q: { type: 'integer' }, r: { type: 'integer' }, distance: { type: 'number', description: '看细节时镜头距离，默认 4（2 很近，8 较远）' } }, ['view']),
    T('set_tiles', '铺地块（已有的地块会被换掉）。type 用 look_island 给出的地块类型 id（包括你用 create_biome 新做的）；type=sea 表示挖掉变成海。一次最多 240 块。', { tiles: { type: 'array', items: { type: 'object', properties: { q: { type: 'integer' }, r: { type: 'integer' }, type: { type: 'string' } }, required: ['q', 'r', 'type'] } } }, ['tiles']),
    T('place', '在地块上摆东西：k 是物件 id（look_island 里列出的，或 create_make 返回的 mk_ 开头的 id），n 是数量（1–12，在这块地上随机散开），spread 是散开范围 0–0.8（默认 0.4）。', { items: { type: 'array', items: { type: 'object', properties: { k: { type: 'string' }, q: { type: 'integer' }, r: { type: 'integer' }, n: { type: 'integer' }, spread: { type: 'number' } }, required: ['k', 'q', 'r'] } } }, ['items']),
    T('remove', '移除摆放的东西：按编号（ids），或者某块地上的全部 / 某种（q、r、k）。', { ids: { type: 'array', items: { type: 'integer' } }, q: { type: 'integer' }, r: { type: 'integer' }, k: { type: 'string' } }),
    T('new_island', '清空整座岛（所有地块和物件），从零开始造一座新岛。只有玩家要“新岛 / 重新造”时才用。'),
    { name: 'create_make', description: '用方块自由造一个新东西（动物、植物、建筑、摆件，任何想象的东西），造好后会出现在建造栏「✦ 我造的」里，返回它的物件 id（mk_ 开头，用 place 摆到岛上）和两张渲染图让你检查。要修改已经造好的，传 replace_id（create_make 返回的 id）。', schema: { ...MAKE_SCHEMA, properties: { ...MAKE_SCHEMA.properties, replace_id: { type: 'string', description: '可选：要替换的已有造物 id（mk_ 开头）' } } } },
    { name: 'create_biome', description: '设计一种新生态（新地块类型）：地面三种颜色、起伏、地势、草和花的多少与颜色、长哪些植物（用 look_island 列出的植物名字，包括你造的植物）。返回它的地块类型 id（用 set_tiles 铺）和一块地的预览图。', schema: BIOME_SCHEMA },
    T('set_scene', '调时间和海水：hour 0–24（比如 6 清晨、12 正午、18 黄昏、21 夜晚），sea 是 clear（清澈）/ jade（翡翠）/ deep（深蓝）。', { hour: { type: 'number' }, sea: { type: 'string', enum: ['clear', 'jade', 'deep'] } }),
  ];
  const fly = async (x, z, dist, pitch) => { await app.rig.flyTo(x, z, dist, 0.6, { pitch }); const t0 = performance.now(); while (performance.now() - t0 < 3500 && (v.loading || v.rising?.some((a) => !a.done))) await wait(120); await wait(250); };
  const exec = async (name, a) => {
    if (name === 'look_island') {
      const byType = {}; for (const [q, r, t] of cv.s.tiles) (byType[t] ||= []).push(`${q},${r}`);
      const items = cv.s.items.slice(0, 260).map((it) => { const [q, r] = fromWorld(it.x, it.z), d = findItem(it.k); return `${it.id}:${d?.name || it.k}(${it.k})@${q},${r}`; });
      const list = (cat) => ITEMS[cat].filter((x) => !x.tile && !x.sea && x.hour === undefined && !x.event).map((x) => `${x.id}=${x.name.replace('✦', '')}${x.water ? '[海面]' : ''}`).join('、');
      const types = Object.keys(TYPES).map((t) => `${t}=${typeName(t).replace('✦', '')}`).join('、');
      return { text: `地块（${cv.s.tiles.length} 块，类型: 坐标 q,r）：\n${Object.entries(byType).map(([t, l]) => `${t}（${typeName(t)}）: ${l.join(' ')}`).join('\n') || '（空，一块地也没有）'}\n\n已摆的东西（编号:名字(物件id)@所在地块）：${items.join('；') || '（没有）'}\n\n可用地块类型：${types}\n可摆放 · 植物：${list('plant')}\n可摆放 · 动物：${list('animal')}\n可摆放 · 建筑：${list('build')}\n时间：${v.sky?.hour?.toFixed?.(1) ?? '?'} 点；海水：${cv.s.sea || 'clear'}` };
    }
    if (name === 'screenshot') {
      if (a.view === 'tile') { const [x, z] = toWorld(+a.q || 0, +a.r || 0); await fly(x, z, Math.max(1.6, Math.min(12, +a.distance || 4)), 0.6); }
      else { let cx = 0, cz = 0, n = 0; for (const [q, r] of cv.s.tiles) { const [x, z] = toWorld(q, r); cx += x; cz += z; n++; } cx /= n || 1; cz /= n || 1; let rad = 2; for (const [q, r] of cv.s.tiles) { const [x, z] = toWorld(q, r); rad = Math.max(rad, Math.hypot(x - cx, z - cz)); } await fly(cx, cz, Math.min(48, rad * 2.3 + 7), 0.95); }
      const img = await shrink(app.snapshot());
      return { text: a.view === 'tile' ? `地块 (${a.q},${a.r}) 附近的画面` : '整座岛的俯视画面', image: img };
    }
    if (name === 'set_tiles') { const o = cv.agentSetTiles(a.tiles); return { ok: o.set + o.removed > 0 || !o.bad.length, text: `铺了 ${o.set} 块、挖掉 ${o.removed} 块${o.bad.length ? `；没认出来的：${[...new Set(o.bad)].slice(0, 12).join('、')}（地块类型要用 look_island 里的 id）` : ''}。现在一共 ${cv.s.tiles.length} 块地。` }; }
    if (name === 'place') {
      let ok = 0; const fails = [];
      for (const it of (a.items || []).slice(0, 80)) {
        const n = Math.max(1, Math.min(12, Math.round(+it.n || 1))), sp = Math.max(0, Math.min(0.8, it.spread ?? 0.4)), [cx, cz] = toWorld(+it.q || 0, +it.r || 0);
        for (let i = 0; i < n; i++) {
          let res = null; for (let k = 0; k < 6; k++) { const ang = Math.random() * 6.28, d = n === 1 && k === 0 ? 0 : Math.sqrt(Math.random()) * sp; res = cv.agentPlace(it.k, cx + Math.cos(ang) * d, cz + Math.sin(ang) * d); if (typeof res === 'number') break; }
          if (typeof res === 'number') ok++; else fails.push(`${it.k}@${it.q},${it.r}：${res}`);
        }
      }
      cv.agentSave(); return { ok: ok > 0 || !fails.length, text: `摆好 ${ok} 个。${fails.length ? '没摆上的：' + [...new Set(fails)].slice(0, 10).join('；') : ''}` };
    }
    if (name === 'remove') {
      const ids = new Set((a.ids || []).map(Number)), hasTile = a.q != null && a.r != null;
      const n = cv.agentRemove((it) => { if (ids.size) return ids.has(it.id); const [q, r] = fromWorld(it.x, it.z); return (!hasTile || (q === +a.q && r === +a.r)) && (!a.k || it.k === a.k) && (hasTile || a.k); });
      return { text: `移除了 ${n} 个。` };
    }
    if (name === 'new_island') { cv.agentClear(); return { text: '岛已经清空（0 块地）。接下来用 set_tiles 铺新岛。' }; }
    if (name === 'create_make') {
      const m = sanitizeMake(a), rid = String(a.replace_id || '').replace(/^mk_/, ''), all = loadMakes(), i = rid ? all.findIndex((x) => x.id === rid) : -1;
      m.id = i >= 0 ? rid : newId('mk'); if (i >= 0) all[i] = m; else { all.unshift(m); created.makes.push(m.id); }
      if (!saveMakes(all)) return { ok: false, text: '保存失败：本机存储空间不够' };
      registerMakes(); cv.registerCustom(); app.hud?.refresh?.();
      // 摆在岛上的旧版本换成新的
      if (i >= 0) { const ids = cv.s.items.filter((it) => it.k === 'mk_' + m.id).map((it) => ({ ...it })); for (const it of ids) { v.items.remove(it.id, true); v.items.add(it); } }
      const b = bounds(m), H = ((b.max.y - Math.min(0, b.min.y)) * HEX_UNIT * (m.size || 1)).toFixed(2);
      return { text: `${i >= 0 ? '改好了' : '造好了'}「${m.name}」：物件 id = mk_${m.id}，${m.parts.length} 个部件、${m.parts.reduce((s, p) => s + p.boxes.length, 0)} 块，放到岛上约高 ${H} 个单位（羊约 0.17、茅屋约 0.7、一块地宽约 1.7）。图里左边是斜前方、右边是正侧面，检查一下形状、比例和颜色。`, image: await renderMake(m) };
    }
    if (name === 'create_biome') {
      const opts = plantOptions(), b = { ...sanitizeBiome(a, opts), id: newId('b') }, list = loadBiomes(), same = list.findIndex((x) => x.name === b.name);
      if (same >= 0) { b.id = list[same].id; list[same] = b; } else { list.unshift(b); created.biomes.push(b.id); }
      if (!saveBiomes(list)) return { ok: false, text: '保存失败：本机存储空间不够' };
      cv.registerCustom(); app.hud?.refresh?.();
      let img = null; try { const { thumb } = await import('./thumbs.js'), g = biomePreview(b); img = thumb(g, { w: 640, h: 420, pitch: 0.6, yaw: -0.6, bg: 0xe6eef0 }); g.userData.dispose?.(); } catch { img = null; }
      const dropped = (a.plants || []).filter((p) => !b.plants.some((x) => x.name === p.name)).map((p) => p.name);
      return { text: `生态「${b.name}」做好了：地块类型 id = ${tileId(b)}（用 set_tiles 铺）。植物：${b.plants.map((p) => p.name + ' ' + p.density).join('、') || '无'}${dropped.length ? `；这些植物游戏里没有，没用上：${dropped.join('、')}（可以先用 create_make 造出来，use 设成 plant）` : ''}。图是一块地的样子。`, image: img ? await shrink(img, 640) : null };
    }
    if (name === 'set_scene') {
      if (a.hour != null) app.setTimeMode('fixed', Math.max(0, Math.min(23.9, +a.hour)));
      if (a.sea) { cv.s.sea = a.sea; v.setSea?.(a.sea); cv.agentSave(); }
      return { text: `好了${a.hour != null ? `：${(+a.hour).toFixed(1)} 点` : ''}${a.sea ? `，海水 ${a.sea}` : ''}。` };
    }
    return { ok: false, text: '没有这个工具：' + name };
  };
  const snap = cv.agentSnapshot();
  return {
    system: ISLAND_RULES + '\n' + sopPrompt() + '\n\n造物格式说明：\n' + MAKE_RULES + '\n\n生态设计说明：\n' + BIOME_SYSTEM,
    tools, exec, created,
    undo() {
      cv.agentRestore(snap);
      if (created.makes.length) { saveMakes(loadMakes().filter((m) => !created.makes.includes(m.id))); registerMakes(); }
      if (created.biomes.length) saveBiomes(loadBiomes().filter((b) => !created.biomes.includes(b.id)));
      cv.registerCustom(); cv.syncAll(); app.hud?.refresh?.();
    },
  };
}

// ================= 造物台 =================
const STUDIO_RULES = `你在造物台里帮玩家用方块搭东西（动物、植物、建筑、摆件，任何想象的东西）。你有这个造物的编辑权限：view_make 看它现在的数据和渲染图；set_make 把它改成你写的版本（改完会自动给你看渲染图）。
怎么做：先想清楚它长什么样（整体轮廓、各部位、配色），写第一版；看渲染图，对照美术圣经的审图清单找问题（比例、方块大小层次、颜色层次、左右对称、关节、眼睛等细节），再改，直到满意（一般 2–4 轮）。造型、颜色、大小、数量都不限，不要套模板，按玩家说的自己设计。做完后停止调用工具，用一两句话说说做了什么。
`;
export function studioAgent(studio) {
  const tools = [
    T('view_make', '看现在这个造物：完整数据（JSON）和两张渲染图（左：斜前方，右：正侧面）。'),
    { name: 'set_make', description: '把造物整个改成你写的版本（部件 + 长方块，格式见说明）。改完会返回新的渲染图。', schema: MAKE_SCHEMA },
  ];
  const exec = async (name, a) => {
    if (name === 'view_make') { if (!studio.make) return { text: '现在是空白，还没有造物。用 set_make 写第一版。' }; return { text: JSON.stringify(stripMake(studio.make)), image: await renderMake(studio.make) }; }
    if (name === 'set_make') {
      const m = sanitizeMake(a);
      if (studio.make) { studio._snapshot(); const keep = studio.undoS; m.id = studio.make.id; studio.edit(m); studio.undoS = keep; }
      else { m.id = newId('mk'); studio.edit(m); studio.undoS = ['{}']; }
      studio._sync();
      return { text: `改好了：「${m.name}」${m.parts.length} 个部件、${m.parts.reduce((s, p) => s + p.boxes.length, 0)} 块。检查渲染图（左：斜前方，右：正侧面）。`, image: await renderMake(m) };
    }
    return { ok: false, text: '没有这个工具：' + name };
  };
  return { system: STUDIO_RULES + '\n' + MAKE_SYSTEM + '\n\n' + sopPrompt(), tools, exec };
}

// ================= 界面 =================
const NAMES = { look_island: '看岛', screenshot: '截图看效果', set_tiles: '铺地块', place: '摆放', remove: '移除', new_island: '清空岛', create_make: '自由造物', create_biome: '设计生态', set_scene: '调时间 / 海水', view_make: '看造物', set_make: '改造物' };
function callText(name, a) {
  if (name === 'set_tiles') return `铺地块 ×${(a.tiles || []).length}`;
  if (name === 'place') return `摆放：${(a.items || []).slice(0, 4).map((x) => (findItem(x.k)?.name || x.k).replace('✦', '') + (x.n > 1 ? '×' + x.n : '')).join('、')}${(a.items || []).length > 4 ? '…' : ''}`;
  if (name === 'create_make' || name === 'set_make') return `${NAMES[name]}「${esc(a.name || '')}」`;
  if (name === 'create_biome') return `设计生态「${esc(a.name || '')}」`;
  if (name === 'screenshot') return a.view === 'tile' ? `截图看 (${a.q},${a.r})` : '截图看整座岛';
  return NAMES[name] || name;
}
/** host：挂在哪个元素下；mk()：开始时创建这一局的工具集（{ system, tools, exec, undo? }） */
export class AgentPanel {
  constructor(host, { ai, title, intro, placeholder, examples = [], mk, onClose, onSettings }) {
    this.ai = ai; this.mk = mk; this.onClose = onClose; this.onSettings = onSettings; this.st = null; this.ctx = null; this.running = false;
    const el = this.el = document.createElement('div'); el.className = 'agent';
    el.innerHTML = `<header><b>${esc(title)}</b><span class="ag-st"></span><button class="ag-b" data-ag="min">收起</button><button class="ag-b" data-ag="close">关闭</button></header>
      <div class="ag-main">
        <div class="ag-input"><p class="ag-note">${intro}</p><textarea rows="3" placeholder="${esc(placeholder)}"></textarea>
          <label class="ag-img">＋ 附一张参考图（可选）<input type="file" accept="image/*" hidden></label>
          <div class="ag-chips">${examples.map((t) => `<button data-ex="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <div class="ag-row"><button class="ag-b ghost" data-ag="bible">美术圣经</button><button class="ag-b go" data-ag="go">开始</button></div><p class="ag-msg"></p></div>
        <div class="ag-log"></div>
        <div class="ag-bible" hidden><button class="ag-b" data-ag="back">‹ 返回</button><div class="ag-sop">${sopHTML()}</div></div>
      </div>
      <footer><button class="ag-b" data-ag="stop" hidden>停止</button><button class="ag-b" data-ag="undo" hidden>撤销这次的全部改动</button><button class="ag-b" data-ag="more" hidden>继续提要求</button><button class="ag-b go" data-ag="done" hidden>完成</button></footer>`;
    this.pill = document.createElement('button'); this.pill.className = 'agent-pill'; this.pill.hidden = true; this.pill.textContent = '✦ AI 助手';
    host.appendChild(el); host.appendChild(this.pill);
    const $ = (s) => el.querySelector(s); this.$ = $;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const ex = e.target.closest('[data-ex]'); if (ex) { $('textarea').value = ex.dataset.ex; return; }
      const b = e.target.closest('[data-ag]'); if (!b) return; const k = b.dataset.ag;
      if (k === 'go') this.start($('textarea').value.trim());
      else if (k === 'min') this.minimize(true);
      else if (k === 'close') this.close();
      else if (k === 'stop') this.abort?.abort();
      else if (k === 'bible') { $('.ag-bible').hidden = false; $('.ag-input').hidden = true; $('.ag-log').hidden = true; }
      else if (k === 'back') { $('.ag-bible').hidden = true; $('.ag-input').hidden = this.running || (!!this.st && !this.asking); $('.ag-log').hidden = false; }
      else if (k === 'undo') { if (!confirm('撤销 AI 这次的全部改动？')) return; this.ctx?.undo?.(); this.log('note', '已撤销这次的全部改动。'); this._ends(false); }
      else if (k === 'more') { this.asking = true; $('.ag-input').hidden = false; $('textarea').value = ''; $('textarea').placeholder = '接着说想怎么改，比如：再加一片樱花林；把小屋换成红顶的'; this._ends(false); $('textarea').focus(); }
      else if (k === 'done') this.close(true);
    });
    for (const ev of ['pointerdown', 'wheel', 'touchstart']) { el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }); }
    this.pill.addEventListener('click', (e) => { e.stopPropagation(); this.minimize(false); });
    $('.ag-img input').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (!f) return; const url = URL.createObjectURL(f), i = new Image(); i.onload = () => { const k = Math.min(1, 768 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = Math.round(i.width * k); c.height = Math.round(i.height * k); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); this.img = c.toDataURL('image/jpeg', 0.85); URL.revokeObjectURL(url); $('.ag-img').innerHTML = `<img src="${this.img}" alt="参考图"> 已附参考图（点这里换一张）<input type="file" accept="image/*" hidden>`; $('.ag-img input').addEventListener('change', (ev) => { e.target.files = ev.target.files; }); }; i.src = url; });
    this.pill.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  minimize(on) { this.el.hidden = on; this.pill.hidden = !on; }
  log(kind, html, img = null) {
    const L = this.$('.ag-log'), d = document.createElement('div'); d.className = 'ag-' + kind; d.innerHTML = html;
    if (img) { const i = document.createElement('img'); i.src = img; i.alt = '截图'; i.onclick = () => i.classList.toggle('big'); d.appendChild(i); }
    L.appendChild(d); L.scrollTop = L.scrollHeight;
  }
  _status(t) { this.$('.ag-st').textContent = t; this.pill.textContent = '✦ ' + t + '（点开）'; }
  _ends(done) { const $ = this.$; $('[data-ag="stop"]').hidden = !this.running; for (const k of ['undo', 'more', 'done']) $(`[data-ag="${k}"]`).hidden = this.running || !done; }
  async start(goal) {
    const $ = this.$, msg = $('.ag-msg');
    if (!this.ai?.ready) { msg.innerHTML = '还没配置 AI。' + (this.onSettings ? '<button class="ag-b" data-ag2="set">去配置</button>' : '在「设置 → AI」里选服务商、填 API 密钥。'); msg.querySelector('[data-ag2]')?.addEventListener('click', () => this.onSettings()); return; }
    if (!goal) { msg.textContent = '先写一句想要什么'; return; }
    msg.textContent = ''; this.asking = false;
    if (!this.ctx) this.ctx = this.mk();
    $('.ag-input').hidden = true; this.running = true; this._ends(false);
    this.log('goal', '你：' + esc(goal), this.img); this._status('AI 正在想……');
    const say = this.img ? { text: goal, image: this.img } : goal; this.img = null;
    this.abort = new AbortController(); let n = 0;
    try {
      const r = await runAgent(this.ai, { st: this.st, system: this.ctx.system, goal: say, tools: this.ctx.tools, exec: this.ctx.exec, signal: this.abort.signal, onState: (s) => { this.st = s; },
        onEvent: (e) => {
          if (e.type === 'think') this.log('think', esc(e.text).replace(/\n/g, '<br>'));
          else if (e.type === 'call') { n++; this._status(`第 ${n} 步：${NAMES[e.name] || e.name}`); this.log('call', '🔧 ' + callText(e.name, e.input)); }
          else this.log(e.ok ? 'res' : 'err', (e.ok ? '✓ ' : '✗ ') + esc(e.text.length > 160 ? e.text.slice(0, 160) + '…' : e.text).replace(/\n/g, '<br>'), e.image);
        } });
      this.st = r.st; this._status(r.stopped ? '已停止' : `做完了（${r.calls} 步）`);
      if (r.stopped) this.log('note', '已停止。做到一半的改动还在，可以撤销或继续提要求。');
    } catch (e) {
      if (this.abort.signal.aborted) { this._status('已停止'); this.log('note', '已停止。做到一半的改动还在，可以撤销或继续提要求。'); }
      else { this._status('出错了'); this.log('err', '没做完：' + esc(aiError(e))); }
    }
    this.running = false; this._ends(true); this.minimize(false);
  }
  close(keep = false) {
    if (this.running) { if (!confirm('AI 还在动手，停止并关闭？（已经做的改动保留）')) return; this.abort?.abort(); }
    this.el.remove(); this.pill.remove(); this.onClose?.(keep);
  }
}
