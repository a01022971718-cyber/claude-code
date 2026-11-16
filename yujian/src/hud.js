// 自由画布的界面。原则：画面优先——
//  - 只占四个角：左上岛屿菜单，右上时间/镜头/拍照/设置（镜头面板从右边缘伸出），右下（右手拇指）建造按钮，左下撤销/橡皮擦（只在建造时出现）。
//  - 选了分类才从底边伸出一条物件栏；摆放时界面不挡住点到的位置（物件栏只占底边一条）。
//  - 不操作 4 秒后界面自动淡出，只留一个半透明的建造按钮；碰一下屏幕就回来。
import { CATEGORIES, ITEMS } from './catalog.js';
import { RARE, DISCOVERY } from './discovery.js';
import { thumb, thumbMaterial } from './thumbs.js';
import { kit, propOf } from './hq/dressing.js';
import * as P from './hq/props.js';
import * as L from './hq/models-land.js';
import { audio } from './audio.js';
import { CAM_ICON } from './camdock.js';
import * as THREE from 'three';

const I = {
  build: '<svg viewBox="0 0 24 24"><path d="M14.5 3.5l6 6-2.2 2.2-1.6-1.6-7.9 7.9a2.2 2.2 0 01-3.1-3.1l7.9-7.9-1.3-1.3z" fill="currentColor"/></svg>',
  land: '<svg viewBox="0 0 24 24"><path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" fill="currentColor" opacity=".9"/><path d="M4 12.5c3 1.6 5.2-1.4 8-0.2s5 1.8 8-0.3" stroke="#0d1d24" stroke-width="1.3" fill="none" opacity=".5"/></svg>',
  plant: '<svg viewBox="0 0 24 24"><path d="M12 21v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 3c4.5 2.5 6.5 6 5 9.5-1.2 2.7-3.5 3.3-5 3.3s-3.8-.6-5-3.3C5.5 9 7.5 5.5 12 3z" fill="currentColor"/></svg>',
  animal: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="4.6" ry="3.8" fill="currentColor"/><circle cx="6.2" cy="10.2" r="2.1" fill="currentColor"/><circle cx="17.8" cy="10.2" r="2.1" fill="currentColor"/><circle cx="9.4" cy="6.4" r="2" fill="currentColor"/><circle cx="14.6" cy="6.4" r="2" fill="currentColor"/></svg>',
  build2: '<svg viewBox="0 0 24 24"><path d="M3.5 11.5L12 4l8.5 7.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M6 10.5V20h12v-9.5" fill="currentColor"/><rect x="10.3" y="14" width="3.4" height="6" fill="#0d1d24" opacity=".55"/></svg>',
  sea: '<svg viewBox="0 0 24 24"><path d="M2.5 9c2.4-2 4.8-2 7.1 0s4.8 2 7.1 0 4.8-2 4.8-2M2.5 14c2.4-2 4.8-2 7.1 0s4.8 2 7.1 0 4.8-2 4.8-2M2.5 19c2.4-2 4.8-2 7.1 0s4.8 2 7.1 0 4.8-2 4.8-2" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/></svg>',
  sky: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M5.4 18.6l1.7-1.7M16.9 7.1l1.7-1.7"/></g></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 6L4 10.5 9 15" stroke="currentColor" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 10.5H14a5.5 5.5 0 010 11h-3" stroke="currentColor" stroke-width="2.1" fill="none" stroke-linecap="round"/></svg>',
  erase: '<svg viewBox="0 0 24 24"><path d="M14.2 3.8l6 6-9.6 9.6H6.4l-3-3a1.6 1.6 0 010-2.3z" fill="currentColor"/><path d="M8.5 9.5l6 6M11 19.4h9.5" stroke="#0d1d24" stroke-width="1.6" stroke-linecap="round" opacity=".55"/></svg>',
  photo: '<svg viewBox="0 0 24 24"><path d="M8.5 5l1.2-2h4.6l1.2 2H19a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" fill="currentColor"/><circle cx="12" cy="12.5" r="3.8" fill="#0d1d24" opacity=".5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" stroke-width="4.4" stroke-dasharray="3.3 2.51"/><circle cx="12" cy="12" r="5.8" fill="currentColor"/><circle cx="12" cy="12" r="2.4" fill="#0d1d24" opacity=".6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 018 0v2.5" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.6" fill="#f7c948"/><g stroke="#f7c948" stroke-width="2.2" stroke-linecap="round"><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></g></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M15.5 3.2a8.8 8.8 0 105.3 13.9A7.4 7.4 0 0115.5 3.2z" fill="#b9c8f2"/></svg>',
};
const CAT_ICON = { land: I.land, plant: I.plant, animal: I.animal, build: I.build2, sea: I.sea, sky: I.sky };
const SKY_GRAD = { real: 'linear-gradient(135deg,#7fb8e6,#f3d9a0)', dawn: 'linear-gradient(160deg,#6f9fd6,#f3d9c6 70%,#ffc59a)', noon: 'linear-gradient(160deg,#3f86d0,#cfe6f2)', after: 'linear-gradient(160deg,#4a8ccf,#d9e8ee 80%,#ffe7c4)', golden: 'linear-gradient(160deg,#6a7fc0,#ffc79a 70%,#ffa463)', night: 'linear-gradient(160deg,#0f1a36,#2c3a62)' };

export class CanvasHUD {
  constructor(app) {
    this.app = app; this.cv = app.canvasMode; this.cat = null; this.open = false; this.thumbs = new Map();
    const root = document.createElement('div'); root.className = 'chud'; root.id = 'chud';
    root.innerHTML = `
      <div class="c-tl"><button class="c-ico c-menu" data-a="menu" aria-label="岛屿菜单"><b>屿</b></button></div>
      <div class="c-tr"><button class="c-chip" data-a="time" aria-label="时间"></button><button class="c-ico" data-a="cam" aria-label="镜头">${CAM_ICON}</button><button class="c-ico" data-a="photo" aria-label="拍照">${I.photo}</button><button class="c-ico" data-a="set" aria-label="设置">${I.gear}</button></div>
      <div class="c-bl"><button class="c-ico" data-a="undo" aria-label="撤销">${I.undo}<i>撤销</i></button><button class="c-ico" data-a="erase" aria-label="橡皮擦">${I.erase}<i>擦除</i></button></div>
      <div class="c-br"><div class="c-wheel">${CATEGORIES.map((c, i) => `<button class="c-cat" data-cat="${c.id}" style="--i:${i}" aria-label="${c.name}">${CAT_ICON[c.id]}<i>${c.name}</i></button>`).join('')}</div>
        <button class="c-fab" data-a="build" aria-label="建造">${I.build}<i>建造</i></button></div>
      <div class="c-strip" hidden><div class="c-strip-head"><b></b><span></span></div><div class="c-items"></div></div>
      <div class="c-hint" hidden></div>
      <div class="c-tut" hidden><span></span><button data-a="tutSkip">跳过</button></div>`;
    document.getElementById('ui').appendChild(root);
    this.root = root; this.el = { strip: root.querySelector('.c-strip'), items: root.querySelector('.c-items'), head: root.querySelector('.c-strip-head'), hint: root.querySelector('.c-hint'), chip: root.querySelector('.c-chip') };
    root.addEventListener('click', (e) => this._click(e));
    // 空闲淡出
    const wake = () => this.wake();
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) addEventListener(ev, wake, { passive: true });
    this.wake();
    this.refreshTime();
  }
  show(on) { this.root.hidden = !on; }
  wake() {
    this.root.classList.remove('idle');
    clearTimeout(this._idle);
    this._idle = setTimeout(() => { if (!this.open && this.app.mode !== 'photo') this.root.classList.add('idle'); }, 4000);
  }
  _click(e) {
    const b = e.target.closest('button'); if (!b) return;
    e.stopPropagation(); audio.sfx('tap');
    const a = b.dataset.a, cv = this.cv;
    if (b.dataset.cat) return this.setCat(this.cat === b.dataset.cat ? null : b.dataset.cat);
    if (b.dataset.item) {
      const id = b.dataset.item;
      if (b.classList.contains('locked')) { this.hint(`还没发现${RARE[id]?.name || ''}：在草地上多放几块地，泉水会自己冒出来`, 2400); return; }
      const sel = cv.select(cv.sel === id ? null : id);
      this.renderItems(); if (sel) this.hint(CATEGORIES.find((c) => c.id === this.cat)?.hint || '', 1800);
      return;
    }
    if (a === 'build') return this.setOpen(!this.open);
    if (a === 'undo') return cv.undoLast();
    if (a === 'erase') { cv.select(cv.sel === 'erase' ? null : 'erase'); this.renderItems(); this._syncErase(); if (cv.sel === 'erase') this.hint('点地块或物件把它擦掉', 1600); return; }
    if (a === 'time') return this.app.ui.openTime();
    if (a === 'photo') return this.app.ui.photoMode(true);
    if (a === 'cam') return this.app.camDock.toggle();
    if (a === 'set') return this.app.ui.openSettings();
    if (a === 'menu') return this.openMenu();
    if (a === 'closeStrip') return this.setCat(null);
    if (a === 'tutSkip') return this.endTutorial();
  }
  setOpen(on) {
    this.open = on; this.root.classList.toggle('building', on);
    if (!on) { this.setCat(null); this.cv.select(null); this._syncErase(); }
    this.wake();
  }
  setCat(id) {
    this.cat = id;
    this.root.querySelectorAll('.c-cat').forEach((b) => b.classList.toggle('on', b.dataset.cat === id));
    this.el.strip.hidden = !id; this.root.classList.toggle('has-strip', !!id);
    if (!id) { this.cv.select(null); this._syncErase(); return; }
    if (this.cv.sel && !ITEMS[id].some((x) => x.id === this.cv.sel)) this.cv.select(null);
    this.renderItems();
  }
  _syncErase() { this.root.querySelector('[data-a="erase"]').classList.toggle('on', this.cv.sel === 'erase'); }
  renderItems() {
    const id = this.cat; if (!id) return;
    const cat = CATEGORIES.find((c) => c.id === id), cv = this.cv;
    let sub = '';
    if (id === 'land') { const d = cv.s.disc, left = Math.max(0, DISCOVERY.hardAt - d.since), pct = Math.round(cv.nextChance() * 100); sub = d.total ? `泉水保底：还差 ${left} 块草地必出 · 下一块 ${pct}%` : `再放 ${Math.max(1, DISCOVERY.firstAt - d.grass)} 块草地，会有惊喜`; }
    if (id === 'sky') sub = '跟随现实时间时，早晚和你那边同步';
    this.el.head.innerHTML = `<b>${cat.name}</b><span>${sub}</span><button class="c-x" data-a="closeStrip" aria-label="收起">${I.close}</button>`;
    this.el.items.innerHTML = ITEMS[id].map((it) => {
      const locked = it.rare && !cv.unlocked(it.id), on = cv.sel === it.id;
      return `<button class="c-item ${on ? 'on' : ''} ${locked ? 'locked' : ''} ${it.rare ? 'rare' : ''}" data-item="${it.id}">${this._icon(it, locked)}<i>${locked ? '未发现' : it.name}</i></button>`;
    }).join('');
    this._syncErase();
  }
  _icon(it, locked) {
    if (locked) return `<span class="c-art c-lock">${I.lock}</span>`;
    if (it.tile) return `<span class="c-art c-hex" style="--sw:${it.sw}"></span>`;
    if (it.sea) return `<span class="c-art c-round" style="background:radial-gradient(circle at 35% 30%,#fff8,transparent 45%),${it.sw}"></span>`;
    if (it.hour !== undefined) return `<span class="c-art c-round" style="background:${SKY_GRAD[it.id]}">${it.hour != null && (it.hour > 19.5 || it.hour < 6) ? I.moon : ''}</span>`;
    const url = this._thumb(it);
    return url ? `<span class="c-art" style="background-image:url(${url})"></span>` : `<span class="c-art c-round">${it.event ? I.sea : I.plant}</span>`;
  }
  /** 物件的缩略图：用高画质模型渲染一张小图，第一次打开分类时生成 */
  _thumb(it) {
    if (this.thumbs.has(it.id)) return this.thumbs.get(it.id);
    let obj = null;
    try {
      if (it.kit) obj = kit()[it.kit][it.v];
      else if (it.prop && typeof P[it.prop] === 'function') obj = propOf(P[it.prop], 0).geometry;
      else if (it.animal) {
        const m = L[it.animal](1);
        if (m.parts) { obj = new THREE.Group(); for (const p of Object.values(m.parts)) obj.add(new THREE.Mesh(p.geometry, thumbMaterial())); } else obj = m.geometry || m;
      }
    } catch { obj = null; }
    const url = obj ? thumb(obj, { w: 112, h: 112, zoom: 1.05 }) : '';
    this.thumbs.set(it.id, url);
    return url;
  }
  refresh() { if (this.cat) this.renderItems(); }
  /** 加载页里先把所有物件的缩略图渲染好，第一次打开建造栏不卡 */
  prewarm() { for (const list of Object.values(ITEMS)) for (const it of list) if (!it.tile && !it.sea && it.hour === undefined && !it.event) this._thumb(it); }
  /** 第一次进画布的引导：拖动 → 转动 → 建造，做到一步就换下一步；提示是一条小胶囊，不挡画面 */
  startTutorial() {
    const cv = this.cv; if (cv.s.tut >= 3) return;
    const rig = this.app.rig, el = this.root.querySelector('.c-tut'), txt = el.querySelector('span');
    const touch = matchMedia('(pointer: coarse)').matches;
    const steps = [
      { t: touch ? '单指拖动，看看整座岛' : '按住鼠标拖动，看看整座岛', pos: 'top', done: (b) => Math.hypot(rig.focus.x - b.x, rig.focus.z - b.z) > 1.2 },
      { t: touch ? '两指一起左右拖动转视角，上下拖动改俯角' : '按住右键拖动，换个角度看', pos: 'top', done: (b) => Math.abs(rig.target.yaw - b.yaw) > 0.45 || Math.abs(rig.target.pitch - b.pitch) > 0.25 },
      { t: '点右下角「建造」→「岛屿」，在海面上加一块地', pos: 'br', done: (b) => cv.s.tiles.length > b.tiles },
    ];
    let k = cv.s.tut || 0, base = null;
    const show = () => { const st = steps[k]; txt.textContent = st.t; el.dataset.pos = st.pos; el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); base = { x: rig.focus.x, z: rig.focus.z, yaw: rig.target.yaw, pitch: rig.target.pitch, tiles: cv.s.tiles.length }; if (st.pos === 'br') this.root.querySelector('.c-fab').classList.add('flash'); };
    show();
    clearInterval(this._tut);
    this._tut = setInterval(() => {
      if (this.app.mode !== 'play') return;
      if (!steps[k].done(base)) return;
      k++; cv.s.tut = k; cv.save(); audio.sfx('goal');
      if (k >= steps.length) { this.endTutorial(true); return; }
      show();
    }, 250);
  }
  endTutorial(done = false) {
    clearInterval(this._tut); this.cv.s.tut = 3; this.cv.save();
    this.root.querySelector('.c-tut').hidden = true; this.root.querySelector('.c-fab').classList.remove('flash');
    if (done) this.hint('都会了。慢慢搭你的岛吧', 2200);
  }
  flash(cat) { const b = this.root.querySelector(`[data-cat="${cat}"]`); if (b) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); } this.root.querySelector('.c-fab').classList.add('flash'); setTimeout(() => this.root.querySelector('.c-fab').classList.remove('flash'), 2400); }
  hint(text, ms = 1600) {
    const h = this.el.hint; if (!text) { h.hidden = true; return; }
    h.textContent = text; h.hidden = false; h.classList.remove('in'); void h.offsetWidth; h.classList.add('in');
    clearTimeout(this._ht); this._ht = setTimeout(() => { h.hidden = true; }, ms);
  }
  refreshTime() {
    const sk = this.app.view.sky, st = this.app.game.s.settings;
    this.el.chip.innerHTML = `${sk.isNight ? I.moon : I.sun}<b>${sk.label()}</b>${st.timeMode === 'fixed' ? '<i>固定</i>' : ''}`;
  }
  openMenu() {
    const ui = this.app.ui, cv = this.cv;
    const sh = ui.modal(`<header><h2>我的岛</h2><button class="x" data-close>关闭</button></header>
      <div class="c-menu-grid">
        <button class="c-card" data-n="starter"><b>样张岛</b><span>从高画质样张那座完整的岛开始</span></button>
        <button class="c-card" data-n="blank"><b>空白小岛</b><span>三块地，从零开始搭</span></button>
      </div>
      <p class="note">已发现：${Object.keys(RARE).map((k) => `${RARE[k].name}${cv.unlocked(k) ? ' ✓' : '（未发现）'}`).join('　')}</p>
      <p class="note">自由画布的存档和经营玩法分开保存。想玩资源、目标、地块卡，到设置里打开「经营玩法」。</p>`, 'small');
    sh.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (e.target.closest('[data-close]')) return ui.closeModal();
      const b = e.target.closest('[data-n]'); if (!b) return;
      if (!(await ui.confirm('换一座新岛会清空现在这座岛，确定吗？', '换新岛'))) return;
      cv.newWorld(b.dataset.n); this.setOpen(false); ui.toast(b.dataset.n === 'starter' ? '回到了样张岛' : '一座新的小岛');
    });
  }
}
