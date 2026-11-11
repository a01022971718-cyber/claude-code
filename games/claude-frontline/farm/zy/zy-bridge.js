/* 田园厨房 ↔ 《造月之路》桥接（只在并进造月之路的版本里有，单独发布的 artifact 版没有这个文件）
 * 只有从造月之路进来（网址带 ?zy=1）时才生效：
 *   进来：farm/index.html?zy=1&hero=英雄id&sess=秒&pool=秒&bank=0|1&ret=<返回地址>
 *   回去：<返回地址>#farmlearn=<这次学习的秒数>（安卓壳里用 XSNative.backToGame，https 页面不能直接跳到 file://）
 * 做的事：
 *  1. 状态栏最左边「‹」返回造月之路；安卓返回键先关弹窗 → 回农场 → 再退回造月之路（MainActivity 调 window.zyBack）。
 *  2. 悬浮学习双环：和造月之路同一套规则（连续 5 分钟没操作暂停；内圈 25 分钟、外圈 40 分钟），回到大厅时结算。
 *  3. 版本跟着造月之路一起更新：不再从 GitHub 自己检查更新、跳去网页版（那样会离开造月之路）。
 *  4. 安卓里「导出备份」：网页下载链接在 WebView 里没反应，改交给 AndroidFiles.save（系统「另存为」）。 */
(function () {
  const Q = new URLSearchParams(location.search);
  if (Q.get('zy') !== '1') return;
  const KEY = 'zy-bridge', IDLE = 5 * 60 * 1000, SESSION = 25 * 60, POOL = 40 * 60, ret = Q.get('ret') || '';
  document.documentElement.classList.add('zy-embed');

  // ---------- 学习计时 ----------
  let st = { sec: 0, sess0: +Q.get('sess') || 0, pool0: +Q.get('pool') || 0, bank: Q.get('bank') === '1' };
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && s.ret === ret) st = s; } catch (e) { /* 隐私模式 */ }
  st.ret = ret;
  const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 隐私模式 */ } };
  let lastInput = Date.now();
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => (lastInput = Date.now()), { passive: true, capture: true }));

  // ---------- 返回 ----------
  let leaving = false;
  function exit() {
    if (leaving) return; leaving = true;
    try { if (typeof save === 'function') save(false); } catch (e) { /* 存档未就绪 */ }
    const sec = Math.floor(st.sec);
    try { sessionStorage.removeItem(KEY); } catch (e) { /* 隐私模式 */ }
    if (window.XSNative && typeof XSNative.backToGame === 'function') { XSNative.backToGame(sec); return; }
    location.href = (ret || '../index.html').split('#')[0] + '#farmlearn=' + sec;
  }
  window.zyBack = function () {
    document.querySelectorAll('.zy-pick').forEach((x) => x.remove());
    const layers = [...document.querySelectorAll('#layers .layer')];
    if (layers.length) { const l = layers[layers.length - 1]; if (typeof l.close === 'function') l.close(); else l.remove(); return 'ok'; }
    try { if (typeof SEEDHAND !== 'undefined' && SEEDHAND) { SEEDHAND = null; syncSeedHand(); return 'ok'; } } catch (e) { /* 原版函数 */ }
    try { if (typeof VIEW !== 'undefined' && VIEW !== 'farm') { go('farm'); return 'ok'; } } catch (e) { /* 原版函数 */ }
    exit(); return 'ok';
  };

  // ---------- 版本跟着造月之路走 ----------
  if (typeof checkUpdate === 'function') window.checkUpdate = function (manual) { if (manual && typeof toast === 'function') toast('英语田园跟着造月之路一起更新，不用单独检查'); };

  // ---------- 安卓：导出备份 ----------
  document.addEventListener('click', async (e) => {
    const a = e.target.closest && e.target.closest('a[download]');
    if (!window.AndroidFiles || typeof AndroidFiles.save !== 'function' || !a || !a.href.startsWith('blob:')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const b = await (await fetch(a.href)).blob(), r = new FileReader();
    r.onload = () => AndroidFiles.save(String(r.result).split(',')[1], a.download || 'backup.json');
    r.readAsDataURL(b);
  }, true);
  // 原版用「新建 <a> 再 a.click()」导出：拦下这种不在页面里的链接
  const aClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (window.AndroidFiles && typeof AndroidFiles.save === 'function' && this.download && String(this.href).startsWith('blob:')) {
      const name = this.download; fetch(this.href).then((r) => r.blob()).then((b) => { const r = new FileReader(); r.onload = () => AndroidFiles.save(String(r.result).split(',')[1], name); r.readAsDataURL(b); });
      return;
    }
    return aClick.call(this);
  };

  // ---------- 界面：返回键 + 悬浮双环 ----------
  function mount() {
    const hud = document.querySelector('#hud .hud-in');
    if (hud && !document.getElementById('zyBack')) {
      const b = document.createElement('button');
      b.id = 'zyBack'; b.type = 'button'; b.className = 'zy-back'; b.setAttribute('aria-label', '返回造月之路大厅'); b.title = '返回造月之路';
      b.textContent = '‹'; b.addEventListener('click', exit);
      hud.insertAdjacentElement('afterbegin', b);
    }
    if (document.getElementById('zyTimer')) return;
    const C = (n) => (2 * Math.PI * n).toFixed(2);
    const lt = document.createElement('div');
    lt.id = 'zyTimer'; lt.className = 'zy-timer';
    lt.title = '学习计时（和造月之路同一个）：内圈 = 连续学习 25 分钟，外圈 = 零散累计 40 分钟。拖动可以移开。';
    lt.innerHTML = `<svg viewBox="0 0 72 72" aria-hidden="true"><circle class="rb" cx="36" cy="36" r="31"/><circle class="ro-g" cx="36" cy="36" r="31" stroke-dasharray="${C(31)}"/><circle class="ro" cx="36" cy="36" r="31" stroke-dasharray="${C(31)}"/><circle class="rb" cx="36" cy="36" r="22"/><circle class="ri" cx="36" cy="36" r="22" stroke-dasharray="${C(22)}"/></svg><span class="zy-ic2">EN</span><i class="zy-bank"></i>`;
    document.body.appendChild(lt);
    let pos = { x: 0.9, y: 0.6 };
    try { pos = JSON.parse(localStorage.getItem('zy-timer-pos')) || pos; } catch (e) { /* 隐私模式 */ }
    const clamp = (v, a, z) => Math.max(a, Math.min(z, v));
    const place = () => { lt.style.left = clamp(pos.x * innerWidth - 32, 4, innerWidth - 68) + 'px'; lt.style.top = clamp(pos.y * innerHeight - 32, 4, innerHeight - 68) + 'px'; };
    place(); addEventListener('resize', place);
    let drag = null;
    lt.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: lt.offsetLeft, y0: lt.offsetTop, moved: false }; try { lt.setPointerCapture(e.pointerId); } catch (er) { /* 合成事件 */ } e.preventDefault(); e.stopPropagation(); });
    lt.addEventListener('pointermove', (e) => { if (!drag || drag.id !== e.pointerId) return; const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; if (Math.hypot(dx, dy) > 6) drag.moved = true; if (!drag.moved) return; lt.style.left = clamp(drag.x0 + dx, 4, innerWidth - 68) + 'px'; lt.style.top = clamp(drag.y0 + dy, 4, innerHeight - 68) + 'px'; });
    const up = (e) => { if (!drag || drag.id !== e.pointerId) return; const moved = drag.moved; drag = null; if (moved) { pos = { x: (lt.offsetLeft + 32) / innerWidth, y: (lt.offsetTop + 32) / innerHeight }; try { localStorage.setItem('zy-timer-pos', JSON.stringify(pos)); } catch (er) { /* 隐私模式 */ } } else hint(); };
    lt.addEventListener('pointerup', up); lt.addEventListener('pointercancel', up);
    paint();
  }
  function hint(text) {
    const t = document.createElement('div'); t.className = 'zy-hint';
    t.innerHTML = text || '<b>学习计时</b>在英语田园里学习，和在学院、电路工坊一样计时：<br><span style="color:#4ef0ff">内圈</span>连续满 25 分钟 → 5 分钟无限体力；<br><span style="color:#ffd257">外圈</span>零散累计满 40 分钟 → 10 分钟无限体力。<br>回到造月之路时自动结算。';
    t.addEventListener('click', () => t.remove()); document.body.appendChild(t); setTimeout(() => t.remove(), 6000);
  }
  function paint() {
    const lt = document.getElementById('zyTimer'); if (!lt) return;
    const sess = st.sess0 + st.sec, inner = (sess % SESSION) / SESSION, laps = Math.floor(sess / SESSION), pool = st.pool0, ghost = Math.min(1, (pool + (sess % SESSION)) / POOL);
    const q = (sel, p, n) => { const c = lt.querySelector(sel); if (c) c.style.strokeDashoffset = (2 * Math.PI * n * (1 - Math.max(0, Math.min(1, p)))).toFixed(2); };
    q('.ri', inner, 22); q('.ro', pool / POOL, 31); q('.ro-g', ghost, 31);
    lt.classList.toggle('has-bank', st.bank || laps > 0);
  }
  let lapShown = Math.floor((st.sess0 + st.sec) / SESSION);
  setInterval(() => {
    if (leaving || document.hidden || Date.now() - lastInput > IDLE) return;   // 挂机不计时
    st.sec += 1; keep();
    const laps = Math.floor((st.sess0 + st.sec) / SESSION);
    if (laps > lapShown) { lapShown = laps; try { if (navigator.vibrate) navigator.vibrate([60, 60, 120]); } catch (e) { /* 不支持 */ } hint('<b>内圈满了</b>连续学习 25 分钟！回到造月之路后获得 5 分钟无限体力。'); }
    paint();
  }, 1000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
