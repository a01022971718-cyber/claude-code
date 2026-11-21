// 造物台效率：多选、整组拖动 / 缩放 / 转 90°、部件复制和镜像；✦ 精修（模拟 AI 回复）
const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)), S = g.studio;
localStorage.removeItem('yujian_makes_v1');
S.open(); await wait(600);
document.querySelector('[data-s="tpl"][data-t="fluffy"]').click(); await wait(1200);
const c = g.canvas, fire = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
const scr = (p) => { const v = S.stage.localToWorld(new g.rig.focus.constructor(...p)); return g.rig.project(v.x, v.y, v.z); };
const partIdx = (n) => S.make.parts.findIndex((p) => p.name === n);
const out = {};
// 1) 选中整个“头”部件，按住拖动 → 整组上移、关节点跟着走
S.cur = partIdx('头'); S.selectPart(); await wait(200);
const head = S.make.parts[S.cur], y0 = head.boxes.map((b) => b.p[1]), pv0 = head.pivot[1];
const [hx, hy] = scr(head.boxes[0].p); fire('pointerdown', hx, hy); for (let i = 1; i <= 8; i++) { fire('pointermove', hx, hy - i * 10); await wait(16); } fire('pointerup', hx, hy - 80); await wait(300);
const dys = head.boxes.map((b, i) => +(b.p[1] - y0[i]).toFixed(2));
out.groupMove = { n: S.selSet.length, dys: [...new Set(dys)], pivotDy: +(head.pivot[1] - pv0).toFixed(2) };
await window.__shot('group');
// 2) 整组放大：耳朵仍左右对称
const ear = head.boxes.find((b) => b.p[0] > 2), earO = head.boxes.find((b) => Math.abs(b.p[0] + ear.p[0]) < 0.05 && b !== ear);
S.scaleSel(1.25); await wait(100);
out.scale = { earS: ear.s[0], sym: !!earO && Math.abs(ear.p[0] + earO.p[0]) < 0.05 };
// 3) 转 90°
const b0 = [...head.boxes[0].p]; S.rotGroup(); out.rot = { moved: head.boxes[0].p.some((v, i) => Math.abs(v - b0[i]) > 0.01), ry: head.boxes[0].r[1] };
// 4) 部件镜像 / 复制
const nP = S.make.parts.length; S.cur = partIdx('左前腿'); S.mirrorPart(); const mp = S.make.parts[S.make.parts.length - 1];
out.mirror = { parts: S.make.parts.length - nP, name: mp.name, pivotX: mp.pivot[0], phase: mp.phase };
S.dupPart(); out.dup = S.make.parts.length - nP;
// 5) 多选：开“多选”，点两块
S._selOne(null); S.multiOn = true; S._sync(); const body = S.make.parts[partIdx('身体')];
for (const b of [body.boxes[6], body.boxes[11]]) { const [x, y] = scr([b.p[0], b.p[1] + b.s[1] / 2 - 0.2, b.p[2]]); const hh = S._hit(x, y); (out.taps ||= []).push([Math.round(x), Math.round(y), hh?.box ? body.boxes.indexOf(hh.box) : hh?.handle ? 'handle' : hh?.stage ? 'stage' : null]); fire('pointerdown', x, y); await wait(40); fire('pointerup', x, y); await wait(150); out.taps.push(S.selSet.length); }
out.multi = S.selSet.length; await window.__shot('multi'); S.multiOn = false;
// 6) 全选缩小：脚底仍贴台面
S.selectAll(); S.scaleSel(0.8); const { bounds } = { bounds: (m) => { let mn = Infinity; for (const p of m.parts) for (const b of p.boxes) mn = Math.min(mn, b.p[1] - b.s[1] / 2); return mn; } }; out.minY = +bounds(S.make).toFixed(2);
// 7) ✦ 精修（模拟 AI）：带渲染图发出去，结果替换当前造物，能撤销
Object.defineProperty(g.ai, 'ready', { value: true, configurable: true });
let sent = null; const before = JSON.stringify(S.make);
g.ai._ask = async (params) => { sent = params; const m = JSON.parse(before); m.parts[0].boxes.push({ p: [0, 20, 0], s: [2, 2, 2], r: [0, 0, 0], c: '#f2c45a', shade: true }); return { text: JSON.stringify({ ...m, notes: '头太小、缺高光，加大了头并补了眼睛高光' }), res: {} }; };
S.showRefine = true; S._sync(); const btnShown = !document.querySelector('.s-refine').hidden;
await S.refine(); await wait(300); await window.__shot('refined');
const img = Array.isArray(sent?.messages?.[0]?.content) && sent.messages[0].content.some((b) => b.type === 'image');
const nAfter = S.make.parts.reduce((s, p) => s + p.boxes.length, 0); S.undo(); const nUndo = S.make.parts.reduce((s, p) => s + p.boxes.length, 0);
out.refine = { btnShown, img, hasNotes: (document.querySelector('.s-toast')?.textContent || '').includes('头太小'), added: nAfter - nUndo, schemaNotes: !!sent?.output_config?.format?.schema?.properties?.notes };
return out;
