/* 核心工具：DOM、数学、事件、存档、提示、弹窗 */
(function () {
  const CF = (window.CF = window.CF || {});

  // ---------- DOM ----------
  CF.$ = (s, r = document) => r.querySelector(s);
  CF.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  CF.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  CF.h = function (html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  // ---------- 数学 ----------
  CF.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  CF.lerp = (a, b, t) => a + (b - a) * t;
  CF.rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  CF.randi = (a, b) => Math.floor(CF.rand(a, b + 1));
  CF.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  CF.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  CF.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  CF.rng = function (seed) { // mulberry32
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  CF.hashStr = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  CF.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  CF.dayDiff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  CF.fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  CF.fmtNum = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)));

  // ---------- 事件 ----------
  const handlers = {};
  CF.bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); },
    emit(ev, data) { (handlers[ev] || []).slice().forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); },
  };

  // ---------- 存档 ----------
  const KEY = 'cf_save_v1';
  function defaults() {
    return {
      version: 1,
      created: CF.today(),
      xp: { knowledge: 0, practice: 0 },
      dims: { de: 0, zhi: 0, ti: 0, mei: 0, shi: 0, qi: 0 },
      domains: { ai: 0, emb: 0, aero: 0, biz: 0 },
      founder: { fp: 0, long: 0, grit: 0, exec: 0, mission: 0, lead: 0 },
      quiz: { seen: {}, correct: 0, wrong: 0 },
      labs: {},
      code: {},
      quests: { log: [] },
      scenarios: {},
      roadmap: {},
      daily: { date: '', items: [], done: [] },
      streak: { count: 0, last: '', best: 0 },
      campaign: {},
      skirmish: { easy: 0, normal: 0, hard: 0 },
      achievements: {},
      stats: { riffs: 0, kills: 0, battles: 0, wins: 0, playSec: 0 },
      avatar: null,
      hero: 'riot', // 开局英雄（主角造乐走特殊渠道获得）
      tutorial: { done: false },
      quick: { best: 0, runs: 0, bestRank: '' },
      city: null,
      boosts: 0,
      heroStats: {},
      roster: null, // { owned: [], frags: {}, treasures: [] }，见 js/roster.js
      chapters: { seed: 0, stages: {} },
      dungeon: {},
      settings: { master: CF_CONFIG.volume.master, music: CF_CONFIG.volume.music, sfx: CF_CONFIG.volume.sfx, trial: false, quality: 'high', bgmStyle: {}, bgmBpm: {}, rotateChoice: '', reduceMotion: false },
    };
  }
  function merge(base, over) {
    if (!over || typeof over !== 'object' || Array.isArray(over)) return over === undefined ? base : over;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k in over) out[k] = base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? merge(base[k], over[k]) : over[k];
    return out;
  }
  CF.Save = {
    data: defaults(),
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) this.data = merge(defaults(), JSON.parse(raw));
      } catch (e) { console.warn('读取存档失败', e); }
      return this.data;
    },
    save() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 隐私模式等 */ }
    },
    reset() { this.data = defaults(); this.save(); },
    exportText() { return JSON.stringify(this.data, null, 1); },
    importText(txt) {
      const obj = JSON.parse(txt);
      if (!obj || obj.version !== 1) throw new Error('不是有效的《造月之路》存档');
      this.data = merge(defaults(), obj);
      this.save();
    },
  };

  // ---------- 提示 ----------
  CF.toast = function (msg, type = '', ms = 2200) {
    const host = CF.$('#toastHost');
    if (Array.from(host.children).some((c) => c.textContent === msg && c.style.opacity !== '0')) return;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    host.appendChild(t);
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms);
  };

  // ---------- 弹窗 ----------
  let onCloseFn = null;
  CF.modal = {
    isOpen: () => !CF.$('#modal').classList.contains('hidden'),
    open({ title = '', body = '', foot = null, wide = false, onClose = null, closable = true, hero = 'current' }) {
      const card = CF.$('#modalCard');
      if (CF.modal._stage) { CF.modal._stage.destroy(); CF.modal._stage = null; }
      card.className = 'modal-card' + (wide ? ' wide' : '');
      card.innerHTML = `<div class="modal-head"><canvas class="mh-fx"></canvas><h3>${title}</h3>${closable ? '<button class="x" data-x>✕</button>' : ''}</div><div class="modal-body"></div>`;
      if (CF.PixelFX) CF.modal._stage = new CF.PixelFX.Stage(card.querySelector('.mh-fx'), { mode: 'bar', fx: closable ? 0.86 : 0.93, fy: 0.56, cell: 10, hero });
      const bd = card.querySelector('.modal-body');
      if (typeof body === 'string') bd.innerHTML = body; else if (body) bd.appendChild(body);
      if (foot && foot.length) {
        const f = document.createElement('div');
        f.className = 'modal-foot';
        foot.forEach((b) => {
          const btn = document.createElement('button');
          btn.className = 'btn ' + (b.cls || '');
          btn.innerHTML = b.text;
          btn.onclick = () => { CF.Audio && CF.Audio.sfx('click'); b.onClick ? b.onClick(btn) : CF.modal.close(); };
          f.appendChild(btn);
        });
        card.appendChild(f);
      }
      const x = card.querySelector('[data-x]');
      if (x) x.onclick = () => { CF.Audio && CF.Audio.sfx('click'); CF.modal.close(); };
      onCloseFn = onClose;
      CF.$('#modal').classList.remove('hidden');
      return bd;
    },
    close() {
      if (!CF.modal.isOpen()) return;
      CF.$('#modal').classList.add('hidden');
      CF.$('#modalCard').innerHTML = '';
      if (CF.modal._stage) { CF.modal._stage.destroy(); CF.modal._stage = null; }
      const fn = onCloseFn; onCloseFn = null;
      CF.bus.emit('modal:closed');
      if (fn) fn();
    },
  };

  // ---------- 横屏旋转时的坐标换算 ----------
  CF.rotated = () => document.getElementById('app').classList.contains('rotated');
  // 把屏幕坐标转为 #app 内的坐标
  CF.appPoint = function (cx, cy) {
    if (CF.rotated()) return { x: cy, y: window.innerWidth - cx };
    return { x: cx, y: cy };
  };
  // 元素在 #app 内的矩形（未旋转坐标系）
  CF.appRect = function (el) {
    const r = el.getBoundingClientRect();
    if (!CF.rotated()) return r;
    return { left: r.top, top: window.innerWidth - r.right, width: r.height, height: r.width };
  };
})();
