// AI 造岛里的新物种，统一用造物台的方式搭（部件 + 大小不同的长方块 + 每部位一组颜色），和手造、原版是同一种画风。
// 流程：AI 造岛先给出物种的“设定”（名字、形态、颜色、习性），再逐个交给 AI 造物（ai.make）搭成造物，存进“我的造物”。
// 以前用旧方法造的 AI 物种（比如珠贝兽），也可以一键按新方法重做。
import { bounds, loadMakes, saveMakes, HEX_UNIT } from './model.js';

const FORM = { tree: '阔叶树', conifer: '针叶树', palm: '棕榈树', bush: '灌木', reed: '水草芦苇', mushroom: '蘑菇', flower: '花', cactus: '仙人掌', crystal: '晶簇' };
const MOVE = { walk: '走', hop: '跳', fly: '飞', swim: '在海面游', slither: '扭着走' };
const ACC = { fruit: '挂着果子', flower: '开着小花', spots: '有斑点', glow: '微微发光' };
export function describePlant(p) {
  return `植物「${p.name}」：一种${FORM[p.form] || '植物'}，高约 ${Math.round((p.height || 0.8) / HEX_UNIT)} 小格；树干 / 茎颜色 ${p.trunkColor}，叶冠颜色 ${p.crownColor} 和 ${p.crownColor2}${p.accent && p.accent !== 'none' ? `，${ACC[p.accent]}（${p.accentColor}）` : ''}。树冠做成随风摆（sway）的部件。`;
}
export function describeCreature(c) {
  const parts = [`${c.legs ?? 4} 条腿`, c.ears && c.ears !== 'none' ? `${{ round: '圆', long: '长', pointy: '尖' }[c.ears]}耳朵` : '', c.horns && c.horns !== 'none' ? (c.horns === 'antlers' ? '分叉的角' : '小角') : '', c.tail && c.tail !== 'none' ? `${{ short: '短', long: '长', fluffy: '蓬松', fin: '鳍状' }[c.tail]}尾巴` : '', c.wings ? '一对翅膀' : '', c.pattern && c.pattern !== 'none' ? { spots: '身上有斑点', stripes: '身上有条纹', belly: '浅色肚皮' }[c.pattern] : ''].filter(Boolean);
  return `动物「${c.name}」：身长约 ${Math.round((c.size || 0.08) / HEX_UNIT)} 小格，主色 ${c.color}，副色 ${c.color2}，${parts.join('、')}；会${MOVE[c.move] || '走'}。腿 / 翅膀 / 头做成会动的部件。`;
}
/** 把造物缩放到目标尺寸（植物按高度、动物按身长，单位：六边形岛的世界单位） */
function fit(m, target, by) { const b = bounds(m), len = by === 'h' ? b.max.y - Math.max(0, b.min.y) : Math.max(b.max.z - b.min.z, b.max.x - b.min.x); if (len > 0) m.size = Math.max(0.2, Math.min(4, target / (len * HEX_UNIT))); return m; }
const newId = () => 'mk' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);

/** 一条旧格式的物种设定 → 造物（已存进“我的造物”） */
export async function makeFromRecipe(ai, r, kind) {
  const m = await ai.make(kind === 'plant' ? describePlant(r) : describeCreature(r));
  m.id = newId(); m.name = r.name;
  if (kind === 'plant') { m.use = 'plant'; m.behavior = 'still'; fit(m, r.height || 0.8, 'h'); }
  else { m.use = 'creature'; m.behavior = r.move === 'slither' ? 'walk' : r.move || 'walk'; m.habitat = r.habitat; m.count = r.count; fit(m, r.size || 0.08, 'len'); }
  return m;
}
/** 并发跑（最多 n 个同时请求），失败的跳过并记下原因 */
export async function pool(items, n, fn) {
  const out = new Array(items.length), errs = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { errs.push(e); } } }));
  return { out, errs };
}
export function storeMakes(list) { const all = loadMakes(); for (const m of list) { const i = all.findIndex((x) => x.id === m.id); if (i >= 0) all[i] = m; else all.unshift(m); } return saveMakes(all); }
