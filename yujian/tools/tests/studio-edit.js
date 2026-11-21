const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)), S = g.studio;
localStorage.removeItem('yujian_makes_v1');
S.open(); await wait(800); await window.__shot('lib');
document.querySelector('[data-s="tpl"][data-t="fluffy"]').click(); await wait(1500); await window.__shot('fluffy');
const c = g.canvas, fire = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
// 添加：点身体顶面加一块（对称会加两块）
const n0 = S.make.parts.reduce((s, p) => s + p.boxes.length, 0);
S.tool = 'add'; S._sync();
const top = S.make.parts[0].boxes[S.make.parts[0].boxes.length - 1];
const v = S.stage.localToWorld(S.stage.position.clone().set(top.p[0] + 2, top.p[1] + top.s[1] / 2, top.p[2]));
const [sx, sy] = g.rig.project(v.x, v.y, v.z);
fire('pointerdown', sx, sy); await wait(60); fire('pointerup', sx, sy); await wait(300);
const n1 = S.make.parts.reduce((s, p) => s + p.boxes.length, 0);
// 上色：把新块涂成粉色
S.color = '#f080a8'; S.tool = 'paint'; fire('pointerdown', sx, sy - 6); await wait(60); fire('pointerup', sx, sy - 6); await wait(200);
// 选中 + 拖手柄改大小
S.tool = 'select'; S.sel = S.make.parts[0].boxes[S.make.parts[0].boxes.length - 1]; S._rebuild(); S._sync(); await wait(200);
const h = S.handles.children.find((x) => x.userData.handle.ax === 1 && x.userData.handle.s === 1), hw = h.getWorldPosition(h.position.clone()), [hx, hy] = g.rig.project(hw.x, hw.y, hw.z);
const s0 = S.sel.s[1]; fire('pointerdown', hx, hy); for (let i = 1; i <= 6; i++) { fire('pointermove', hx, hy - i * 8); await wait(16); } fire('pointerup', hx, hy - 48); await wait(300);
const s1 = S.sel?.s[1];
await window.__shot('edited');
S.togglePlay(); await wait(700); await window.__shot('play'); S.togglePlay();
S.el.querySelector('.s-name').value = '粉角毛团';
S.save({ use: 'creature', behavior: 'walk', size: 1 });

return { n0, n1, added: n1 - n0, s0, s1, saved: JSON.parse(localStorage.getItem('yujian_makes_v1')).map((m) => m.name + ':' + m.parts.length) };
