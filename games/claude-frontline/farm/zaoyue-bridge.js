/* 英语田园 ↔ 《造月之路》桥接
 * 只有从造月之路进来（网址带 ?zy=1）时才生效；单独打开英语田园时什么也不做，原版功能完全不变。
 *
 * 为什么是「整页跳转」而不是 iframe：安卓 WebView 里，file:// 页面里嵌的 https iframe 的本地存储可能被分区，存档不保证留得住。
 * 所以造月之路把整页换成田园，田园里学习的时间记在这里，返回时带回去：
 *   进来：farm/index.html?zy=1&hero=9b7bff&hero2=ff9a5c&sess=秒&pool=秒&bank=0|1&ret=<返回地址>
 *   回去：<返回地址>#farmlearn=<这次学习的秒数>（安卓壳里改用 XSNative.backToGame，因为 https 页面不能直接跳到 file://）
 * 计时规则和造月之路一样（js/stamina.js）：连续 5 分钟没操作就暂停；悬浮双环内圈 25 分钟、外圈 40 分钟，不显示数字。 */
(function () {
  const Q = new URLSearchParams(location.search);
  if (Q.get('zy') !== '1') return;
  const KEY = 'zy-bridge', IDLE = 5 * 60 * 1000, SESSION = 25 * 60, POOL = 40 * 60;
  const hex = (v, d) => (/^[0-9a-f]{6}$/i.test(v || '') ? '#' + v : d);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
  const hero = hex(Q.get('hero'), '#9b7bff'), hero2 = hex(Q.get('hero2'), '#ff9a5c');
  const ret = Q.get('ret') || '';
  const r = document.documentElement.style;
  r.setProperty('--zy-hero', hero); r.setProperty('--zy-hero2', hero2); r.setProperty('--zy-hero-rgb', rgb(hero));
  document.documentElement.classList.add('zy-embed');

  // 这一次在田园里学了多久：存在 sessionStorage，田园自己刷新页面也不丢
  let st = { sec: 0, sess0: +Q.get('sess') || 0, pool0: +Q.get('pool') || 0, bank: Q.get('bank') === '1' };
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s && s.ret === ret) st = s; } catch (e) { /* 隐私模式 */ }
  st.ret = ret;
  const keep = () => { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 隐私模式 */ } };
  let lastInput = Date.now();
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => (lastInput = Date.now()), { passive: true, capture: true }));

  // ---------- 返回造月之路 ----------
  let leaving = false;
  function exit() {
    if (leaving) return; leaving = true;
    try { if (typeof save === 'function') save(false); } catch (e) { /* 存档未就绪 */ }
    const sec = Math.floor(st.sec);
    try { sessionStorage.removeItem(KEY); } catch (e) { /* 隐私模式 */ }
    if (window.XSNative && typeof XSNative.backToGame === 'function') { XSNative.backToGame(sec); return; }
    location.href = (ret || '../index.html').split('#')[0] + '#farmlearn=' + sec;
  }
  // 安卓返回键（MainActivity 调用）：先关田园自己的弹层 / 回田园首页，已经在首页再退回造月之路
  window.zyBack = function () {
    let handled = false;
    try { handled = typeof handleAndroidBack === 'function' && handleAndroidBack(); } catch (e) { /* 田园还没加载完 */ }
    if (!handled) exit();
    return 'ok';
  };

  // ---------- 悬浮双环（与 js/stamina.js 的 St.ring 同一个样子） ----------
  function mount() {
    if (document.getElementById('zyBack')) return;
    const b = document.createElement('button');
    b.id = 'zyBack'; b.type = 'button'; b.setAttribute('aria-label', '返回造月之路大厅');
    b.innerHTML = '<i>‹</i>造月之路';
    b.addEventListener('click', exit);
    document.body.appendChild(b);

    const C = (n) => (2 * Math.PI * n).toFixed(2);
    const lt = document.createElement('div');
    lt.id = 'zyTimer'; lt.className = 'zy-timer';
    lt.title = '学习计时（和造月之路同一个）：内圈 = 连续学习 25 分钟，外圈 = 零散累计 40 分钟。拖动可以移开。';
    lt.innerHTML = `<svg viewBox="0 0 72 72" aria-hidden="true"><circle class="rb" cx="36" cy="36" r="31"/><circle class="ro-g" cx="36" cy="36" r="31" stroke-dasharray="${C(31)}"/><circle class="ro" cx="36" cy="36" r="31" stroke-dasharray="${C(31)}"/><circle class="rb" cx="36" cy="36" r="22"/><circle class="ri" cx="36" cy="36" r="22" stroke-dasharray="${C(22)}"/></svg><span class="zy-ic">EN</span><i class="zy-bank"></i>`;
    document.body.appendChild(lt);
    let pos = { x: 0.9, y: 0.62 };
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
  function hint() {
    const t = document.createElement('div'); t.className = 'zy-hint';
    t.innerHTML = '<b>学习计时</b>在英语田园里学习，和在学院、电路工坊一样计时：<br><span style="color:#4ef0ff">内圈</span>连续满 25 分钟 → 5 分钟无限体力；<br><span style="color:#ffd257">外圈</span>零散累计满 40 分钟 → 10 分钟无限体力。<br>回到造月之路时自动结算。';
    t.addEventListener('click', () => t.remove()); document.body.appendChild(t); setTimeout(() => t.remove(), 6000);
  }
  function paint() {
    const lt = document.getElementById('zyTimer'); if (!lt) return;
    const sess = st.sess0 + st.sec, inner = (sess % SESSION) / SESSION, laps = Math.floor(sess / SESSION);
    const pool = st.pool0, ghost = Math.min(1, (pool + (sess % SESSION)) / POOL);
    const q = (sel, p, n) => { const c = lt.querySelector(sel); if (c) c.style.strokeDashoffset = (2 * Math.PI * n * (1 - Math.max(0, Math.min(1, p)))).toFixed(2); };
    q('.ri', inner, 22); q('.ro', pool / POOL, 31); q('.ro-g', ghost, 31);
    lt.classList.toggle('has-bank', st.bank || laps > 0);
  }
  let lapShown = Math.floor((st.sess0 + st.sec) / SESSION);
  setInterval(() => {
    if (leaving || document.hidden || Date.now() - lastInput > IDLE) return;   // 挂机不计时
    st.sec += 1; keep();
    const laps = Math.floor((st.sess0 + st.sec) / SESSION);
    if (laps > lapShown) {
      lapShown = laps;
      const lt = document.getElementById('zyTimer'); if (lt) { lt.classList.remove('done'); void lt.offsetWidth; lt.classList.add('done'); }
      try { if (navigator.vibrate) navigator.vibrate([60, 60, 120]); } catch (e) { /* 不支持 */ }
      const t = document.createElement('div'); t.className = 'zy-hint'; t.textContent = '内圈满了：连续学习 25 分钟！回到造月之路后获得 5 分钟无限体力。';
      document.body.appendChild(t); setTimeout(() => t.remove(), 4000);
    }
    paint();
  }, 1000);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
