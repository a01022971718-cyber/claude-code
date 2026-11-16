// 镜头面板：右侧边缘的一小块半透明面板，点右上角的镜头按钮打开，拍照模式里自动出现。
//  - 预设机位：俯瞰（整座岛）、斜看（45°）、平视（站在岛上看出去）、特写（看清小动物和人）
//  - 环绕：镜头绕着当前焦点慢慢转（碰一下屏幕就停）；复位：回到岛中心的默认视角
//  - 俯角滑条、视野（窄 / 标准 / 广）
// 面板只占右边缘一条，不操作几秒后变淡；手势操作镜头时它不拦截画面上的触摸。
import * as THREE from 'three';
import { audio } from './audio.js';

const deg = THREE.MathUtils.radToDeg, rad = THREE.MathUtils.degToRad;
const ICON = {
  top: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5-8 4.5-8-4.5z" fill="currentColor"/><path d="M4 12l8 4.5 8-4.5M4 16.5L12 21l8-4.5" stroke="currentColor" stroke-width="1.6" fill="none" opacity=".6"/></svg>',
  three: '<svg viewBox="0 0 24 24"><path d="M3 18l6-9 4 5 3-3 5 7z" fill="currentColor"/><circle cx="17" cy="6" r="2.2" fill="currentColor" opacity=".7"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  orbit: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="13" rx="9" ry="4.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="9" r="3" fill="currentColor"/><path d="M19.5 9.5l1.6 2.6-3 .3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 107-7H8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10 2L7 5l3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
export const CAM_ICON = '<svg viewBox="0 0 24 24"><rect x="2.5" y="7" width="13" height="10" rx="2.2" fill="currentColor"/><path d="M16 10.5l5.5-3v9l-5.5-3z" fill="currentColor" opacity=".8"/></svg>';

export class CamDock {
  constructor(app) {
    this.app = app;
    const el = this.el = document.createElement('div'); el.className = 'camdock'; el.hidden = true;
    const b = (k, l) => `<button data-cp="${k}" aria-label="${l}">${ICON[k]}<i>${l}</i></button>`;
    el.innerHTML = `<div class="cd-grid">${b('top', '俯瞰')}${b('three', '斜看')}${b('eye', '平视')}${b('close', '特写')}${b('orbit', '环绕')}${b('reset', '复位')}</div>
      <label class="cd-row"><span>俯角<b class="cd-pv"></b></span><input type="range" min="3" max="85" step="1" class="cd-pitch" aria-label="俯角"></label>
      <div class="cd-row cd-fov"><span>视野</span><div>${[['narrow', '窄'], ['std', '标准'], ['wide', '广']].map(([k, l]) => `<button data-fov="${k}">${l}</button>`).join('')}</div></div>`;
    document.getElementById('ui').appendChild(el);
    this.pitchEl = el.querySelector('.cd-pitch'); this.pv = el.querySelector('.cd-pv');
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => this._click(e));
    this.pitchEl.addEventListener('input', () => { const r = app.rig; r.orbit = 0; r.fly = null; r.target.pitch = rad(+this.pitchEl.value); this._sync(true); this.wake(); });
    for (const ev of ['pointerdown', 'wheel', 'keydown']) addEventListener(ev, () => this.wake(), { passive: true });
    this._t = setInterval(() => { if (!el.hidden) this._sync(); }, 150);
  }
  get open() { return !this.el.hidden; }
  show(on) { this.el.hidden = !on; if (on) { this._sync(); this.wake(); } this.onToggle?.(on); }
  toggle() { this.show(this.el.hidden); }
  wake() { this.el.classList.remove('idle'); clearTimeout(this._idle); this._idle = setTimeout(() => this.el.classList.add('idle'), 5000); }
  _click(e) {
    const btn = e.target.closest('button'); if (!btn) return;
    e.stopPropagation(); audio.sfx('tap'); this.wake();
    const app = this.app, rig = app.rig;
    if (btn.dataset.fov) { app.setCam('fov', btn.dataset.fov); this._sync(); return; }
    const k = btn.dataset.cp;
    if (k === 'orbit') { rig.orbit = rig.orbit ? 0 : 0.12; rig.fly = null; this._sync(); return; }
    rig.preset(k, app.islandHome());
    this._sync();
  }
  /** 面板上的状态跟着镜头走（拖动镜头时俯角滑条也在动） */
  _sync(fromSlider = false) {
    const rig = this.app.rig, p = Math.round(deg(rig.target.pitch));
    if (!fromSlider) this.pitchEl.value = p;
    this.pv.textContent = p + '°';
    this.el.querySelector('[data-cp="orbit"]').classList.toggle('on', !!rig.orbit);
    this.el.querySelectorAll('[data-fov]').forEach((b) => b.classList.toggle('on', b.dataset.fov === rig.fovKey));
  }
}
