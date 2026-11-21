const g = window.__game, wait = (ms) => new Promise((r) => setTimeout(r, ms));
window.prompt = () => '小石屋'; window.confirm = () => true;
localStorage.removeItem('yujian_blueprints_v1'); localStorage.removeItem('yujian_makes_v1');
g.world.genFlat(); g.rebuild(Infinity);
const c = g.canvas, fire = (type, x, y) => c.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
const S = 0.25, scr = (x, y, z) => g.rig.project((x + 0.5) * S, (y + 0.5) * S, (z + 0.5) * S);
g.rig.focus.set(96 * S, 0, 96 * S); g.rig.setView({ dist: 8, pitch: 0.8, yaw: -0.5 }); await wait(1200);
const cnt = () => g.world.v.reduce((s, x) => s + (x ? 1 : 0), 0);
g.setTool('build'); g.slot = 2; g.cur = g.hot[2]; g._renderHot();
const n0 = cnt();
// 点一下放（地面 y=17 是草地顶层，点在 (96,17,96) 的顶面）
let [x, y] = scr(96, 17, 96); fire('pointerdown', x, y); await wait(60); fire('pointerup', x, y); await wait(100);
const n1 = cnt();
// 划动连续摆一排
[x, y] = scr(90, 17, 100); fire('pointerdown', x, y); for (let i = 1; i <= 10; i++) { const [a, b] = scr(90 + i, 17, 100); fire('pointermove', a, b); await wait(16); } fire('pointerup', ...scr(100, 17, 100)); await wait(100);
const n2 = cnt();
// 按住拆
[x, y] = scr(96, 18, 96); fire('pointerdown', x, y); await wait(520); fire('pointerup', x, y); await wait(100);
const n3 = cnt();
// 选取：点草地
document.querySelector('[data-a="pickOnce"]').click(); [x, y] = scr(80, 17, 80); fire('pointerdown', x, y); await wait(60); fire('pointerup', x, y); await wait(100);
const picked = g.cur;
// 搭一座小屋：直接写方块
const ID = (k) => ({ stoneBrick: 13, roofRed: 17, glass: 20, oakPlank: 9 })[k];
for (let yy = 18; yy < 22; yy++) for (let zz = 104; zz < 110; zz++) for (let xx = 100; xx < 106; xx++) { const wall = xx === 100 || xx === 105 || zz === 104 || zz === 109; if (wall) g.world.set(xx, yy, zz, yy === 20 && (xx === 102 || xx === 103) ? ID('glass') : ID('stoneBrick')); }
for (let zz = 103; zz < 111; zz++) for (let xx = 99; xx < 107; xx++) g.world.set(xx, 22, zz, ID('roofRed'));
g.rebuild(Infinity);
// 框选两个角 → 存为蓝图并带回六边形岛
g.setTool('select'); g.selCorner([99, 18, 103]); g.selCorner([106, 22, 110]);
document.querySelector('[data-a="selSaveIsland"]').click(); await wait(200);
const bps = JSON.parse(localStorage.getItem('yujian_blueprints_v1') || '[]'), mks = JSON.parse(localStorage.getItem('yujian_makes_v1') || '[]');
// 放一个转向后的副本
g.startPlace(bps[0]); g.place.at = [112, 18, 104]; g.placeRot(); g._movePreview(); await wait(300);
g.rig.focus.set(105 * S, 0, 106 * S); g.rig.setView({ dist: 7, pitch: 0.7, yaw: -0.5 }); await wait(1200); await window.__shot('preview');
const n4 = cnt(); document.querySelector('[data-a="pOk"]').click(); g.rebuild(Infinity); await wait(800);
const n5 = cnt(); await window.__shot('placed');
return { placeOne: n1 - n0, row: n2 - n1, holdBreak: n3 - n2, picked, bp: bps.map((b) => b.name + ' ' + b.size.join('x')), make: mks.map((m) => m.name + ' boxes=' + m.parts[0].boxes.length + ' size=' + m.size.toFixed(2)), copied: n5 - n4 };
