// 造物台：返回回到列表（不直接退出）；没配 AI 时就地配置；AI 帮我做 = 代理（写一版 → 看渲染图 → 改 → 收尾）（模拟 Claude 回复）
const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)), S = g.studio;
localStorage.removeItem('yujian_makes_v1'); window.confirm = () => true;
S.open(); await wait(500);
document.querySelector('[data-s="tpl"][data-t="fluffy"]').click(); await wait(800);
document.querySelector('.s-top [data-s="close"]').click(); await wait(300);
const out = { backToLib: S.on && !!document.querySelector('.s-sheet [data-s="bnew"]') && !S.make };
// 没配 AI：面板里点开始 → 提示去配置 → 造物台里的 AI 设置
Object.defineProperty(g.ai, 'ready', { value: false, configurable: true });
document.querySelector('.s-sheet [data-s="ai"]').click(); await wait(300);
document.querySelector('.agent textarea').value = '一只圆滚滚的橘猫'; document.querySelector('.agent [data-ag="go"]').click(); await wait(200);
document.querySelector('.agent [data-ag2="set"]')?.click(); await wait(200);
out.aiSettings = !!document.querySelector('.s-sheet [name="prov"]');
document.querySelector('.s-sheet [data-s="sheetClose"]').click(); await wait(100);
// 配好（模拟）后开始
const ai = g.ai; Object.defineProperty(ai, 'ready', { value: true, configurable: true });
const cat = (tail) => ({ name: '橘猫团子', use: 'creature', behavior: 'walk', size: 1, parts: [
  { name: '身体', pivot: [0, 0, 0], motion: 'none', axis: 'x', amp: 1, speed: 1, phase: 0, boxes: [{ p: [0, 7, 0], s: [7, 6, 11], r: [0, 0, 0], c: '#e8923a', shade: true }, { p: [0, 11, 7.5], s: [7, 6, 6], r: [0, 0, 0], c: '#e8923a', shade: true }, { p: [1.7, 11.8, 10.6], s: [1, 1.3, 0.4], r: [0, 0, 0], c: '#2a2420', shade: false }, { p: [-1.7, 11.8, 10.6], s: [1, 1.3, 0.4], r: [0, 0, 0], c: '#2a2420', shade: false }] },
  { name: '尾巴', pivot: [0, 9, -5.5], motion: 'swing', axis: 'y', amp: 0.8, speed: 1.2, phase: 0, boxes: [{ p: [0, 12, -7], s: [1.6, tail, 1.6], r: [-25, 0, 0], c: '#c46a24', shade: true }] }] });
let uid = 0; const tu = (name, input) => ({ type: 'tool_use', id: 'tu' + (++uid), name, input }), sent = []; let i = 0;
const script = [{ content: [{ type: 'text', text: '先搭一版。' }, tu('set_make', cat(5))], stop_reason: 'tool_use' }, { content: [{ type: 'text', text: '尾巴太短，加长。' }, tu('set_make', cat(9))], stop_reason: 'tool_use' }, { content: [tu('view_make', {})], stop_reason: 'tool_use' }, { content: [{ type: 'text', text: '做好了：一只圆滚滚的橘猫，尾巴加长了。' }], stop_reason: 'end_turn' }];
ai.client = () => ({ beta: { messages: { create: async (p) => { sent.push(JSON.parse(JSON.stringify(p))); await wait(30); return script[Math.min(i++, script.length - 1)]; } } } });
document.querySelector('.agent [data-ag="go"]').click();
for (let k = 0; k < 60 && S.agentP?.running !== false; k++) await wait(400);
await wait(500); await window.__shot('agent');
const last = sent[1]?.messages?.at(-1)?.content || [], img = Array.isArray(last) && last.some((r) => Array.isArray(r.content) && r.content.some((c) => c.type === 'image'));
out.agent = { steps: sent.length, tools: (sent[0]?.tools || []).map((t) => t.name), name: S.make?.name, tail: S.make?.parts?.[1]?.boxes?.[0]?.s?.[1], renderToModel: img, noTemplate: !String(sent[0]?.system || '').includes('毛团兽'), done: document.querySelector('.agent .ag-log').textContent.includes('做好了'), undoable: S.undoS.length > 0 };
return out;
