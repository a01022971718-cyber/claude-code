const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms)), S = g.studio;
S.open(); await wait(300); document.querySelector('[data-s="tpl"][data-t="blank"]').click(); await wait(800);
const b = S.make.parts[0].boxes[0]; b.r = [0, 45, 0]; S.sel = b; S._rebuild(); S._sync(); await wait(300);
const c = g.canvas, fire = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
const h = S.handles.children.find((x) => x.userData.handle.ax === 0 && x.userData.handle.s === 1), hw = h.getWorldPosition(new h.position.constructor()), [hx, hy] = g.rig.project(hw.x, hw.y, hw.z);
const [vx, vy] = S._dirPx(b.p, new h.position.constructor(1, 0, 0).applyQuaternion(S._rotQ(b))), L = Math.hypot(vx, vy);
const p0 = [...b.p];
fire('pointerdown', hx, hy); for (let i = 1; i <= 6; i++) { fire('pointermove', hx + vx / L * i * 10, hy + vy / L * i * 10); await wait(16); } fire('pointerup', hx + vx / L * 60, hy + vy / L * 60); await wait(300);
await window.__shot('rot');
// 期望：x 方向变长，中心沿 45° 方向移动（x、z 同时变，且变化量相等）
return { s: b.s, dp: b.p.map((v, i) => +(v - p0[i]).toFixed(2)) };
