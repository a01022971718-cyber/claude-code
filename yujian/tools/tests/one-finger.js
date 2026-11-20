// 单手操作：造物台里单指在空处拖 = 转视角（不会动方块），落在方块上 = 编辑
const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)), S = g.studio;
S.open(); await wait(500); document.querySelector('[data-s="tpl"][data-t="fluffy"]').click(); await wait(800);
S.tool = 'select'; S._sync();
const c = g.canvas, fire = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
const snap = JSON.stringify(S.make), yaw0 = g.rig.target.yaw;
fire('pointerdown', 120, 600); for (let i = 1; i <= 10; i++) { fire('pointermove', 120 + i * 15, 600); await wait(16); } fire('pointerup', 270, 600); await wait(400);
return { yawChanged: Math.abs(g.rig.target.yaw - yaw0) > 0.2, makeUnchanged: JSON.stringify(S.make) === snap };
