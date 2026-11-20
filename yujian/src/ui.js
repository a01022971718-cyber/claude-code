// 界面层：资源栏、目标、手牌、委托、设置、模拟广告、提示。全部是 DOM，叠在 3D 画布上面。
import { TILE, RES, RES_NAME, DAILY, QUALITY, gfx } from './config.js';
import { CAM_ICON } from './camdock.js';
import { lineup } from './forgeview.js';
import { registerMakes } from './make/register.js';
import { sopHTML } from './artsop.js';
import { aiError, PROVIDERS } from './ai.js';
import { STYLE, THEME_KEY } from './hq/blocky.js';
import { audio } from './audio.js';
import { ads, analytics, inFrame } from './services.js';
import { tileThumb } from './thumbs.js';

export const ICON = {
  wood: '<svg viewBox="0 0 20 20"><rect x="1.5" y="6" width="14" height="8" rx="4" fill="#b9824f"/><circle cx="14.5" cy="10" r="4" fill="#d9a66b" stroke="#8a5a3c"/><circle cx="14.5" cy="10" r="1.3" fill="#8a5a3c"/></svg>',
  stone: '<svg viewBox="0 0 20 20"><polygon points="2.5,14 5.5,6 12,3.5 17.5,9 15.5,15.5 7,16.5" fill="#8f99a5"/><polygon points="5.5,6 12,3.5 11,10 7,11" fill="#c6ced6"/></svg>',
  food: '<svg viewBox="0 0 20 20"><circle cx="10" cy="11.8" r="6.2" fill="#e5484d"/><circle cx="7.8" cy="9.8" r="1.6" fill="#f58a8e"/><rect x="9.4" y="3.6" width="1.3" height="3.2" rx=".6" fill="#7a5236"/><path d="M10.6 5.6q1.2-3 4.2-2.8q-.2 3-4.2 2.8z" fill="#58b05a"/></svg>',
  coupon: '<svg viewBox="0 0 20 20"><path d="M2 5.5h16v3a1.6 1.6 0 000 3v3H2v-3a1.6 1.6 0 000-3z" fill="#f7c948" stroke="#c9981a" stroke-width=".8"/><path d="M8 6.2v8" stroke="#c9981a" stroke-dasharray="1.4 1.4"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.6" fill="#f7b733"/><g stroke="#f7b733" stroke-width="2.2" stroke-linecap="round"><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></g></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M15.5 3.2a8.8 8.8 0 105.3 13.9A7.4 7.4 0 0115.5 3.2z" fill="#8fa8e8"/></svg>',
  orders: '<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 011 1v16l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 011-1z" fill="currentColor"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" stroke="#fffaf0" stroke-width="1.6" stroke-linecap="round"/></svg>',
  decor: '<svg viewBox="0 0 24 24"><path d="M12 3l7 6v11a1 1 0 01-1 1h-4v-6h-4v6H6a1 1 0 01-1-1V9z" fill="currentColor"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><path d="M8.5 5l1.2-2h4.6l1.2 2H19a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" fill="currentColor"/><circle cx="12" cy="12.5" r="3.8" fill="#fffaf0"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="4.4" stroke-dasharray="3.3 2.51"/><circle cx="12" cy="12" r="5.8" fill="currentColor"/><circle cx="12" cy="12" r="2.4" fill="#fffaf0"/></svg>',
};
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const rewardChips = (rw, mul = 1) => Object.keys(rw).map((k) => `<span class="chip">${ICON[k]}+${rw[k] * mul}</span>`).join('');
export const fmtWait = (ms) => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`; };

const TEMPLATE = `
<div class="hud" id="hud" hidden>
  <div class="tl"><div class="resrow"><div class="res" id="res"></div><button class="pill clock" id="clock" aria-label="时间"></button></div><div class="goals" id="goals"></div></div>
  <div class="tr" id="side"></div>
  <div class="hint" id="hint" hidden></div>
  <div class="bottom" id="bottom"><div class="tools" id="tools"></div><div class="hand" id="hand"></div></div>
</div>
<div id="tray" hidden></div>
<div id="bubble" hidden></div><div id="floats"></div><div id="toasts"></div>
<div id="banner" hidden></div><div id="modal" hidden></div><div id="title" hidden></div><div id="photoBar" hidden></div><div id="loading" hidden></div>`;

export class UI {
  constructor(app) {
    this.app = app; this.g = app.game; this.thumbs = {}; this._raf = 0;
    this.root = document.getElementById('ui');
    this.root.innerHTML = TEMPLATE;
    this.el = {};
    for (const id of ['hud', 'clock', 'res', 'goals', 'side', 'hint', 'bottom', 'tools', 'hand', 'tray', 'bubble', 'floats', 'toasts', 'banner', 'modal', 'title', 'photoBar']) this.el[id] = document.getElementById(id);
    ads.ui = (slot) => this.adMock(slot);
    this.el.hand.addEventListener('click', (e) => { const b = e.target.closest('.card'); if (b) app.selectCard(+b.dataset.i); });
    this.el.tools.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; audio.sfx('tap'); ({ refresh: () => app.refreshHand(), coupon: () => app.toggleCoupon(), regrow: () => app.regrowAll() })[b.dataset.a]?.(); });
    this.el.side.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; audio.sfx('tap'); ({ orders: () => this.openOrders(), decor: () => app.decor.enter(), photo: () => this.photoMode(true), cam: () => app.camDock.toggle(), set: () => this.openSettings() })[b.dataset.a]?.(); });
    this.el.goals.classList.add('fold');   // 目标默认折叠成一行，点一下展开
    this.el.goals.addEventListener('click', () => { this.el.goals.classList.toggle('fold'); });
    this.el.clock.addEventListener('click', () => { audio.sfx('tap'); this.openTime(); });
    this.el.modal.addEventListener('click', (e) => { if (e.target === this.el.modal || e.target.closest('[data-close]')) this.closeModal(); });
  }
  thumb(t) { return (this.thumbs[t] ??= tileThumb(t)); }
  hud(on) { const canvas = !!this.app.canvasMode; this.el.hud.hidden = !on || canvas; this.app.hud?.show(on && canvas); if (!on) { this.bubble(null); this.hint(''); } }
  refresh() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); }

  render() {
    const g = this.g, s = g.s, sel = this.app.sel;
    // 资源栏
    this.el.res.innerHTML = RES.map((r) => `<span class="pill ${s.res[r] >= s.caps[r] ? 'full' : ''}" data-r="${r}" title="${RES_NAME[r]}">${ICON[r]}<b>${s.res[r]}</b><i>/${s.caps[r]}</i></span>`).join('')
      + (s.coupons ? `<span class="pill" data-r="coupon" title="卡券">${ICON.coupon}<b>${s.coupons}</b></span>` : '');
    // 目标
    const goals = g.activeGoals();
    this.el.goals.innerHTML = `<h3>目标<span>${s.done.length + s.extraSeq - s.extra.length} 已完成</span></h3>` + goals.map((x) => {
      const p = Math.min(x.max, g.progress(x));
      return `<div class="goal"><b>${x.title}</b>${x.max > 1 ? `<em>${p}/${x.max}</em>` : ''}${x.desc ? `<small>${x.desc}</small>` : ''}<span class="rw">${rewardChips(x.reward || {})}</span></div>`;
    }).join('');
    // 手牌
    this.el.hand.innerHTML = s.hand.map((t, i) => {
      const def = TILE[t], free = g.slotFree(i), cost = g.cost(t), coupon = !free && (sel.coupon || (!g.canPlay(i) && s.coupons > 0)), ok = free || coupon || g.canPlay(i);
      const chips = free ? '<span class="chip free">潮水赠送</span>' : coupon ? `<span class="chip free">${ICON.coupon}用券</span>`
        : RES.filter((r) => cost[r]).map((r) => `<span class="chip ${s.res[r] < cost[r] ? 'lack' : ''}">${ICON[r]}${cost[r]}</span>`).join('');
      return `<button class="card t-${t} ${sel.slot === i ? 'sel' : ''} ${ok ? '' : 'poor'}" data-i="${i}" id="card${i}"><span class="art" style="background-image:url(${this.thumb(t)})"></span><b>${def.name}</b><span class="cost">${chips}</span><small>${def.tip}</small></button>`;
    }).join('');
    // 手牌左侧的小工具
    const d = s.day, grow = g.growing().length;
    const refLeft = DAILY.freeRefresh - d.freeRefresh, adLeft = DAILY.adRefresh - d.adRefresh;
    this.el.tools.innerHTML = `<button data-a="refresh" ${refLeft <= 0 && adLeft <= 0 ? 'disabled' : ''}>换牌<i>${refLeft > 0 ? '免费' : adLeft > 0 ? '看广告' : '明天再来'}</i></button>`
      + (s.coupons ? `<button data-a="coupon" class="${sel.coupon ? 'on' : ''}">卡券 ×${s.coupons}<i>${sel.coupon ? '下一张免费' : '点一下启用'}</i></button>` : '')
      + (grow && d.adRegrow < DAILY.adRegrow ? `<button data-a="regrow">立即长好<i>${grow} 块在生长 · 看广告</i></button>` : '');
    // 右侧按钮
    const todo = d.orders.filter((o) => !o.done).length;
    this.el.side.innerHTML = (s.companions.length ? `<button data-a="orders">${ICON.orders}<span>委托</span>${todo ? `<i class="badge">${todo}</i>` : ''}</button>` : '')
      + `<button data-a="decor">${ICON.decor}<span>装饰</span></button>${this.app.view.kind === 'hq' ? `<button data-a="cam">${CAM_ICON}<span>镜头</span></button>` : ''}<button data-a="photo">${ICON.photo}<span>拍照</span></button><button data-a="set">${ICON.gear}<span>设置</span></button>`;
  }
  refreshTime() {
    const sk = this.app.view.sky, st = this.g.s.settings;
    this.el.clock.innerHTML = `${sk.isNight ? ICON.moon : ICON.sun}<b>${sk.label()}</b>${st.timeMode === 'fixed' && this.app.forceHour == null ? '<i>固定</i>' : ''}`;
    const sl = document.getElementById('phHour'); if (sl && document.activeElement !== sl) sl.value = sk.hour;
    const lb = document.getElementById('phHourLabel'); if (lb) lb.textContent = sk.label();
  }
  openTime() {
    const app = this.app, st = this.g.s.settings;
    const presets = [['清晨', 7], ['正午', 12], ['午后', 15], ['黄昏', 18.4], ['夜晚', 22]];
    const sh = this.modal(`<header><h2>岛上的时间</h2><button class="x" data-close>关闭</button></header><div class="set">
      <label class="sw"><span>跟随现实时间<small>早晚和你那边同步，夜里灯会亮起来</small></span><input type="checkbox" id="tmReal" ${st.timeMode === 'real' ? 'checked' : ''}><i></i></label>
      <div class="presets">${presets.map(([n, h]) => `<button data-h="${h}">${n}</button>`).join('')}</div>
      <label class="slider"><span id="tmLabel">${app.view.sky.label()}</span><input type="range" id="tmHour" min="0" max="23.9" step="0.1" value="${app.view.sky.hour}"></label>
      <p class="ver">拖动或点上面的时段，就会固定在那个时刻</p></div>`, 'small');
    sh.addEventListener('click', (e) => e.stopPropagation());
    sh.querySelector('[data-close]').onclick = () => this.closeModal();
    const real = sh.querySelector('#tmReal'), sl = sh.querySelector('#tmHour'), lb = sh.querySelector('#tmLabel');
    const fixAt = (h) => { app.setTimeMode('fixed', h); real.checked = false; sl.value = h; lb.textContent = app.view.sky.label(); };
    real.onchange = () => { app.setTimeMode(real.checked ? 'real' : 'fixed', app.view.sky.hour); sl.value = app.view.sky.hour; lb.textContent = app.view.sky.label(); };
    sl.oninput = () => fixAt(Number(sl.value));
    sh.querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => fixAt(Number(b.dataset.h)); });
  }
  shakeCard(i) { const c = document.getElementById('card' + i); if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); } }
  bump(r) { const p = this.el.res.querySelector(`[data-r="${r}"]`); if (p) { p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); } }

  // ---------- 提示类 ----------
  hint(text) { this.el.hint.hidden = !text; this.el.hint.textContent = text; }
  toast(text, kind = '') {
    const d = document.createElement('div'); d.className = 'toast ' + kind; d.innerHTML = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3000);
  }
  float(x, y, html, delay = 0) {
    const d = document.createElement('div'); d.className = 'float'; d.innerHTML = html;
    d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.animationDelay = delay + 'ms';
    this.el.floats.appendChild(d); setTimeout(() => d.remove(), 1500 + delay);
  }
  gainHtml(got) { return Object.keys(got).filter((k) => got[k]).map((k) => `<span>+${got[k]}${ICON[k]}</span>`).join(''); }
  bubble(html, x, y) {
    const b = this.el.bubble;
    if (html === null) { b.hidden = true; return; }
    if (html !== undefined) b.innerHTML = html;
    b.hidden = false; b.style.left = x + 'px'; b.style.top = y + 'px';
  }
  banner(title, sub = '', ms = 2400) {
    const b = this.el.banner; b.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`; b.hidden = false;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(this._bt); this._bt = setTimeout(() => { b.hidden = true; }, ms);
  }
  goalDone(g, got, i = 0) {
    setTimeout(() => { audio.sfx('goal'); this.toast(`<b>目标完成</b> ${g.title} ${this.gainHtml(got)}`, 'goal'); for (const k in got) this.bump(k); }, 500 + i * 700);
  }

  // ---------- 弹窗 ----------
  modal(html, cls = '') {
    this.el.modal.innerHTML = `<div class="sheet ${cls}">${html}</div>`; this.el.modal.hidden = false; audio.sfx('uiOpen');
    return this.el.modal.firstChild;
  }
  closeModal() { if (!this.el.modal.hidden) { this.el.modal.hidden = true; this.el.modal.innerHTML = ''; audio.sfx('uiClose'); this._modalClose?.(); this._modalClose = null; } }
  confirm(text, yes = '确定', no = '取消') {
    return new Promise((res) => {
      const sh = this.modal(`<p class="ask">${text}</p><div class="acts"><button class="btn ghost" id="cfNo">${no}</button><button class="btn" id="cfYes">${yes}</button></div>`, 'small');
      let done = false; const fin = (v) => { if (done) return; done = true; this._modalClose = null; this.closeModal(); res(v); };
      this._modalClose = () => fin(false);
      sh.querySelector('#cfYes').onclick = (e) => { e.stopPropagation(); fin(true); };
      sh.querySelector('#cfNo').onclick = (e) => { e.stopPropagation(); fin(false); };
    });
  }
  openOrders() {
    const g = this.g, s = g.s;
    if (!s.stats.ordersSeen) { s.stats.ordersSeen = 1; this.app.afterGoals(g.checkGoals()); }
    analytics.track('orders_open');
    const sh = this.modal(`<header><h2>同伴的委托</h2><button class="x" data-close>关闭</button></header><div class="orders">` + (s.day.orders.map((o) => {
      const c = s.companions[o.who] || s.companions[0], can = s.res[o.res] >= o.need;
      return `<div class="order ${o.done ? 'done' : ''}"><span class="ava" style="background:${hex(c.shirt)}">${c.name[0]}</span><div class="txt"><b>${c.role} · ${c.name}</b><p>${o.line}</p><div class="row"><span class="chip ${can || o.done ? '' : 'lack'}">${ICON[o.res]}${o.done ? o.need : Math.min(s.res[o.res], o.need)}/${o.need}</span><span class="to">换</span>${rewardChips(o.reward)}</div></div>`
        + `<div class="acts">${o.done ? '<span class="ok">已交付</span>' : `<button class="btn" data-deliver="${o.id}" ${can ? '' : 'disabled'}>交付</button><button class="btn ghost" data-double="${o.id}" ${can ? '' : 'disabled'}>看广告 奖励×2</button>`}</div></div>`;
    }).join('') || '<p class="empty">今天的委托都做完了。</p>') + `</div><footer>每天凌晨 4:00 换一批新委托</footer>`, 'wide');
    sh.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-deliver],button[data-double]'); if (!b) return;
      e.stopPropagation(); this.app.deliver(+(b.dataset.deliver ?? b.dataset.double), b.dataset.double != null);
    });
  }
  /** 设置：分“基础 / 画面 / 其他”三页。画面页每一项都能单独调（参考大世界手游的画面设置：预设 + 逐项细调） */
  openSettings(tab = this._setTab || 'basic') {
    this._setTab = tab;
    const s = this.g.s, st = s.settings, app = this.app;
    const sw = (k, label, sub = '') => `<label class="sw"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" id="set_${k}" ${st[k] ? 'checked' : ''}><i></i></label>`;
    let body = '';
    if (tab === 'basic') body = `
      <label class="sw"><span>经营玩法<small>${st.gameplay ? '打开：资源、目标、地块卡、委托' : '关闭：自由画布，随意摆放，没有资源限制'}</small></span><input type="checkbox" id="set_gameplay" ${st.gameplay ? 'checked' : ''}><i></i></label>
      ${sw('sound', '声音')}${sw('music', '背景音乐')}
      <button class="btn ghost" id="setTime">岛上的时间：${st.timeMode === 'real' ? '跟随现实' : '固定 ' + app.view.sky.label()}</button>`;
    else if (tab === 'gfx') body = this._gfxPanel();
    else if (tab === 'cam') body = this._camPanel();
    else if (tab === 'ai') body = this._aiPanel();
    else body = `
      <div class="rowb"><button class="btn ghost" id="setBench">性能测试</button><button class="btn ghost" id="setExport">查看埋点数据</button>${app.canvasMode ? '' : '<button class="btn ghost danger" id="setReset">重新开始</button>'}</div>
      ${app.debug ? `<div class="dbg"><b>调试</b><button data-d="give">+10 资源</button><button data-d="skip">快进 4 小时</button><button data-d="day">进入下一天</button><button data-d="coupon">+2 卡券</button></div>` : ''}
      <p class="ver">屿见 v0.26 · 存档只保存在这台设备的浏览器里</p>`;
    const tabs = [['basic', '基础'], ['gfx', '画面'], ['cam', '镜头'], ['ai', 'AI'], ['other', '其他']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('');
    const sh = this.modal(`<header><h2>设置</h2><button class="x" data-close>关闭</button></header><nav class="stabs">${tabs}</nav><div class="set">${body}</div>`, tab === 'gfx' || tab === 'cam' ? 'wide gfxsheet' : '');
    sh.addEventListener('click', (e) => e.stopPropagation());
    sh.querySelector('[data-close]').onclick = () => this.closeModal();
    sh.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => this.openSettings(b.dataset.tab); });
    const on = (sel, ev, fn) => { const el = sh.querySelector(sel); if (el) el[ev] = fn; };
    on('#set_gameplay', 'onchange', (e) => { st.gameplay = e.target.checked; this.g.save(true); this.toast(st.gameplay ? '正在打开经营玩法…' : '正在回到自由画布…'); setTimeout(() => location.reload(), 350); });
    on('#set_sound', 'onchange', (e) => { st.sound = e.target.checked; audio.setEnabled(st.sound); this.g.save(); });
    on('#set_music', 'onchange', (e) => { st.music = e.target.checked; audio.setMusic(st.music); this.g.save(); });
    on('#setTime', 'onclick', () => this.openTime());
    on('#setBench', 'onclick', () => this.runBench());
    on('#setExport', 'onclick', () => this.showEvents());
    on('#setReset', 'onclick', async () => { if (await this.confirm('重新开始会清空这座岛和所有进度，确定吗？', '清空重来')) app.restart(); });
    sh.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => app.dbg[b.dataset.d](); });
    // 画面页
    const again = () => setTimeout(() => { if (!this.el.modal.hidden) this.openSettings('gfx'); }, 30);
    sh.querySelectorAll('[data-theme]').forEach((b) => { b.onclick = () => { if (b.dataset.theme === STYLE.theme) return; try { localStorage.setItem(THEME_KEY, b.dataset.theme); } catch { /* 存不了就算了 */ } this.g.save(true); this.toast('正在切换主题…'); setTimeout(() => location.reload(), 300); }; });
    sh.querySelectorAll('[data-preset]').forEach((b) => { b.onclick = () => { app.setQuality(b.dataset.preset); again(); }; });
    sh.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { app.setGfx(b.dataset.g, JSON.parse(b.dataset.v)); again(); }; });
    sh.querySelectorAll('[data-fps]').forEach((b) => { b.onclick = () => { st.fps = b.dataset.fps; if (app.pace) app.pace.lock30 = false; this.g.save(); again(); }; });
    on('#set_powerSave', 'onchange', (e) => { st.powerSave = e.target.checked; this.g.save(); });
    on('#set_dynres', 'onchange', (e) => { st.dynres = e.target.checked; if (!st.dynres && app.view.setResScale) { app.view.setResScale(1); app.resize(); } this.g.save(); again(); });
    on('#set_showFps', 'onchange', (e) => { st.showFps = e.target.checked; app.perfMon.setOverlay(st.showFps); this.g.save(); });
    on('#set_auto', 'onchange', (e) => { st.autoQuality = e.target.checked; this.g.save(); });
    on('#setLegacy', 'onclick', () => app.setQuality(app.view.kind === 'hq' ? 'low' : 'ultra'));
    // 镜头页
    // AI 页：保存配置、测试连接
    const aiSave = () => { st.ai = { provider: sh.querySelector('#aiProv').value, key: sh.querySelector('#aiKey').value.trim(), baseURL: sh.querySelector('#aiBase').value.trim(), model: sh.querySelector('#aiModel').value.trim() }; this.g.save(); };
    on('#aiProv', 'onchange', (e) => { const p = PROVIDERS.find((x) => x.id === e.target.value); sh.querySelector('#aiBase').value = ''; sh.querySelector('#aiModel').value = ''; sh.querySelector('#aiBase').placeholder = p.base || '填接口地址，如 https://api.example.com/v1'; sh.querySelector('#aiModel').placeholder = p.model || '填模型名称'; });
    { const p = PROVIDERS.find((x) => x.id === (st.ai?.provider || 'anthropic')), b = sh.querySelector('#aiBase'), m = sh.querySelector('#aiModel'); if (b && p) { b.placeholder = p.base || '填接口地址，如 https://api.example.com/v1'; m.placeholder = p.model || '填模型名称'; } }
    on('#aiSave', 'onclick', () => { aiSave(); this.toast('已保存（只存在这台设备上）'); });
    on('#aiTest', 'onclick', async () => {
      aiSave(); const out = sh.querySelector('#aiOut');
      if (!app.ai.ready) { out.textContent = '先填 API 密钥或代理地址'; return; }
      out.textContent = '正在连接……';
      try { const r = await app.ai.ping(); out.textContent = `连上了（${r.model}）：${r.text}`; } catch (e) { out.textContent = '连接失败：' + aiError(e); }
    });
    sh.querySelectorAll('[data-cam]').forEach((b) => { b.onclick = () => { app.setCam(b.dataset.cam, JSON.parse(b.dataset.v)); setTimeout(() => { if (!this.el.modal.hidden) this.openSettings('cam'); }, 30); }; });
  }
  /** AI 设置页：大模型接入 */
  _aiPanel() {
    const c = this.g.s.settings.ai || {}, esc = (v) => String(v || '').replace(/[&"<>]/g, (m) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[m]));
    return `<div class="aiform">
      <p class="note">接入大模型后可以用一句话生成一座岛（岛屿菜单 → AI 造岛），点村民时他们会根据此刻在做的事说话。</p>
      <label>服务商<select id="aiProv">${PROVIDERS.map((p) => `<option value="${p.id}" ${p.id === (c.provider || 'anthropic') ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
      <label>API 密钥<input id="aiKey" type="password" autocomplete="off" placeholder="sk-…" value="${esc(c.key)}"></label>
      <label>接口地址<input id="aiBase" type="url" placeholder="留空用服务商默认地址" value="${esc(c.baseURL)}"></label>
      <label>模型<input id="aiModel" type="text" placeholder="留空用默认模型" value="${esc(c.model)}"></label>
      <div class="rowb"><button class="btn" id="aiSave">保存</button><button class="btn ghost" id="aiTest">测试连接</button></div>
      <p class="note" id="aiOut"></p>
      <p class="note">密钥只保存在这台设备的浏览器里。正式上线给玩家用时，请在自己的服务器上转发请求（填“代理地址”、不填密钥），不要把密钥放进客户端。</p></div>`;
  }
  /** AI 造岛：输入一句话描述 → 生成一座新岛 */
  openAIIsland() {
    const app = this.app;
    if (!app.ai.ready) { this.toast('先在 设置 → AI 里选服务商、填 API 密钥'); return this.openSettings('ai'); }
    const EX = { new: ['长满发光蘑菇的夜光森林岛，住着会飞的小萤兽', '珊瑚色沙地和水晶树的梦幻海岛', '冰雪苔原上的极光小岛，有长毛的雪团兽', '巨大的伞形树和紫色草原，住着长耳跳跳兽'],
      edit: ['在东边加一片沙滩和一条小船', '把森林扩大一倍，加几只鹿', '加一个营地，旁边种菜地和麦田', '在岛中间开一条流向大海的溪流'],
      create: ['创造一种会发光的蓝色蘑菇林生态', '创造三种奇怪又可爱的小动物住在草地上', '创造一种开满彩虹花的仙人掌沙漠', '创造在海边游来游去的贝壳小兽'] };
    let mode = 'new';
    const sh = this.modal(`<header><h2>AI 造岛</h2><button class="x" data-close>关闭</button></header>
      <div class="aiform"><div class="aimode"><button data-m="new" class="on">生成新岛</button><button data-m="create">创造新物种</button><button data-m="edit">改造这座岛</button></div>
      <label><span id="aiQ">想要一座什么样的岛？</span><textarea id="aiPrompt" rows="3"></textarea></label>
      <div class="aichips"></div>
      <label class="aichk"><input type="checkbox" id="aiReview" ${(() => { try { return localStorage.getItem('yujian_ai_review') === '0' ? '' : 'checked'; } catch { return 'checked'; } })()}> AI 审图：生成后把对比图给 AI 看，按清单打分并修改（模型要能看图）</label>
      ${(() => { const c = app.canvasMode?.s.custom || {}, n = (c.plants?.length || 0) + (c.creatures?.length || 0); return n ? `<button class="btn ghost aiup" id="aiUp">把以前 AI 造的 ${n} 个物种按新方法重做</button>` : ''; })()}
      <div class="rowb"><button class="btn ghost" id="aiSop">美术圣经</button><button class="btn" id="aiGo">生成</button></div><p class="note aimsg" id="aiMsg"></p><div id="aiOut" class="aiout"></div>
      <p class="note">流程：① AI 按美术圣经设计配方 → ② 游戏用原有素材的笔法生成模型 → ③ AI 看对比图审图、修改 → ④ 你确认后放进岛里。用的是「设置 → AI」里选的服务商（${app.ai.prov.name}）。</p></div>`);
    const setMode = (m) => {
      mode = m; sh.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
      sh.querySelector('#aiQ').textContent = m === 'new' ? '想要一座什么样的岛？（AI 会创造新的生态、植物和动物）' : m === 'create' ? '想创造什么新东西？（生态、植物、动物，造好后放进这座岛，也会出现在建造栏里）' : '想怎么改现在的岛？';
      sh.querySelector('#aiPrompt').placeholder = '比如：' + EX[m][0];
      sh.querySelector('.aichips').innerHTML = EX[m].map((t) => `<button data-ex="${t}">${t}</button>`).join('');
      sh.querySelector('#aiMsg').textContent = m === 'new' ? '生成会替换现在这座岛，需要等十几秒到一分钟。' : m === 'create' ? 'AI 设计出新物种的造型配方，游戏现场生成 3D 模型，放进这座岛，并加到建造栏（名字前带 ✦）。' : 'AI 会在现在的岛上按你说的改，没提到的地方尽量保留。';
    };
    setMode('new');
    sh.addEventListener('click', (e) => { e.stopPropagation(); const m = e.target.closest('[data-m]'); if (m) setMode(m.dataset.m); const ex = e.target.closest('[data-ex]'); if (ex) sh.querySelector('#aiPrompt').value = ex.dataset.ex; });
    sh.querySelector('[data-close]').onclick = () => this.closeModal();
    sh.querySelector('#aiSop').onclick = () => this.openSOP();
    const up = sh.querySelector('#aiUp');
    if (up) up.onclick = async () => {
      const msg = sh.querySelector('#aiMsg'); up.disabled = true;
      try { const n = await app.canvasMode.upgradeOld(app.ai, (k, t, name) => { msg.textContent = `重做中（${k} / ${t}）：${name}`; }); msg.textContent = `重做了 ${n} 个物种，岛上的已经换成新的；在建造栏「✦ 我造的」里，也能到造物台继续改。`; up.remove(); }
      catch (e) { msg.textContent = '重做失败：' + aiError(e); up.disabled = false; }
    };
    sh.querySelector('#aiGo').onclick = async () => {
      const text = sh.querySelector('#aiPrompt').value.trim(), msg = sh.querySelector('#aiMsg'), btn = sh.querySelector('#aiGo'), out = sh.querySelector('#aiOut');
      if (!text) { msg.textContent = '先写一句描述，或点一个例子'; return; }
      const review = sh.querySelector('#aiReview').checked; try { localStorage.setItem('yujian_ai_review', review ? '1' : '0'); } catch {}
      btn.disabled = true; out.innerHTML = '';
      const step = (k, t) => { msg.innerHTML = `<b>${'①②③④'[k]}</b> ${t}`; };
      try {
        const cv = app.canvasMode, ask = mode === 'create' ? `请创造这些新东西，并把它们放进现在这座岛里（新生态铺几块新地块接在岛边上，新植物和新动物摆进去）：${text}` : text;
        step(0, mode === 'edit' ? 'AI 正在改造这座岛……' : 'AI 正在按美术圣经设计配方……');
        const L = await app.ai.island(ask, mode === 'new' ? null : cv.layout(), cv.known());
        // 新植物、新动物：逐个交给 AI 造物，按造物台的方式（部件 + 大小不同的长方块 + 每部位一组颜色）搭出来
        L.makes = [];
        const specs = [...L.plants.map((r) => ['plant', r]), ...L.creatures.map((r) => ['creature', r])];
        if (specs.length) {
          const { makeFromRecipe, pool, storeMakes } = await import('./make/aimake.js'); let n = 0;
          step(1, `AI 正在搭新物种（0 / ${specs.length}）……`);
          const { out, errs } = await pool(specs, 3, async ([kind, r]) => { const m = await makeFromRecipe(app.ai, r, kind); step(1, `AI 正在搭新物种（${++n} / ${specs.length}）……`); return m; });
          L.makes = out.filter(Boolean); if (!L.makes.length && errs.length) throw errs[0];
          storeMakes(L.makes); registerMakes();
          // 新动物按设定的栖息地和数量住进岛里
          const land = new Set(L.tiles.map(([q, r]) => q + ',' + r)), NB = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
          for (const m of L.makes) if (m.use === 'creature') {
            const hab = m.habitat || 'land', cand = hab === 'sea' || m.behavior === 'swim' ? L.tiles.flatMap(([q, r]) => NB.map(([a, b]) => [q + a, r + b])).filter(([q, r]) => !land.has(q + ',' + r)) : L.tiles.filter((t) => hab === 'land' || t[2] === hab).map(([q, r]) => [q, r]);
            const pool2 = cand.length ? cand : L.tiles.map(([q, r]) => [q, r]);
            for (let i = 0; i < Math.min(6, m.count || 3); i++) { const [q, r] = pool2[Math.floor(Math.random() * pool2.length)]; L.items.push({ k: m.name, q, r }); }
          }
          L.plants = []; L.creatures = [];
        }
        const made = () => [...L.biomes.map((x) => '生态「' + x.name + '」'), ...L.makes.map((x) => (x.use === 'plant' ? '植物「' : '动物「') + x.name + '」')];
        let note = '';
        if (made().length) {
          step(2, '和原有素材并排对比……'); await new Promise((r) => setTimeout(r, 30));
          const v1 = await lineup(L), cap = (v) => '上排：' + v.labels.join(' · ') + (v.labels2.length ? '<br>下排：' + v.labels2.join(' · ') : '');
          out.innerHTML = `<figure><img src="${v1.url}" alt="新素材对比图"><figcaption>${cap(v1)}</figcaption></figure>`;
          if (review) {
            step(3, 'AI 正在看图审图（对照原有素材和美术圣经）……');
            try {
              const R = await app.ai.review(v1.url, [...v1.labels.map((x) => '上排·' + x), ...v1.labels2.map((x) => '下排·' + x)], { biomes: L.biomes, plants: L.plants, creatures: L.creatures });
              L.biomes = R.biomes;   // 生态按审图意见改；新物种的意见写在下面，不满意可以到造物台里让 AI 再改
              const v2 = await lineup(L); note = `审图 ${R.score}/10：${R.notes}`;
              out.innerHTML = `<figure><img src="${v1.url}" alt="初稿"><figcaption>初稿</figcaption></figure><figure><img src="${v2.url}" alt="按审图意见修改后"><figcaption>按审图意见修改后<br>${cap(v2)}</figcaption></figure>`;
            } catch (e) { note = '审图跳过：' + aiError(e) + '（这个模型可能看不了图）'; }
          }
        }
        msg.innerHTML = `<b>${'④'}</b> 「${L.name}」：${L.note}` + (made().length ? `<br>新创造：${made().join('、')}` : '') + (note ? `<br>${note}` : '');
        const acts = document.createElement('div'); acts.className = 'rowb';
        acts.innerHTML = `<button class="btn ghost" id="aiRedo">不满意，重新生成</button><button class="btn" id="aiOk">${mode === 'new' ? '换成这座岛' : '放进岛里'}</button>`;
        out.appendChild(acts); btn.hidden = true;
        acts.querySelector('#aiRedo').onclick = () => { out.innerHTML = ''; msg.textContent = ''; btn.hidden = false; btn.disabled = false; };
        acts.querySelector('#aiOk').onclick = async () => {
          this.closeModal(); app.hud?.setOpen(false);
          const names = made(); cv.adopt(L);
          await cv.loadLayout(L, mode !== 'new'); this.toast(names.length ? `新创造：${names.join('、')}（建造栏「✦ 我造的」里；也能在方块岛的造物台里继续改）` : `「${L.name}」：${L.note}`);
        };
      } catch (e) { msg.textContent = '没生成出来：' + aiError(e); btn.disabled = false; }
    };
  }
  /** 造物手册：AI 和人共用的美术 SOP */
  openSOP() {
    const sh = this.modal(`<header><h2>体素美术圣经</h2><button class="x" data-close>关闭</button></header>${sopHTML()}`);
    sh.querySelector('[data-close]').onclick = () => this.closeModal();
  }
  /** 镜头设置页 */
  _camPanel() {
    const c = this.g.s.settings.cam || {}, touch = matchMedia('(pointer: coarse)').matches;
    const row = (k, name, desc, opts, cur) => `<div class="grow"><div class="gl"><b>${name}</b><small>${desc}</small></div><div class="gseg">${opts.map(([v, l]) => `<button data-cam="${k}" data-v='${JSON.stringify(v)}' class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    return `<div class="gfx">
      ${row('fov', '视野', '画面能装下多大范围；拉近时会自动再放宽一点', [['narrow', '窄'], ['std', '标准'], ['wide', '广']], c.fov || 'std')}
      ${row('autoTilt', '缩放时自动调俯角', '拉近时镜头慢慢放低成侧视，拉远时抬高成俯瞰；手动调的角度会保留', [[true, '开'], [false, '关']], c.autoTilt !== false)}
      ${row('sens', '转动灵敏度', '双指拖动、右键拖动转视角的快慢', [[0.7, '慢'], [1, '中'], [1.4, '快']], c.sens || 1)}
      <div class="camhelp"><b>操作</b>${touch
        ? '<p>单指拖动：移动</p><p>双指一起左右拖：转视角　上下拖：改俯角</p><p>双指张开 / 捏合：拉近 / 拉远（同时扭转可旋转）</p><p>双击：飞到那里</p>'
        : '<p>左键拖动：移动　右键拖动：转视角、改俯角　滚轮：缩放</p><p>键盘：WASD 移动　Q/E 旋转　R/F 抬高/放低　+/- 缩放</p><p>双击：飞到那里</p>'}
        <p>右上角的镜头按钮里有预设机位（俯瞰、斜看、平视、特写）、环绕和复位。</p></div></div>`;
  }
  /** 画面设置页：预设 + 逐项 */
  _gfxPanel() {
    const st = this.g.s.settings, app = this.app, hq = app.view.kind === 'hq';
    if (!hq) return `<p class="note">现在是低多边形画面（最省电）。画质细调只在高画质画面里有。</p><button class="btn" id="setLegacy">回到高画质画面</button>`;
    const cfg = gfx(st), custom = Object.keys(st.gfx || {}).length > 0;
    const dpr = window.devicePixelRatio || 1, pr = app.view.renderer.getPixelRatio();
    const near = (opts, v) => { let b = 0, bd = Infinity; opts.forEach(([x], i) => { const d = typeof x === 'number' ? Math.abs(x - v) : x === v ? 0 : Infinity; if (d < bd) { bd = d; b = i; } }); return bd === Infinity ? -1 : b; };
    const row = (k, name, desc, opts) => { const cur = near(opts, cfg[k]); return `<div class="grow"><div class="gl"><b>${name}</b><small>${desc}</small></div><div class="gseg">${opts.map(([v, l], i) => `<button data-g="${k}" data-v='${JSON.stringify(v)}' class="${i === cur ? 'on' : ''}">${l}</button>`).join('')}</div></div>`; };
    const presets = ['smooth', 'mid', 'high', 'ultra'].map((k) => `<button data-preset="${k}" class="${st.quality === k && !custom ? 'on' : ''}">${QUALITY[k].label}</button>`).join('');
    const fps = String(st.fps ?? 'auto');
    return `
      <div class="grow gpre"><div class="gl"><b>美术主题</b><small>经典：低多边形手作风；体素：一格一格的方块世界（树、动物、岩石、山都是方块）。切换后重新载入</small></div><div class="gseg">${[['classic', '经典'], ['voxel', '体素']].map(([k, l]) => `<button data-theme="${k}" class="${STYLE.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="grow gpre"><div class="gl"><b>画质预设${custom ? '<em>自定义</em>' : ''}</b><small>每一档都是清晰画面，区别在阴影、光影、植被和生物的细节</small></div><div class="gseg">${presets}</div></div>
      <div class="grow"><div class="gl"><b>帧率</b><small>自动：撑不住 60 帧时稳定在 30 帧；高刷只对 90/120Hz 屏幕有用</small></div><div class="gseg">${[['auto', '自动'], ['30', '30'], ['60', '60'], ['120', '高刷']].map(([k, l]) => `<button data-fps="${k}" class="${fps === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <h3>清晰度</h3>
      ${row('res', '渲染精度', `越高越清晰、越耗电；总像素有上限，超出的部分靠锐化补 · 现在 ${Math.round(innerWidth * pr)}×${Math.round(innerHeight * pr)}`, [[1.5, '标准'], [2, '高'], [2.5, '超高'], [4, '最高']])}
      ${row('aa', '抗锯齿', '让边缘更平滑', [[false, '关'], [true, '开']])}
      ${row('sharpen', '锐化', '让细节更清楚', [[0, '关'], [0.35, '标准'], [0.6, '强']])}
      <label class="sw"><span>动态分辨率<small>帧率不够时自动把渲染精度降一点（最低 85%），够了再升回去</small></span><input type="checkbox" id="set_dynres" ${st.dynres ? 'checked' : ''}><i></i></label>
      <h3>光影</h3>
      ${row('shadow', '阴影', '影子的清晰度', [[0, '关'], [1024, '低'], [2048, '中'], [4096, '高']])}
      ${row('ao', '环境光遮蔽', '树下、岩缝、墙角的柔和暗部', [[false, '关'], [true, '开']])}
      ${row('bloom', '泛光', '阳光、灯火、水面高光的光晕', [[false, '关'], [true, '开']])}
      ${row('dof', '景深', '柔和：只虚化远处；移轴：微缩模型的感觉', [['off', '关'], ['soft', '柔和'], ['tilt', '移轴']])}
      <h3>场景细节</h3>
      ${row('veg', '植被密度', '草、花、树的数量（改了会重新生成）', [['low', '低'], ['mid', '中'], ['high', '高'], ['ultra', '极高']])}
      ${row('life', '生物数量', '岛上动物的多少（改了会重新生成）', [[0.5, '少'], [0.7, '中'], [1, '多']])}
      ${row('view', '视距', '多远以外不画草叶和动物', [['near', '近'], ['mid', '中'], ['far', '远']])}
      <h3>其他</h3>
      <label class="sw"><span>自动调整画质<small>持续卡顿时自动降一档预设</small></span><input type="checkbox" id="set_auto" ${st.autoQuality ? 'checked' : ''}><i></i></label>
      <label class="sw"><span>省电模式<small>不操作 8 秒后降到 30 帧</small></span><input type="checkbox" id="set_powerSave" ${st.powerSave ? 'checked' : ''}><i></i></label>
      <label class="sw"><span>显示帧率<small>屏幕顶部显示帧率、帧时间、绘制次数</small></span><input type="checkbox" id="set_showFps" ${st.showFps ? 'checked' : ''}><i></i></label>
      <button class="btn ghost" id="setLegacy">切换到低多边形画面（最省电，会重新载入）</button>`;
  }
  /** 真机测速：镜头绕岛转 20 秒，出一份可以复制发给开发的结果 */
  async runBench() {
    this.closeModal(); this.toast('性能测试开始，大约 20 秒，请不要操作');
    await new Promise((r) => setTimeout(r, 900));
    const res = await this.app.perfMon.benchmark(20);
    analytics.track('bench', { fps: res.平均帧率, low: res.低帧1, q: res.档位, gpu: String(res.gpu).slice(0, 60) });
    const verdict = res.平均帧率 >= 50 ? '很流畅' : res.平均帧率 >= 30 ? '流畅' : res.平均帧率 >= 24 ? '勉强流畅' : '偏卡';
    const sh = this.modal(`<header><h2>性能测试结果</h2><button class="x" data-close>关闭</button></header>
      <p class="bench-big"><b>${res.平均帧率}</b> 帧/秒 · ${verdict}</p>
      <p class="note">1% 低帧 ${res.低帧1} · 帧时间中位 ${res.帧时间中位} ms · 95% ${res.帧时间95} ms<br>${res.画面} · 档位 ${res.档位} · 像素比 ${res.pr} · 最多 ${res.绘制调用峰值} 次绘制 · ${Math.round(res.三角面峰值 / 1000)}k 三角面<br>${res.gpu}</p>
      <textarea id="benchJson" readonly rows="5">${JSON.stringify(res)}</textarea>
      <div class="acts"><button class="btn" id="benchCopy">复制结果</button></div>`, 'wide');
    sh.addEventListener('click', (e) => e.stopPropagation());
    sh.querySelector('[data-close]').onclick = () => this.closeModal();
    sh.querySelector('#benchCopy').onclick = () => { const ta = sh.querySelector('#benchJson'); ta.select(); navigator.clipboard?.writeText(ta.value).then(() => this.toast('已复制'), () => this.toast('已选中，请手动复制')); };
    return res;
  }
  showEvents() {
    const ev = analytics.all(), count = {};
    ev.forEach((e) => { count[e.e] = (count[e.e] || 0) + 1; });
    const sh = this.modal(`<header><h2>埋点数据</h2><button class="x" data-close>关闭</button></header><p class="note">共 ${ev.length} 条事件，只保存在本机。接入平台后改为上报。</p>
      <div class="evsum">${Object.keys(count).map((k) => `<span class="chip">${k} ${count[k]}</span>`).join('')}</div><textarea id="evJson" readonly rows="8">${JSON.stringify(ev.slice(-200))}</textarea>
      <div class="acts"><button class="btn" id="evCopy">复制最近 200 条</button></div>`, 'wide');
    sh.addEventListener('click', (e) => e.stopPropagation());
    sh.querySelector('[data-close]').onclick = () => this.closeModal();
    sh.querySelector('#evCopy').onclick = () => { const ta = sh.querySelector('#evJson'); ta.select(); navigator.clipboard?.writeText(ta.value).then(() => this.toast('已复制'), () => this.toast('已选中，请手动复制')); };
  }
  /** 模拟的激励视频：3 秒后可以领奖。接入平台后整个函数换成平台广告 */
  adMock(slot) {
    if (this.app.fastAds) return Promise.resolve(true);
    return new Promise((res) => {
      audio.sfx('ad');
      const names = { refresh_hand: '换一手新牌', order_double: '委托奖励翻倍', regrow_all: '全岛立即长好' };
      const sh = this.modal(`<div class="ad"><small>激励视频（模拟）</small><b>${names[slot] || slot}</b><div class="adbar"><i></i></div><p id="adTxt">广告播放中，3 秒后可领取</p><div class="acts"><button class="btn ghost" id="adNo">放弃奖励</button><button class="btn" id="adYes" disabled>领取奖励</button></div></div>`, 'small');
      let done = false; const fin = (v) => { if (done) return; done = true; clearTimeout(tm); this._modalClose = null; this.closeModal(); res(v); };
      this._modalClose = () => fin(false);
      sh.addEventListener('click', (e) => e.stopPropagation());
      const tm = setTimeout(() => { const y = sh.querySelector('#adYes'); if (y) { y.disabled = false; sh.querySelector('#adTxt').textContent = '看完了，可以领取奖励'; } }, 3000);
      sh.querySelector('#adYes').onclick = () => fin(true);
      sh.querySelector('#adNo').onclick = () => fin(false);
    });
  }
  showTitle(isNew, canvas = false) {
    return new Promise((res) => {
      const t = this.el.title;
      t.innerHTML = `<div class="logo"><span>屿</span><span>见</span></div><p>${canvas ? '一座属于你的海岛：随意摆放地块、植物、动物和海洋' : '把小岛一块块铺向远方，在路上遇见新的同伴'}</p><button class="btn big" id="startBtn">${isNew ? '开始' : '回到小岛'}</button><small>手机横屏体验更好</small>`;
      t.hidden = false;
      t.querySelector('#startBtn').onclick = () => { t.classList.add('out'); setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, 500); res(); };
    });
  }

  // ---------- 加载页 ----------
  /** p: 0–1 的进度，null 关闭。像成熟手游一样：标志、进度条、当前步骤、轮换的小贴士 */
  loading(p, text = '') {
    const el = document.getElementById('loading');
    if (p == null) { el.classList.add('out'); clearInterval(this._tipT); setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 450); return; }
    if (el.hidden) {
      const tips = ['在草地上多放几块地，可能会冒出泉水，发现溪流和池塘', '黄昏和清晨发现稀有生态的机会翻倍', '双指转动可以绕着岛看，双指一起上下推可以改变俯角', '海面上可以放小船和浮标，它们会跟着浪起伏', '在「海洋」里试试唤来一头鲸', '不操作一会儿，界面会自己淡出，只留下画面'];
      el.innerHTML = `<div class="ld-logo"><span>屿</span><span>见</span></div><div class="ld-bar"><i></i></div><p class="ld-text"></p><p class="ld-tip"></p>`;
      el.hidden = false; let k = Math.floor(Math.random() * tips.length);
      const tip = el.querySelector('.ld-tip'); tip.textContent = '小贴士：' + tips[k];
      this._tipT = setInterval(() => { k = (k + 1) % tips.length; tip.textContent = '小贴士：' + tips[k]; }, 3200);
    }
    el.querySelector('.ld-bar i').style.width = Math.round(p * 100) + '%';
    el.querySelector('.ld-text').textContent = `${text}　${Math.round(p * 100)}%`;
  }

  // ---------- 拍照 ----------
  photoMode(on) {
    const app = this.app, bar = this.el.photoBar;
    app.mode = on ? 'photo' : 'play'; if (!app.canvasMode) app.selectCard(-1);
    this.hud(!on); bar.hidden = !on;
    if (app.view.kind === 'hq') { if (on) { this._dockWas = app.camDock.open; app.camDock.show(true); } else app.camDock.show(!!this._dockWas); }
    if (!on) return;
    bar.innerHTML = `<button class="btn ghost" id="phExit">返回</button><button class="shutter" id="phShot" aria-label="拍照"></button><label class="phTime"><span id="phHourLabel">${app.view.sky.label()}</span><input type="range" id="phHour" min="0" max="23.9" step="0.1" value="${app.view.sky.hour}" aria-label="拍照时间"></label>`;
    bar.querySelector('#phExit').onclick = () => { app.forceHour = null; app.updateTime(); this.photoMode(false); };
    bar.querySelector('#phHour').oninput = (e) => { app.forceHour = Number(e.target.value); app.updateTime(); };
    bar.querySelector('#phShot').onclick = () => {
      audio.sfx('shutter'); analytics.track('photo');
      const url = app.snapshot();
      const sh = this.modal(`<header><h2>你的小岛</h2><button class="x" data-close>关闭</button></header><img class="shot" src="${url}" alt="小岛照片"><p class="note">${inFrame ? '长按图片保存到相册' : '长按图片保存，或点下面的按钮下载'}</p>${inFrame ? '' : `<div class="acts"><a class="btn" download="yujian-island.jpg" href="${url}">下载图片</a></div>`}`, 'wide');
      sh.addEventListener('click', (e) => { if (!e.target.closest('[data-close]')) e.stopPropagation(); });
    };
  }
}
