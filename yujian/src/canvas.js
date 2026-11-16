// 自由画布：没有资源和目标，随意加地块、种植物、放动物和建筑、换海水和时段。
// 放草地时有机会发现稀有生态（溪流、池塘），发现以后它们出现在“岛屿”里可以随意放。
// 存档单独一份（和经营玩法互不影响）；所有操作都能撤销。
import { key, toWorld, fromWorld, DIRS } from './hex.js';
import { findItem, STARTER } from './catalog.js';
import { CANNED } from './ai.js';
import { RARE, GRASS, newDiscovery, roll, chance } from './discovery.js';
import { GROUND } from './ground.js';
import { audio } from './audio.js';
import { analytics } from './services.js';
import * as THREE from 'three';

const SAVE = 'yujian_canvas_v1';
const store = { get: () => { try { return JSON.parse(localStorage.getItem(SAVE)); } catch { return null; } }, set: (s) => { try { localStorage.setItem(SAVE, JSON.stringify(s)); } catch { /* 存不下就算了 */ } } };

export function newCanvas(kind = 'starter') {
  const s = { v: 1, tiles: [], items: [], seq: 1, disc: newDiscovery(), unlocked: [], sea: 'clear', cam: { ...STARTER.cam } };
  if (kind === 'starter') {
    s.tiles = STARTER.tiles.map(([q, r, t]) => [q, r, t]);
    s.items = STARTER.items.map((it) => ({ id: s.seq++, ry: 0, s: 1, ...it }));
    // 样张岛自带溪流和池塘：算作已经发现
    s.unlocked = ['stream', 'pond']; s.disc.found = { stream: 1, pond: 1 }; s.disc.total = 2; s.disc.grass = 2;
  } else {
    s.tiles = [[0, 0, 'camp'], [1, 0, 'meadow'], [0, 1, 'forest']];
    s.cam = { x: 0.9, z: 0.6, yaw: -0.45, pitch: 0.62, dist: 12 };
  }
  return s;
}

export class CanvasMode {
  constructor(app) {
    this.app = app; this.view = app.view;
    this.s = store.get(); if (!this.s || this.s.v !== 1) this.s = newCanvas('starter');
    this.sel = null;          // 当前选中的条目 id，'erase' 是橡皮擦
    this.undo = [];
    this.rnd = Math.random;
  }
  save() { store.set(this.s); }
  /** 整座岛重建（读档、新画布） */
  syncAll() {
    const v = this.view, s = this.s;
    v.rebuildAll(s.tiles.map(([q, r, t]) => ({ q, r, t })));
    v.items?.set(s.items);
    v.setSea?.(s.sea);
    const c = s.cam; this.app.rig.focus.set(c.x, 0, c.z); this.app.rig.setView({ yaw: c.yaw, pitch: c.pitch, dist: c.dist });
    this.app.rig.bounds = this.bounds();
  }
  bounds() {
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
    for (const [q, r] of this.s.tiles) { const [x, z] = toWorld(q, r); a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, z); d = Math.max(d, z); }
    if (a > b) { a = c = -5; b = d = 5; }
    return { minX: a - 14, maxX: b + 14, minZ: c - 14, maxZ: d + 14 };
  }
  async newWorld(kind) {
    this.s = newCanvas(kind); this.undo = []; this.save(); this.syncAll();
    const app = this.app, v = this.view;
    if (v.preload) { app.booting = true; app.ui.loading(0, '正在生成海岛'); await v.preload((p, t) => app.ui.loading(p, t), app.rig.focus, app.rig.target.dist); app.ui.loading(null); app.booting = false; }
    analytics.track('canvas_new', { kind });
  }
  tileAt(q, r) { return this.s.tiles.find((t) => t[0] === q && t[1] === r) || null; }
  unlocked(id) { const d = findItem(id); return !d?.rare || this.s.unlocked.includes(id); }

  // ---------- 点选 ----------
  /** 沿视线往前走，找到第一个碰到的地面或海面 */
  pick(cx, cy) {
    const ray = this.app.rig.ray(cx, cy).ray, o = ray.origin, d = ray.direction, T = this.view.terrain;
    let t = 0.3, prev = null;
    for (let i = 0; i < 600 && t < 400; i++) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, h = T.heightAt(x, z), g = h ?? 0;
      if (y <= g) {
        // 二分细化
        let lo = prev ?? t - 0.05, hi = t;
        for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2, mx = o.x + d.x * m, mz = o.z + d.z * m, mh = T.heightAt(mx, mz) ?? 0; if (o.y + d.y * m <= mh) hi = m; else lo = m; }
        const px = o.x + d.x * hi, pz = o.z + d.z * hi, ph = T.heightAt(px, pz);
        return { x: px, z: pz, y: ph ?? 0, land: ph != null };
      }
      prev = t; t += Math.max(0.02, Math.min(1.5, (y - g) * 0.6));
    }
    return null;
  }

  // ---------- 动作 ----------
  select(id) { this.sel = id; const def = id && id !== 'erase' ? findItem(id) : null; if (def && (def.sea || def.event || def.hour !== undefined)) { this.applyInstant(def); this.sel = null; } return this.sel; }
  applyInstant(def) {
    const app = this.app;
    if (def.sea) { this.s.sea = def.sea; this.view.setSea?.(def.sea); this.save(); app.ui.toast(def.name); }
    else if (def.event) { const ok = this.view.event?.(def.event, app.rig.focus); app.ui.toast(ok ? (def.event === 'whale' ? '远处的海面上，一头座头鲸浮了上来' : '海豚群朝这边游过来了') : '海里还没有它们'); }
    else if (def.hour !== undefined) { if (def.hour == null) app.setTimeMode('real'); else app.setTimeMode('fixed', def.hour); app.ui.toast(def.name); }
    audio.sfx('select');
  }
  tap(cx, cy) {
    const p = this.pick(cx, cy); if (!p) return;
    if (!this.sel) return this.inspect(p, cx, cy);
    if (this.sel === 'erase') return this.erase(p, cx, cy);
    const def = findItem(this.sel); if (!def) return;
    if (def.tile) return this.placeTile(p, def);
    return this.placeItem(p, def);
  }
  /** 双击：没拿着工具时，镜头飞过去对准那一点（枢轴平滑切换） */
  focusAt(cx, cy) {
    if (this.sel) return false;
    const p = this.pick(cx, cy); if (!p) return false;
    const rig = this.app.rig; rig.flyTo(p.x, p.z, Math.min(rig.target.dist, 10), 0.8); return true;
  }
  /** 用 AI 生成的布局建一座新岛（AI 造岛） */
  async loadLayout(L) {
    const s = newCanvas('blank'); s.tiles = L.tiles.map(([q, r, t]) => [q, r, t]); s.items = []; s.sea = L.sea;
    s.unlocked = ['stream', 'pond'].filter((k) => s.tiles.some((t) => t[2] === k));
    for (const it of L.items) {
      const def = findItem(it.k); if (!def) continue;
      const [x, z] = toWorld(it.q, it.r), a = Math.random() * 6.28, d = def.water ? 0 : 0.15 + Math.random() * 0.2;
      s.items.push({ id: s.seq++, k: it.k, x: +(x + Math.cos(a) * d).toFixed(3), z: +(z + Math.sin(a) * d).toFixed(3), ry: +(Math.random() * 6.28).toFixed(2), s: def.prop === 'lighthouse' || def.prop === 'windmill' || def.prop === 'bellTower' ? 1 : +(0.9 + Math.random() * 0.2).toFixed(2) });
    }
    let cx = 0, cz = 0; for (const [q, r] of s.tiles) { const [x, z] = toWorld(q, r); cx += x; cz += z; } cx /= s.tiles.length; cz /= s.tiles.length;
    let rad = 1; for (const [q, r] of s.tiles) { const [x, z] = toWorld(q, r); rad = Math.max(rad, Math.hypot(x - cx, z - cz)); }
    s.cam = { x: +cx.toFixed(2), z: +cz.toFixed(2), yaw: -0.45, pitch: 0.6, dist: Math.min(40, Math.max(12, rad * 2.2 + 8)) };
    this.s = s; this.undo = []; this.save(); this.syncAll();
    const app = this.app, v = this.view;
    app.setTimeMode('fixed', L.hour);
    if (v.preload) { app.booting = true; app.ui.loading(0, '正在生成海岛'); await v.preload((p, t) => app.ui.loading(p, t), app.rig.focus, app.rig.target.dist); app.ui.loading(null); app.booting = false; }
    analytics.track('canvas_ai_island', { tiles: s.tiles.length });
  }
  /** 屏幕上离点击位置最近的村民（40 像素以内） */
  _villagerHit(cx, cy) {
    const V = this.view.villagers; if (!V || cx == null) return null;
    const rig = this.app.rig, b = this.app.canvas.getBoundingClientRect(); let best = null, bd = 40;
    for (const p of V.people) { if (p.state === 'sleep') continue; const m = p.m.position, [sx, sy, vis] = rig.project(m.x, m.y + 0.08, m.z); if (!vis) continue; const d = Math.hypot(sx + b.left - cx, sy + b.top - cy); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  /** 点到村民：他说一句话（配置了 AI 就让模型说，否则用内置台词） */
  talk(p) {
    const app = this.app, DOING = { farm: '在菜地里干活', wood: '在林子边砍柴', shore: '在海边捡贝壳', water: '在溪边打水' };
    const doing = p.state === 'work' ? DOING[p.task] || '在地里干活' : p.state === 'walk' ? '在小路上走' : p.state === 'sit' ? '坐在营火边' : '在屋前伸懒腰';
    const canned = CANNED[p.state === 'work' ? 'work' : p.state === 'walk' ? 'walk' : p.state === 'sit' ? 'sit' : 'idle'];
    const say = (t) => app.hud?.hint(`${p.name}：${t}`, 3600);
    audio.sfx('tap');
    if (!app.ai?.ready) { say(canned[Math.floor(Math.random() * canned.length)]); return; }
    if (this._talking) return; this._talking = true; say('……');
    app.ai.villagerLine({ name: p.name, doing, hour: app.view.sky.label() }).then(say).catch((e) => { say(canned[0]); console.warn('AI 岛民说话失败', e); }).finally(() => { this._talking = false; });
  }
  inspect(p, cx, cy) {
    const vp = this._villagerHit(cx, cy); if (vp) return this.talk(vp);
    // 没有选东西时点一下：显示这块地的名字（轻提示，不打断）
    const [q, r] = fromWorld(p.x, p.z), t = this.tileAt(q, r);
    if (t) { const d = findItem(t[2]); if (d) this.app.hud?.hint(d.name + (RARE[t[2]] ? ' · ' + RARE[t[2]].name : ''), 1200); }
  }
  placeTile(p, def) {
    const [q, r] = fromWorld(p.x, p.z), cur = this.tileAt(q, r);
    if (!this.unlocked(def.id)) { this.app.ui.toast('还没发现：在草地上多放几块地，泉水会自己冒出来'); return; }
    if (cur && cur[2] === def.tile) return;
    let type = def.tile, found = null;
    if (GRASS.has(type)) {
      const coastal = DIRS.some((d) => !this.tileAt(q + d[0], r + d[1])), nearWater = DIRS.some((d) => { const n = this.tileAt(q + d[0], r + d[1]); return n && (n[2] === 'stream' || n[2] === 'pond'); });
      found = roll(this.s.disc, this.rnd, { hour: this.view.sky.hour, coastal, nearWater });
      if (found) type = found;
    }
    const removedItems = [];
    if (cur) { this.view.removeTile(q, r); this.s.tiles.splice(this.s.tiles.indexOf(cur), 1); }
    this.s.tiles.push([q, r, type]);
    this.view.setTile({ q, r, t: type }, true);
    if (cur) removedItems.push(...(this.view.items?.prune() || []));
    this.undo.push({ a: 'tile', q, r, prev: cur ? cur[2] : null, items: removedItems });
    this.app.rig.bounds = this.bounds();
    audio.sfx('place');
    if (found) this.discovered(found, q, r);
    this.save();
    analytics.track('canvas_tile', { t: type, found: found || '' });
  }
  discovered(type, q, r) {
    const first = !this.s.unlocked.includes(type);
    if (first) this.s.unlocked.push(type);
    const info = RARE[type];
    setTimeout(() => {
      audio.sfx('landmark');
      this.app.ui.banner((first ? '发现新生态 · ' : '又发现了 · ') + info.name, info.desc, 3200);
      this.app.hud?.refresh(); this.app.hud?.flash('land');
      // 镜头稍微凑近看一眼
      const [x, z] = toWorld(q, r), rig = this.app.rig;
      if (first) rig.flyTo(x, z, Math.min(rig.dist, 9), 1.4);
    }, 750);
    analytics.track('canvas_discover', { type, first, total: this.s.disc.total });
  }
  placeItem(p, def) {
    const app = this.app;
    if (def.water && p.land) { app.ui.toast(def.name + '要放在海面上'); return; }
    if (!def.water && !p.land) { app.ui.toast(def.name + '要放在岛上'); return; }
    if (!def.animal && this.view.items.hit(p.x, p.z, (def.r ?? 0.1) * 0.6)) { app.hud?.hint('这里已经有东西了', 1000); return; }
    const it = { id: this.s.seq++, k: def.id, x: +p.x.toFixed(3), z: +p.z.toFixed(3), ry: +(Math.random() * 6.28).toFixed(2), s: +(0.9 + Math.random() * 0.2).toFixed(2) };
    if (def.prop === 'lighthouse' || def.prop === 'windmill' || def.prop === 'bellTower') it.s = 1;
    if (!this.view.items.add(it)) { app.ui.toast(def.note || (def.animal ? `${def.name}在这里待不住，换块草地试试` : '这里放不下')); return; }
    this.s.items.push(it); this.undo.push({ a: 'item+', id: it.id });
    audio.sfx(def.animal ? 'companion' : 'preview'); this.save();
  }
  /** 屏幕上离点击位置最近的物件（点到树冠、风车顶也算点中） */
  _screenHit(cx, cy) {
    const rig = this.app.rig, b = this.app.canvas.getBoundingClientRect(); let best = null, bd = 34;
    for (const it of this.view.items.items.values()) {
      const def = findItem(it.k), y = (this.view.terrain.heightAt(it.x, it.z) ?? 0), hgt = def?.prop === 'lighthouse' || def?.prop === 'windmill' || def?.prop === 'bellTower' ? 0.6 : def?.kit && def.kit !== 'rock' && def.kit !== 'reed' ? 0.35 : 0.06;
      for (const hy of [0.02, hgt]) { const [sx, sy, vis] = rig.project(it.x, y + hy, it.z); if (!vis) continue; const d = Math.hypot(sx + b.left - cx, sy + b.top - cy); if (d < bd) { bd = d; best = it; } }
    }
    return best;
  }
  erase(p, cx, cy) {
    const it = (cx != null && this._screenHit(cx, cy)) || this.view.items.hit(p.x, p.z, 0.05);
    if (it) { this.view.items.remove(it.id); this.s.items = this.s.items.filter((x) => x.id !== it.id); this.undo.push({ a: 'item-', it }); audio.sfx('harvestWood'); this.save(); return; }
    const [q, r] = fromWorld(p.x, p.z), cur = this.tileAt(q, r);
    if (!cur || !p.land) return;
    if (this.s.tiles.length <= 1) { this.app.ui.toast('至少留一块地'); return; }
    this.view.removeTile(q, r); this.s.tiles.splice(this.s.tiles.indexOf(cur), 1);
    const gone = this.view.items.prune(); this.s.items = this.s.items.filter((x) => !gone.some((g) => g.id === x.id));
    this.undo.push({ a: 'tile-', q, r, t: cur[2], items: gone });
    audio.sfx('harvestStone'); this.save();
  }
  undoLast() {
    const u = this.undo.pop(); if (!u) { this.app.hud?.hint('没有可以撤销的了', 1000); return; }
    const v = this.view, s = this.s;
    if (u.a === 'item+') { v.items.remove(u.id); s.items = s.items.filter((x) => x.id !== u.id); }
    else if (u.a === 'item-') { v.items.add(u.it); s.items.push(u.it); }
    else if (u.a === 'tile') {
      v.removeTile(u.q, u.r); s.tiles = s.tiles.filter((t) => !(t[0] === u.q && t[1] === u.r));
      if (u.prev) { s.tiles.push([u.q, u.r, u.prev]); v.setTile({ q: u.q, r: u.r, t: u.prev }); }
      v.items.prune(); s.items = s.items.filter((x) => v.items.items.has(x.id));
      for (const it of u.items || []) if (v.items.add(it)) s.items.push(it);
    } else if (u.a === 'tile-') {
      s.tiles.push([u.q, u.r, u.t]); v.setTile({ q: u.q, r: u.r, t: u.t });
      for (const it of u.items || []) if (v.items.add(it)) s.items.push(it);
    }
    audio.sfx('select'); this.save();
  }
  /** 下一块草地发现稀有生态的机会（界面上的小提示用） */
  nextChance() { return chance(this.s.disc, { hour: this.view.sky.hour }); }
  rememberCam() { const r = this.app.rig; this.s.cam = { x: +r.focus.x.toFixed(2), z: +r.focus.z.toFixed(2), yaw: +r.target.yaw.toFixed(3), pitch: +r.target.pitch.toFixed(3), dist: +r.target.dist.toFixed(2) }; this.save(); }
}
export { THREE, GROUND };
