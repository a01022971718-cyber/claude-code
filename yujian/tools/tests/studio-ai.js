const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)), S = g.studio;
const cat = { name: '橘猫团子', use: 'creature', behavior: 'walk', size: 1, parts: [
  { name: '身体', pivot: [0,0,0], motion: 'none', axis: 'x', amp: 1, speed: 1, phase: 0, boxes: [
    { p: [0, 7, 0], s: [7, 6, 11], r: [0,0,0], c: '#e8923a', shade: true }, { p: [0, 5.2, 0.5], s: [5, 2.4, 8], r: [0,0,0], c: '#f6e2c4', shade: true },
    { p: [0, 10.1, -1], s: [6.4, 0.8, 1.6], r: [0,0,0], c: '#c46a24', shade: false }, { p: [0, 10.1, 2.4], s: [6.4, 0.8, 1.6], r: [0,0,0], c: '#c46a24', shade: false } ] },
  { name: '头', pivot: [0, 9, 5], motion: 'swing', axis: 'x', amp: 0.3, speed: 0.5, phase: 0, boxes: [
    { p: [0, 11, 7.5], s: [7, 6, 6], r: [0,0,0], c: '#e8923a', shade: true }, { p: [0, 9.6, 10.6], s: [3.4, 2.2, 1], r: [0,0,0], c: '#f6e2c4', shade: false },
    { p: [2.4, 14.6, 7], s: [2, 2.6, 1], r: [0,0,-12], c: '#e8923a', shade: false }, { p: [-2.4, 14.6, 7], s: [2, 2.6, 1], r: [0,0,12], c: '#e8923a', shade: false },
    { p: [2.4, 14.4, 7.6], s: [1, 1.4, 0.4], r: [0,0,-12], c: '#f4a6b0', shade: false }, { p: [-2.4, 14.4, 7.6], s: [1, 1.4, 0.4], r: [0,0,12], c: '#f4a6b0', shade: false },
    { p: [1.7, 11.8, 10.6], s: [1, 1.3, 0.4], r: [0,0,0], c: '#2a2420', shade: false }, { p: [-1.7, 11.8, 10.6], s: [1, 1.3, 0.4], r: [0,0,0], c: '#2a2420', shade: false },
    { p: [0, 10.4, 11.2], s: [0.9, 0.6, 0.4], r: [0,0,0], c: '#d4707a', shade: false } ] },
  { name: '尾巴', pivot: [0, 9, -5.5], motion: 'swing', axis: 'y', amp: 0.8, speed: 1.2, phase: 0, boxes: [ { p: [0, 12, -7], s: [1.6, 7, 1.6], r: [-25,0,0], c: '#e8923a', shade: true }, { p: [0, 15.4, -8.6], s: [1.8, 1.8, 1.8], r: [0,0,0], c: '#c46a24', shade: false } ] },
  ...[['左前腿', 2.2, 3.5, 0], ['右前腿', -2.2, 3.5, 0.5], ['左后腿', 2.2, -3.5, 0.5], ['右后腿', -2.2, -3.5, 0]].map(([name, x, z, phase]) => ({ name, pivot: [x, 5, z], motion: 'walk', axis: 'x', amp: 1, speed: 1, phase, boxes: [ { p: [x, 2.5, z], s: [2, 5, 2], r: [0,0,0], c: '#e8923a', shade: false }, { p: [x, 0.6, z + 0.3], s: [2.2, 1.2, 2.4], r: [0,0,0], c: '#f6e2c4', shade: false } ] })),
] };
Object.defineProperty(g.ai, 'ready', { value: true, configurable: true });
let sent = null; g.ai._ask = async (params) => { sent = params; return { text: JSON.stringify(cat), res: {} }; };
localStorage.removeItem('yujian_makes_v1');
S.open(); await wait(400);
document.querySelector('.s-sheet [data-s="ai"]').click(); await wait(300); await window.__shot('panel');
document.querySelector('.s-aitext').value = '一只圆滚滚的橘猫'; document.querySelector('[data-s="aiGo"]').click(); await wait(1500);
await window.__shot('result');
S.togglePlay(); await wait(800); await window.__shot('play'); S.togglePlay();
// 再让 AI 改一次（走“改现在这个”）
document.querySelector('[data-s="ai"]').click(); await wait(300); document.querySelector('input[name=aimode][value=edit]').checked = true; document.querySelector('.s-aitext').value = '尾巴更长'; document.querySelector('[data-s="aiGo"]').click(); await wait(800);
const editHasBase = sent.messages[0].content.includes('现在的造物');
S.save({ use: 'creature', behavior: 'walk', size: 1 });
return { boxes: S.make.parts.reduce((s, p) => s + p.boxes.length, 0), parts: S.make.parts.length, name: S.make.name, sysHasBible: sent.system.includes('体素美术圣经'), editHasBase, saved: JSON.parse(localStorage.getItem('yujian_makes_v1')).length };
