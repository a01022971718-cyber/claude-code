/* 左侧建造栏（v8，主创要求：像植物大战僵尸——建筑卡片放在左侧一列）
 * - 点一下卡片 = 选中（卡片发亮，电脑上虚影跟着鼠标），再点战场 = 放下；再点同一张卡片、右键或 Esc = 取消。
 * - 按住卡片直接拖到战场上松手 = 放下；拖动中松手在建造栏上、或者位置不能建（红色虚影）= 取消。
 * - 放下后自动取消选中（和植物大战僵尸一样）；按住 Shift 点战场可以连续建造。
 * - 卡片显示造价；买不起或没解锁时变暗。长按空地的环形菜单仍然可用。 */
(function () {
  const CF = window.CF;
  const B = (CF.BuildBar = { pick: null });
  let el = null, drag = null, sig = '';
  const G = () => CF.Game.current;
  const unlockedOk = (g, t) => (g.L.immersive ? g.imBuildOk(t) : CF.P.buildUnlocked(t));
  const afford = (g, t) => { const c = CF.Game.BT[t].cost || {}; return Object.keys(c).every((k) => (g.res[k] || 0) >= c[k]); };

  B.mount = function (g) {
    B.unmount();
    el = CF.h('<div id="buildBar" class="bb-col" title="建造：点卡片再点战场，或直接拖到战场上"></div>');
    CF.$('#field').appendChild(el);
    g.buildOrder().forEach((t, i) => {
      const d = CF.Game.BT[t];
      const c = CF.h(`<button class="bb-card" data-t="${t}"><i class="bb-ic"></i><span class="bb-nm">${d.name}</span><span class="bb-cost">${CF.Game.costHtml(d.cost)}</span><i class="bb-key">${i + 1}</i></button>`);
      const ic = CF.UI.icon('b', t); c.querySelector('.bb-ic').appendChild(typeof ic === 'string' ? Object.assign(new Image(), { src: ic }) : (() => { const cc = document.createElement('canvas'); cc.width = ic.width; cc.height = ic.height; cc.getContext('2d').drawImage(ic, 0, 0); return cc; })());
      bindCard(c, t); el.appendChild(c);
    });
    el.addEventListener('pointerdown', (e) => { if (e.target === el && B.pick) B.setPick(null); });
    B.refresh(true);
  };
  B.unmount = function () { if (el) el.remove(); el = null; drag = null; B.pick = null; sig = ''; };
  B.refresh = function (force) {
    const g = G(); if (!g || !el) return;
    const s = g.buildOrder().map((t) => (unlockedOk(g, t).ok ? 1 : 0) + '' + (afford(g, t) ? 1 : 0)).join('') + (B.pick || '');
    if (!force && s === sig) return; sig = s;
    el.querySelectorAll('.bb-card').forEach((c) => { const t = c.dataset.t, un = unlockedOk(g, t); c.classList.toggle('lock', !un.ok); c.classList.toggle('poor', un.ok && !afford(g, t)); c.classList.toggle('pick', B.pick === t); c.title = un.ok ? `${CF.Game.BT[t].name}：${CF.Game.BT[t].desc || ''}` : '🔒 ' + un.why; });
  };
  B.setPick = function (t) {
    const g = G(); if (!g) return;
    if (t) {
      const un = unlockedOk(g, t); if (!un.ok) { CF.Audio.sfx('error'); return CF.toast('🔒 ' + un.why, 'bad'); }
      B.pick = t; const c = [g.cam.x + g.viewW() / 2, g.cam.y + g.viewH() / 2];
      CF.UI.startPlace(t, c[0], c[1], { noBar: true, picking: true });
      CF.toast(`已选中「${CF.Game.BT[t].name}」：点战场放下（再点卡片取消）`, '', 1600);
    } else { B.pick = null; if (CF.UI.place && CF.UI.place.picking) CF.UI.cancelPlace(); }
    B.refresh(true);
  };
  // 战场上的点击（由 ui.js 的画布事件转过来）：选中状态下点战场 = 放下
  B.onFieldDown = function (e) {
    if (!B.pick) return false;
    if (e.pointerType === 'mouse' && e.button === 2) { B.setPick(null); return true; }
    const t = B.pick; CF.UI.movePlace(e.clientX, e.clientY, false);
    if (CF.UI.confirmPlace()) { if (!e.shiftKey) { B.pick = null; CF.UI.buildMode(false); } else CF.UI.startPlace(t, CF.Game.current.build ? CF.Game.current.build.x : 0, 0, { noBar: true, picking: true }); }
    B.refresh(true); return true;
  };
  B.onFieldMove = function (e) { if (B.pick && e.pointerType === 'mouse' && CF.UI.place) CF.UI.movePlace(e.clientX, e.clientY, false); };
  function overBar(cx, cy) { if (!el) return false; const r = el.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; }
  function bindCard(c, t) {
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); CF.Audio.unlock(); drag = { id: e.pointerId, t, sx: e.clientX, sy: e.clientY, on: false, touch: e.pointerType !== 'mouse' }; try { c.setPointerCapture(e.pointerId); } catch (er) { /* 合成事件 */ } });
    c.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      if (!drag.on && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 10) {
        const g = G(), un = unlockedOk(g, t); if (!un.ok) { drag = null; CF.Audio.sfx('error'); return CF.toast('🔒 ' + un.why, 'bad'); }
        drag.on = true; B.pick = null; const w = CF.UI.worldAt(e.clientX, e.clientY, true); CF.UI.startPlace(t, w[0], w[1], { noBar: true, fromBar: true }); c.classList.add('drag');
      }
      if (drag.on) { CF.UI.movePlace(e.clientX, e.clientY, drag.touch); if (CF.UI.place) CF.UI.place.dragging = true, CF.UI.place.sx = e.clientX, CF.UI.place.sy = e.clientY; }
    });
    const up = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag; drag = null; c.classList.remove('drag');
      if (!d.on) { CF.Audio.sfx('click'); B.setPick(B.pick === t ? null : t); return; }
      if (overBar(e.clientX, e.clientY)) { CF.UI.cancelPlace(); CF.toast('已取消', '', 900); B.refresh(true); return; }
      const g = G(); g.updateGhost(g.build.x, g.build.y);
      if (!g.build.ok) { const why = g.build.why; CF.UI.cancelPlace(); CF.Audio.sfx('error'); CF.toast(`取消：${why}`, 'bad', 1600); B.refresh(true); return; }
      CF.UI.confirmPlace(); CF.UI.buildMode(false); B.refresh(true);
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', (e) => { if (drag && drag.id === e.pointerId) { drag = null; CF.UI.cancelPlace(); } });
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && B.pick) B.setPick(null); });
})();
