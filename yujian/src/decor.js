// 装饰模式：从托盘里选内置装饰或自己上传的素材，点岛上的空地摆放；点已摆好的装饰可以旋转、移动、删除；支持撤销。
// 玩家素材的上传、检查、修复在这里接入 ugc.js。
import * as THREE from 'three';
import { mulberry32 } from './geo.js';
import { DECOR_LIST } from './models/decor.js';
import { TOP } from './config.js';
import { GROUND } from './ground.js';
import { toWorld, fromWorld, CORNERS } from './hex.js';
import { HOME_POSE } from './tiles.js';
import { thumb } from './thumbs.js';
import { audio } from './audio.js';
import { store, analytics } from './services.js';
import { STYLE_SWATCHES } from './palette.js';
import * as UGC from './ugc.js';

const ASSET_KEY = 'yujian_assets_v1';
const BUILTIN_SCALE = 1.45;
const OK_TILES = ['meadow', 'home', 'islet', 'harbor'];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const LV = { pass: ['✓', '通过'], fixed: ['✓', '已修复'], info: ['i', '提示'], warn: ['!', '建议修改'], fail: ['×', '不能使用'] };

export class DecorMode {
  constructor(app) {
    this.app = app; this.g = app.game;
    this.group = new THREE.Group(); app.view.scene.add(this.group);
    this.geoCache = new Map(); this.thumbCache = new Map();
    this.meshes = new Map();       // 装饰条目 → 网格
    this.pending = null;           // 托盘里选中的素材 id
    this.selected = null;          // 岛上选中的装饰条目
    this.undo = []; this.tab = 'builtin';
    this.assets = this._loadAssets();
    // 选中标记
    const ring = new THREE.RingGeometry(0.34, 0.44, 24); ring.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
    this.ring.visible = false; this.ring.renderOrder = 5; app.view.scene.add(this.ring);
    this.t = 0;
    for (const d of this.g.s.decor) this._spawn(d);
  }

  // ---------- 素材 ----------
  _loadAssets() {
    try { return JSON.parse(store.get(ASSET_KEY) || '[]').map((x) => ({ id: x.id, name: x.name, asset: UGC.deserializeAsset(x.data) })).filter((x) => x.asset); } catch { return []; }
  }
  _saveAssets() {
    try { store.set(ASSET_KEY, JSON.stringify(this.assets.map((x) => ({ id: x.id, name: x.name, data: UGC.serializeAsset(x.asset) })))); }
    catch { this.app.ui.toast('存储空间不够，素材没有保存下来'); }
  }
  geometry(id) {
    let geo = this.geoCache.get(id);
    if (geo) return geo;
    let g = null;
    if (id.startsWith('b:')) { const it = DECOR_LIST.find((x) => x.id === id.slice(2)); if (it) g = it.fn(mulberry32(7)).scale(BUILTIN_SCALE); }
    else { const a = this.assets.find((x) => 'u:' + x.id === id); if (a) g = UGC.assetToG(a.asset); }
    if (!g) return null;
    geo = g.toGeometry(); this.geoCache.set(id, geo);
    return geo;
  }
  thumbOf(id) {
    let u = this.thumbCache.get(id);
    if (!u) { const geo = this.geometry(id); u = geo ? thumb(geo, { w: 112, h: 112, zoom: 0.9 }) : ''; this.thumbCache.set(id, u); }
    return u;
  }
  nameOf(id) { if (id.startsWith('b:')) return DECOR_LIST.find((x) => x.id === id.slice(2))?.name || '装饰'; return this.assets.find((x) => 'u:' + x.id === id)?.name || '我的素材'; }

  _spawn(d) {
    const geo = this.geometry(d.a);
    if (!geo) return null;
    const m = new THREE.Mesh(geo, this.app.view.mat);
    m.castShadow = m.receiveShadow = true;
    m.position.set(d.x, GROUND.y(d.x, d.z), d.z); m.rotation.y = d.ry || 0; m.userData.d = d;
    this.group.add(m); this.meshes.set(d, m);
    return m;
  }
  _despawn(d) { const m = this.meshes.get(d); if (m) { this.group.remove(m); this.meshes.delete(d); } }

  // ---------- 进入 / 退出 ----------
  enter() {
    const app = this.app;
    app.selectCard(-1); app.mode = 'decor'; app.ui.hud(false);
    this.undo = []; this.pending = null; this.select(null);
    app.view.markers.setFrontier(this.g.s.tiles.filter((t) => t.own && OK_TILES.includes(t.t)).map((t) => [t.q, t.r]));
    app.ui.el.tray.hidden = false;
    analytics.track('decor_open');
    this.renderTray();
    app.ui.hint('选一件装饰，再点岛上发亮的空地摆放');
  }
  exit() {
    const app = this.app;
    app.mode = 'play'; app.ui.el.tray.hidden = true; app.view.markers.setFrontier([]); this.select(null); this.pending = null;
    app.ui.hud(true); app.ui.hint(''); app.ui.refresh();
  }
  renderTray() {
    const tray = this.app.ui.el.tray, sel = this.selected;
    const items = this.tab === 'builtin'
      ? DECOR_LIST.map((x) => ({ id: 'b:' + x.id, name: x.name }))
      : this.assets.map((x) => ({ id: 'u:' + x.id, name: x.name }));
    tray.innerHTML = `<div class="trayTop">
        <button class="tab ${this.tab === 'builtin' ? 'on' : ''}" data-tab="builtin">装饰</button>
        <button class="tab ${this.tab === 'mine' ? 'on' : ''}" data-tab="mine">我的素材${this.assets.length ? ' ' + this.assets.length : ''}</button>
        <span class="sp"></span>
        <button class="mini" data-a="rot" ${sel || this.pending ? '' : 'disabled'}>旋转</button>
        <button class="mini" data-a="del" ${sel ? '' : 'disabled'}>收起</button>
        <button class="mini" data-a="undo" ${this.undo.length ? '' : 'disabled'}>撤销</button>
        <button class="mini go" data-a="done">完成</button></div>
      <div class="trayItems">${this.tab === 'mine' ? '<button class="item add" data-a="upload"><b>+</b>上传素材</button>' : ''}
        ${items.map((x) => `<button class="item ${this.pending === x.id ? 'on' : ''}" data-id="${x.id}"><img src="${this.thumbOf(x.id)}" alt="">${x.name}</button>`).join('')}
        ${this.tab === 'mine' && !items.length ? '<span class="trayEmpty">上传自己画的图或做的低模，检查通过后就能摆到岛上。</span>' : ''}</div>`;
    tray.onclick = (e) => {
      const b = e.target.closest('button'); if (!b || b.disabled) return;
      audio.sfx('tap');
      if (b.dataset.tab) { this.tab = b.dataset.tab; this.renderTray(); return; }
      if (b.dataset.id) { this.pending = this.pending === b.dataset.id ? null : b.dataset.id; this.pendRot = this.pendRot || 0; this.select(null); this.renderTray(); this.app.ui.hint(this.pending ? `点岛上发亮的空地摆放「${this.nameOf(this.pending)}」` : '点已摆好的装饰可以旋转、移动、收起'); return; }
      ({ rot: () => this.rotate(), del: () => this.remove(), undo: () => this.undoLast(), done: () => this.exit(), upload: () => this.openUpload() })[b.dataset.a]?.();
    };
  }
  select(d) {
    this.selected = d;
    if (d) { this.ring.position.set(d.x, GROUND.y(d.x, d.z) + 0.02, d.z); this.ring.visible = true; this.app.ui.hint('点空地把它挪过去，或用上面的按钮旋转、收起'); }
    else this.ring.visible = false;
  }

  // ---------- 操作 ----------
  _spot(cx, cy) {
    const p = this.app.rig.ground(cx, cy, GROUND.top), [q, r] = fromWorld(p.x, p.z), t = this.g.tile(q, r);
    if (!t || !t.own || !OK_TILES.includes(t.t)) return { err: t && t.own ? '装饰只能摆在草地、海边渔港和地标小岛上' : '只能摆在自己的岛上' };
    const [tx, tz] = toWorld(q, r), lx = p.x - tx, lz = p.z - tz;
    if (t.t === 'islet' && t.center && Math.hypot(lx, lz) < 0.62) return { err: '这里是地标建筑，换个位置' };
    if (t.t === 'home' && Math.hypot(lx - HOME_POSE.x, lz - HOME_POSE.z) < 0.42) return { err: '这里是小木屋，换个位置' };
    // 不要贴着地块边缘，避免悬空
    const k = Math.max(...CORNERS.map((c) => (lx * Math.cos(Math.atan2(c[1], c[0]) - Math.PI / 6) + lz * Math.sin(Math.atan2(c[1], c[0]) - Math.PI / 6))));
    if (k > 0.8) return { err: '离岸边太近了，往里一点' };
    return { x: p.x, z: p.z };
  }
  tap(cx, cy) {
    const ray = this.app.rig.ray(cx, cy), hit = ray.intersectObjects(this.group.children, false)[0];
    if (hit && !this.pending) { audio.sfx('select'); this.select(hit.object.userData.d); this.renderTray(); return; }
    const spot = this._spot(cx, cy);
    if (spot.err) { if (this.pending || this.selected) { audio.sfx('error'); this.app.ui.toast(spot.err); } return; }
    if (this.pending) {
      const d = { a: this.pending, x: spot.x, z: spot.z, ry: this.pendRot || 0 };
      const goals = this.g.addDecor(d); this._spawn(d); this.undo.push({ t: 'add', d });
      this.app.actors.fx.burst(d.x, GROUND.y(d.x, d.z) + 0.1, d.z, 0xffffff, 10, 1.6, 0.04, 0.2);
      audio.sfx('preview'); this.select(d); this.app.afterGoals(goals); this.renderTray();
    } else if (this.selected) {
      const d = this.selected; this.undo.push({ t: 'move', d, x: d.x, z: d.z });
      d.x = spot.x; d.z = spot.z; this.meshes.get(d)?.position.set(d.x, GROUND.y(d.x, d.z), d.z); this.select(d); this.g.save(); audio.sfx('preview'); this.renderTray();
    }
  }
  rotate() {
    const step = Math.PI / 4;
    if (this.selected) { const d = this.selected; this.undo.push({ t: 'rot', d, ry: d.ry || 0 }); d.ry = (d.ry || 0) + step; this.meshes.get(d).rotation.y = d.ry; this.g.save(); }
    else this.pendRot = (this.pendRot || 0) + step;
    this.renderTray();
  }
  remove() {
    const d = this.selected; if (!d) return;
    this.undo.push({ t: 'del', d }); this.g.removeDecor(d); this._despawn(d); this.select(null); this.renderTray();
  }
  undoLast() {
    const u = this.undo.pop(); if (!u) return;
    if (u.t === 'add') { this.g.removeDecor(u.d); this._despawn(u.d); this.select(null); }
    if (u.t === 'del') { this.g.s.decor.push(u.d); this.g.save(); this._spawn(u.d); this.select(u.d); }
    if (u.t === 'move') { u.d.x = u.x; u.d.z = u.z; this.meshes.get(u.d)?.position.set(u.x, GROUND.y(u.x, u.z), u.z); this.g.save(); this.select(u.d); }
    if (u.t === 'rot') { u.d.ry = u.ry; this.meshes.get(u.d).rotation.y = u.ry; this.g.save(); this.select(u.d); }
    this.renderTray();
  }
  update(dt) {
    this.t += dt;
    if (this.ring.visible) { const s = 1 + Math.sin(this.t * 5) * 0.06; this.ring.scale.set(s, 1, s); }
  }

  // ---------- 上传玩家素材 ----------
  standardHtml() {
    return `<div class="std"><table><tbody>${UGC.STANDARD.map((x) => `<tr><th>${x.title}</th><td>${x.rule}<br><span style="color:var(--ink2)">${x.why}</span></td></tr>`).join('')}</tbody></table>
      <h3>游戏配色（素材的颜色会贴合到这些颜色上）</h3><div class="swatches">${STYLE_SWATCHES.map(([n, c]) => `<span style="background:${hex(c)}">${n}</span>`).join('')}</div></div>`;
  }
  openUpload() {
    const ui = this.app.ui;
    const sh = ui.modal(`<header><h2>上传自己的素材</h2><button class="x" data-close>关闭</button></header>
      <label class="drop" for="ugcFile">选择文件<small>图片：PNG / JPG / WebP，透明背景最好，2MB 以内<br>3D 模型：GLB / glTF / OBJ，800 面以内，5MB 以内</small><input type="file" id="ugcFile" accept=".png,.jpg,.jpeg,.webp,.glb,.gltf,.obj,image/png,image/jpeg,image/webp"></label>
      <div id="ugcOut"></div>
      <details class="stdBox" open><summary><b>上传标准</b>（上传后会自动逐条检查，并告诉你怎么改）</summary>${this.standardHtml()}</details>`, 'wide');
    sh.addEventListener('click', (e) => { if (!e.target.closest('[data-close]')) e.stopPropagation(); });
    const input = sh.querySelector('#ugcFile');
    input.onchange = async () => { const f = input.files[0]; if (f) this.analyze(f, sh); };
    sh.addEventListener('dragover', (e) => e.preventDefault());
    sh.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) this.analyze(f, sh); });
  }
  async analyze(file, sh) {
    const out = sh.querySelector('#ugcOut');
    out.innerHTML = '<p class="note">正在检查……</p>';
    analytics.track('ugc_upload', { ext: (file.name.split('.').pop() || '').toLowerCase(), kb: Math.round(file.size / 1024) });
    const rep = await UGC.analyzeFile(file);
    this.showReport(rep, sh);
  }
  showReport(rep, sh) {
    const out = sh.querySelector('#ugcOut'); this.report = rep;
    sh.querySelector('.stdBox')?.removeAttribute('open');
    const fixable = rep.checks.filter((c) => c.fix && (c.level === 'warn' || c.level === 'fail'));
    let pv = '';
    if (rep.asset) { try { const geo = UGC.assetToG(rep.asset).toGeometry(); pv = thumb(geo, { w: 300, h: 300, zoom: 0.9 }); geo.dispose(); } catch { pv = ''; } }
    out.innerHTML = `<div class="ugc"><div class="pv">${pv ? `<img src="${pv}" alt="转换后的样子">` : '<div class="note">无法预览</div>'}
        <div class="score ${rep.pass ? '' : 'bad'}">风格分 <b>${rep.score}</b></div>
        ${rep.asset ? `<label class="slider"><span>大小</span><input type="range" id="ugcSize" min="0.25" max="1.2" step="0.05" value="${rep.asset.size}"></label>` : ''}
        <input id="ugcName" maxlength="12" value="${(rep.name || '我的素材').replace(/"/g, '')}" aria-label="素材名字" style="width:100%;box-sizing:border-box;padding:6px 8px;border-radius:10px;border:1px solid var(--line);font:inherit;text-align:center">
      </div><div><ul class="checks">${rep.checks.map((c) => `<li class="${c.level}"><i title="${LV[c.level]?.[1] || ''}">${LV[c.level]?.[0] || '?'}</i><div><b>${c.title}</b> <span>${LV[c.level]?.[1] || ''}</span><p>${c.detail || ''}</p>${c.how && (c.level === 'warn' || c.level === 'fail') ? `<p class="how">怎么改：${c.how}</p>` : ''}</div></li>`).join('')}</ul>
      <div class="acts">${fixable.length ? `<button class="btn ghost" id="ugcFix">一键修复 ${fixable.length} 项</button>` : ''}<button class="btn" id="ugcAdd" ${rep.pass && rep.asset ? '' : 'disabled'}>${rep.pass ? '加入我的素材' : '修改后才能使用'}</button></div>
      ${rep.pass ? '' : '<p class="note">风格分 70 分以上、没有“不能使用”的项目才能加入。可以先点“一键修复”，或按提示修改后重新上传。</p>'}</div></div>`;
    out.querySelector('#ugcFix')?.addEventListener('click', async () => { const r2 = await UGC.applyAllFixes(rep); analytics.track('ugc_fix', { before: rep.score, after: r2.score }); audio.sfx(r2.pass ? 'ok' : 'warn'); this.showReport(r2, sh); });
    out.querySelector('#ugcSize')?.addEventListener('change', (e) => { rep.asset.size = Number(e.target.value); this.showReport(rep, sh); });
    out.querySelector('#ugcAdd')?.addEventListener('click', () => {
      const name = (out.querySelector('#ugcName').value || '我的素材').slice(0, 12), id = Date.now().toString(36);
      this.assets.push({ id, name, asset: { ...rep.asset, name } }); this._saveAssets();
      analytics.track('ugc_add', { kind: rep.kind, score: rep.score });
      audio.sfx('ok'); this.app.ui.closeModal();
      this.tab = 'mine'; this.pending = 'u:' + id; this.renderTray();
      this.app.ui.toast(`「${name}」加入了我的素材，点岛上的空地摆放`);
    });
    audio.sfx(rep.pass ? 'ok' : 'warn');
  }
}
