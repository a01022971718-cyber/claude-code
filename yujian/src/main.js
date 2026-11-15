// 《屿见》入口：把状态、画面、界面、输入串起来。
import { Stage } from './stage.js';
import { World, ShoreField, Markers } from './world.js';
import { Water } from './water.js';
import { CameraRig } from './camera.js';
import { Actors } from './actors.js';
import { Game, landmarkDef } from './state.js';
import { UI, ICON, fmtWait } from './ui.js';
import { DecorMode } from './decor.js';
import { audio } from './audio.js';
import { analytics, ads } from './services.js';
import { TILE, QUALITY, TOP, RES, RES_NAME, DAILY, HOUR } from './config.js';
import { setDetail, MARK_Y } from './tiles.js';
import { toWorld, fromWorld, key } from './hex.js';
import { PAL } from './palette.js';
import { FX } from './fx.js';
import { Sky } from './sky.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class App {
  constructor() {
    const qs = new URLSearchParams(location.search);
    this.debug = qs.get('debug') === '1';
    this.forceQ = QUALITY[qs.get('q')] ? qs.get('q') : null;
    this.forceHour = qs.has('hour') ? Number(qs.get('hour')) : null;
    this.fastAds = /[?&]fastads=1/.test(location.search);
    this.canvas = document.getElementById('stage');
    this.game = new Game();
    if (!this.game.load()) this.game.newGame();
    const s = this.game.s;
    const qk = this.forceQ || s.settings.quality;
    setDetail(QUALITY[qk]?.detail ?? 1);
    this.stage = new Stage(this.canvas, qk);
    this.world = new World(this.stage.scene);
    this.shore = new ShoreField();
    this.water = new Water(this.stage.scene, this.shore);
    this.markers = new Markers(this.stage.scene, this.world.mat);
    this.rig = new CameraRig(this.canvas, 1);
    this.stage.attach(this.rig.cam);
    this.stage.onSky = (sk) => { this.water.setSky(sk); this.ui?.refreshTime(); };
    this.water.setSky(this.stage.sky);
    this.updateTime();
    this.perf = { t: 0, n: 0, armed: false, checks: 0 };
    this.actors = new Actors(this.stage.scene, this.world.mat);
    this.actors.walkable = (q, r) => { const t = this.game.tile(q, r); return !!t && t.own && ['meadow', 'home', 'islet', 'harbor'].includes(t.t); };
    this.sel = { slot: -1, cell: null, coupon: false };
    this.mode = 'play'; // play | decor | photo | cut
    this.ui = new UI(this);
    this.decor = new DecorMode(this);
    this.syncAll();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.rig.onTap = (x, y) => this.tap(x, y);
    this.game.on('change', () => this.ui.refresh());
    this.game.on('gift', () => { this.ui.toast('资源用完了，潮水送来一张免费地块', 'gift'); audio.sfx('coupon'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.suspend(); this.game.save(true); } else { audio.resume(); this.tick(); } });
    addEventListener('pagehide', () => this.game.save(true));
    this.last = performance.now(); this.acc = 0;
    requestAnimationFrame((t) => this.loop(t));
    this.dbg = {
      give: () => { this.game.addRes({ wood: 10, stone: 10, food: 10 }); this.ui.refresh(); },
      coupon: () => { this.game.addRes({ coupon: 2 }); this.ui.refresh(); },
      skip: () => { s.skew += 4 * HOUR; this.tick(); this.ui.toast('时间快进了 4 小时'); },
      day: () => { s.skew += 24 * HOUR; this.tick(); this.ui.toast('到了新的一天'); },
    };
    this.intro();
    this.ready = true;
  }

  view(t) { return { q: t.q, r: t.r, t: t.t, dir: t.dir, center: t.center, harvested: !!(TILE[t.t].harvest && t.ready > this.game.now()) }; }

  // ---------- 同步画面 ----------
  syncAll() {
    const g = this.game, s = g.s;
    this.world.rebuildAll(s.tiles.map((t) => this.view(t)));
    this.shore.setCells(g.landCells());
    for (const lm of s.landmarks) this.actors.addLandmark(lm, landmarkDef(lm.i), lm.reached);
    this.actors.clearPeople();
    const home = s.tiles.find((t) => t.t === 'home') || s.tiles[0], [hx, hz] = toWorld(home.q, home.r);
    this.home = [hx, hz];
    this.actors.setHome(home.q, home.r);
    this.actors.addPerson({ shirt: PAL.cloth, hat: 'straw' }, hx + 0.45, hz + 0.45, 1);
    s.companions.forEach((c, i) => { const [x, z] = this.actors.landmarkDoor(c.lm); this.actors.addPerson(c, x, z, 20 + i); });
    this.syncDynamic();
  }
  syncDynamic() {
    const g = this.game, now = g.now();
    this.markers.setReady(g.readyTiles());
    this.actors.syncBoats(g.s.tiles.filter((t) => t.t === 'harbor').map((t) => ({ q: t.q, r: t.r, dir: t.dir, ready: (t.ready || 0) <= now })));
    this.rig.bounds = g.bounds();
    this.actors.center = g.centroid();
    this.checkCrate();
  }
  checkCrate() {
    const g = this.game;
    if (g.s.day.crate !== 'ready' || this.mode === 'cut') { this.actors.hideCrate(); return; }
    // 漂在离镜头最近的岸边
    let best = null, bz = -Infinity;
    for (const k of g.front) { const i = k.indexOf(','), [x, z] = toWorld(+k.slice(0, i), +k.slice(i + 1)); if (z > bz) { bz = z; best = [x, z]; } }
    if (best) this.actors.showCrate(best[0] + 0.2, best[1] + 0.9);
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.stage.resize(w, h);
    // 底部有手牌，把画面整体往上挪一点，让岛的中心落在手牌上方
    this.rig.cam.aspect = w / h; this.rig.cam.fov = w < h ? 44 : 30;
    this.rig.cam.setViewOffset(w, h, 0, Math.round(h * (w < h ? 0.07 : h < 500 ? 0.12 : 0.06)), w, h);
    this.rig.cam.updateProjectionMatrix();
  }
  setQuality(k, auto = false) {
    this.game.s.settings.quality = k; if (!auto) this.game.s.settings.autoQuality = false; this.game.save();
    setDetail(QUALITY[k].detail); this.stage.setQuality(k);
    this.markers.ghostCache.clear();
    this.world.rebuildAll(this.game.s.tiles.map((t) => this.view(t)));
    this.resize();
  }
  async restart() { this.game.reset(); analytics.track('restart'); location.reload(); }

  // ---------- 开场 ----------
  async intro() {
    const g = this.game, s = g.s, lm = s.landmarks[0], [lx, lz] = toWorld(lm.q, lm.r), first = !s.started;
    this.ui.hud(false); this.rig.locked = true;
    if (first) { this.rig.focus.set(lx, 0, lz); this.rig.dist = 12; }
    else { const [cx, cz] = g.centroid(); this.rig.focus.set(cx, 0, cz); this.rig.dist = 22; }
    await this.ui.showTitle(first);
    audio.init(); audio.setEnabled(s.settings.sound); audio.setMusic(s.settings.music);
    if (first) {
      s.started = true; g.save(); analytics.track('start');
      this.ui.banner('远处有一座停转的风车', '', 2200);
      await wait(1500);
      await this.rig.flyTo(this.home[0] + 1.2, this.home[1] + 0.6, 19, 2.8);
      this.ui.toast('从下面选一张地块卡，把小岛铺过去');
    } else {
      analytics.track('resume', { awayMin: Math.round((g.away || 0) / 60000) });
      const n = g.readyTiles().length;
      if ((g.away || 0) > 10 * 60000 && n) this.ui.toast(`欢迎回来，有 ${n} 块地长好了`);
    }
    this.rig.locked = false; this.ui.hud(true); this.ui.render(); this.checkCrate();
    this.perf.armed = true;
  }

  // ---------- 昼夜 ----------
  hourNow() {
    const st = this.game.s.settings;
    if (this.forceHour != null) return this.forceHour;
    return st.timeMode === 'fixed' ? st.fixedHour : Sky.realHour(this.game.now());
  }
  updateTime() { this.stage.setHour(this.hourNow()); }
  setTimeMode(mode, hour) {
    const st = this.game.s.settings; st.timeMode = mode; if (hour != null) st.fixedHour = hour;
    this.forceHour = null; this.game.save(); this.updateTime();
    analytics.track('time_mode', { mode, hour: Math.round(st.fixedHour) });
  }
  /** 自动画质：开局后测 4 秒帧率，太低就降一档 */
  autoQuality(dt) {
    const p = this.perf, st = this.game.s.settings;
    if (!p.armed || !st.autoQuality || this.forceQ || p.checks >= 2 || this.mode === 'cut') return;
    p.t += dt; p.n++;
    if (p.t < 4) return;
    const fps = p.n / p.t; p.t = 0; p.n = 0; p.checks++;
    analytics.track('fps', { fps: Math.round(fps), q: st.quality });
    const next = fps < 24 ? (st.quality === 'high' ? 'mid' : st.quality === 'mid' ? 'low' : null) : null;
    if (next) { this.setQuality(next, true); this.ui.toast(`已自动调成${QUALITY[next].label}画质，保证流畅`); }
    else p.checks = 2;
  }

  // ---------- 选牌 / 放置 ----------
  clearSel() {
    this.sel.slot = -1; this.sel.cell = null;
    this.markers.setFrontier([]); this.markers.setGhost(null); this.ui.bubble(null); this.ui.hint('');
  }
  selectCard(i) {
    const g = this.game, s = g.s;
    if (this.mode !== 'play') return;
    if (i < 0 || this.sel.slot === i) { this.clearSel(); this.ui.refresh(); return; }
    const type = s.hand[i];
    if (!g.canPlay(i) && !s.coupons) {
      const c = g.cost(type), lack = RES.filter((r) => (c[r] || 0) > s.res[r]).map((r) => `${c[r] - s.res[r]} ${RES_NAME[r]}`).join('、');
      audio.sfx('error'); this.ui.shakeCard(i);
      this.ui.toast(`还差 ${lack}。${g.readyTiles().length ? '先点一点长好的地块收获' : '换一张买得起的卡'}`);
      return;
    }
    const cells = g.cells(type);
    if (!cells.length) { audio.sfx('error'); this.ui.toast(TILE[type].coastal ? '渔港要挨着海，现在没有合适的位置' : '没有可以放的位置'); return; }
    this.clearSel(); this.sel.slot = i;
    this.markers.setFrontier(cells);
    audio.sfx('select'); this.ui.hint('点亮起的格子试放，再点一次确认'); this.ui.refresh();
  }
  toggleCoupon() { this.sel.coupon = !this.sel.coupon && this.game.s.coupons > 0; this.ui.refresh(); }
  place(q, r) {
    const g = this.game, slot = this.sel.slot, useCoupon = !g.slotFree(slot) && (this.sel.coupon || !g.canPlay(slot)) && g.s.coupons > 0;
    const res = g.place(slot, q, r, useCoupon);
    if (!res) { audio.sfx('error'); this.ui.toast('资源不够了'); return; }
    this.clearSel(); this.sel.coupon = false;
    this.world.setTile(this.view(res.tile), true);
    this.shore.setCells(g.landCells());
    audio.sfx('place');
    const [x, z] = toWorld(q, r);
    setTimeout(() => this.actors.fx.ring(x, z, 1.05), 300);
    const pv = res.pv, [sx, sy] = this.rig.project(x, 1.1, z);
    this.ui.float(sx, sy, this.ui.gainHtml(res.got) + (pv.adj ? `<small>相邻 +${pv.adj}</small>` : ''), 350);
    setTimeout(() => { audio.sfx(pv.res === 'wood' ? 'harvestWood' : pv.res === 'stone' ? 'harvestStone' : 'harvestFood'); this.ui.bump(pv.res); }, 520);
    if (res.wasted > 0) this.ui.toast(`${RES_NAME[pv.res]}装满了，多出的 ${res.wasted} 没装下`);
    this.syncDynamic();
    this.afterGoals(res.goals);
    this.ui.refresh();
    if (res.landmark) this.cutscene(res.landmark, [x, z]);
  }
  showBubble() {
    const g = this.game, type = g.s.hand[this.sel.slot], [q, r] = this.sel.cell, pv = g.preview(type, q, r);
    this._bubbleHtml = `+${pv.total} ${ICON[pv.res]}<small>${pv.adj ? `含相邻加成 +${pv.adj}` : TILE[type].tip}</small><em>再点一次确认</em>`;
    const [x, z] = toWorld(q, r), [sx, sy] = this.rig.project(x, 1.5, z);
    this.ui.bubble(this._bubbleHtml, sx, sy);
  }

  // ---------- 点击 ----------
  tap(cx, cy) {
    if (this.mode === 'decor') return this.decor.tap(cx, cy);
    if (this.mode !== 'play') return;
    const g = this.game, gp = this.rig.ground(cx, cy, 0), cp = this.actors.cratePos;
    if (cp && Math.hypot(gp.x - cp[0], gp.z - cp[1]) < 1.1) return this.openCrate();
    const top = this.rig.ground(cx, cy, TOP);
    let [q, r] = fromWorld(top.x, top.z), tile = g.tile(q, r);
    if (!tile) { [q, r] = fromWorld(gp.x, gp.z); tile = g.tile(q, r); }
    if (this.sel.slot >= 0) {
      const type = g.s.hand[this.sel.slot];
      if (!tile && g.front.has(key(q, r)) && (!TILE[type].coastal || g.harborDir(q, r) >= 0)) {
        if (this.sel.cell && this.sel.cell[0] === q && this.sel.cell[1] === r) return this.place(q, r);
        this.sel.cell = [q, r];
        this.markers.setGhost(type, q, r, TILE[type].coastal ? g.harborDir(q, r) : 0);
        audio.sfx('preview'); this.showBubble();
        return;
      }
      if (tile && this.tryHarvest(tile, true)) return;
      if (this.sel.cell) { this.sel.cell = null; this.markers.setGhost(null); this.ui.bubble(null); } else { this.clearSel(); this.ui.refresh(); }
      return;
    }
    if (tile) {
      if (this.tryHarvest(tile, false)) return;
      if (tile.t === 'islet') { const d = landmarkDef(tile.lm); this.ui.toast(tile.own ? `${d.name}：${d.who.role}${d.who.name}住在这里` : `一座还没接通的${d.name}，把地铺到它旁边`); }
    } else if (g.front.has(key(q, r))) this.ui.toast('先在下面选一张地块卡');
  }
  tryHarvest(tile, quiet) {
    if (!tile.own || !TILE[tile.t].harvest) return false;
    const res = this.game.harvest(tile.q, tile.r);
    if (!res) return false;
    if (res.wait) { if (!quiet) { this.ui.toast(`${TILE[tile.t].name}还在长，${fmtWait(res.wait)}后可以再收`); return true; } return false; }
    const [x, z] = toWorld(tile.q, tile.r), y = MARK_Y[tile.t] || 1;
    this.world.setTile(this.view(tile));
    this.actors.fx.burst(x, TOP + 0.3, z, tile.t === 'forest' ? 0x49a97c : tile.t === 'harbor' ? 0x9fd8ff : 0xf0c24a, 14, 2.4, 0.06, 0.5);
    audio.sfx(res.res === 'wood' ? 'harvestWood' : 'harvestFood');
    const [sx, sy] = this.rig.project(x, y, z);
    this.ui.float(sx, sy, this.ui.gainHtml(res.got) || '<small>装满了</small>');
    this.ui.bump(res.res);
    if (!res.got[res.res]) this.ui.toast(`${RES_NAME[res.res]}已经装满，先花掉一些`);
    this.syncDynamic(); this.afterGoals(res.goals); this.ui.refresh();
    return true;
  }
  afterGoals(list) { (list || []).forEach((x, i) => this.ui.goalDone(x.g, x.got, i)); if (list?.length) { this.ui.refresh(); this.checkCrate(); } }

  // ---------- 地标演出 ----------
  async cutscene(L, from) {
    const { def, lm, next } = L, [lx, lz] = toWorld(lm.q, lm.r), nd = landmarkDef(next.i), [nx, nz] = toWorld(next.q, next.r);
    this.mode = 'cut'; this.rig.locked = true; this.ui.hud(false); this.actors.hideCrate();
    // 下一座地标的小岛先建出来
    for (const t of this.game.s.tiles) if (t.t === 'islet' && t.lm === next.i) this.world.setTile(this.view(t));
    this.shore.setCells(this.game.landCells());
    this.actors.addLandmark(next, nd, false);
    await wait(650);
    await this.rig.flyTo(lx, lz, 12.5, 1.5);
    this.actors.activate(lm.i); audio.sfx('landmark');
    this.ui.banner(def.lit, '', 2300);
    await wait(2100);
    const [dx, dz] = this.actors.landmarkDoor(lm.i);
    this.actors.addPerson(def.who, dx, dz, 20 + lm.i);
    this.actors.fx.burst(dx, TOP + 0.2, dz, 0xffffff, 12, 1.6);
    audio.sfx('companion');
    const extra = [def.unlock ? `新地块「${TILE[def.unlock].name}」` : '', '资源上限 +10', L.bonus.coupon ? `卡券 +${L.bonus.coupon}` : ''].filter(Boolean).join(' · ');
    this.ui.banner(`${def.who.role}${def.who.name}搬到了岛上`, extra, 2900);
    await wait(2900);
    await this.rig.flyTo(nx, nz, 17, 2.3);
    this.ui.banner(`远处出现了一座${nd.name}`, '把岛铺过去，会遇见新的同伴', 2300);
    await wait(2300);
    await this.rig.flyTo(from[0], from[1], 21, 2.0);
    this.mode = 'play'; this.rig.locked = false; this.ui.hud(true);
    this.syncDynamic(); this.ui.render();
    if (lm.i === 0) this.ui.toast(`${def.who.name}带来了委托，点右侧的「委托」看看`);
  }

  // ---------- 每日内容 / 广告位 ----------
  openCrate() {
    const got = this.game.openCrate(); if (!got) return;
    const [x, z] = this.actors.cratePos, [sx, sy] = this.rig.project(x, 0.6, z);
    this.actors.hideCrate(); this.actors.fx.burst(x, 0.2, z, 0xf7c948, 18, 2.6, 0.06);
    audio.sfx('crate'); this.ui.float(sx, sy, this.ui.gainHtml(got)); this.ui.toast('漂来的补给箱：' + this.ui.gainHtml(got));
    this.ui.refresh();
  }
  async refreshHand() {
    const g = this.game, d = g.s.day;
    if (d.freeRefresh < DAILY.freeRefresh) d.freeRefresh++;
    else if (d.adRefresh < DAILY.adRefresh) { if (!(await ads.show('refresh_hand'))) return; d.adRefresh++; }
    else return this.ui.toast('今天的换牌次数用完了');
    this.clearSel(); g.refreshHand(); audio.sfx('select'); analytics.track('refresh_hand');
  }
  async regrowAll() {
    const g = this.game, d = g.s.day;
    if (d.adRegrow >= DAILY.adRegrow) return this.ui.toast('今天的次数用完了');
    if (!(await ads.show('regrow_all'))) return;
    d.adRegrow++;
    const list = g.regrowAll();
    list.forEach((t) => this.world.setTile(this.view(t)));
    this.syncDynamic(); audio.sfx('coupon'); this.ui.toast(`${list.length} 块地立刻长好了`);
  }
  async deliver(id, double) {
    if (double && !(await ads.show('order_double'))) { this.ui.openOrders(); return; }
    const res = this.game.deliver(id, double);
    if (res) { audio.sfx('coupon'); this.ui.toast('委托完成：' + this.ui.gainHtml(res.got), 'goal'); this.afterGoals(res.goals); }
    this.ui.openOrders();
  }
  /** 每秒一次：作物长好、跨天刷新 */
  tick() {
    const g = this.game, grown = g.tickRegrow();
    if (grown.length) { grown.forEach((t) => this.world.setTile(this.view(t))); this.syncDynamic(); }
    this.updateTime();
    if (g.ensureDay()) { this.ui.toast('新的一天：委托和补给箱都刷新了'); this.checkCrate(); this.ui.refresh(); }
  }
  /** 当前画面截图（JPEG dataURL） */
  snapshot() { this.stage.render(); return this.canvas.toDataURL('image/jpeg', 0.92); }

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    FX.uTime.value += dt;
    this.autoQuality(dt);
    this.rig.update(dt); this.world.update(dt); this.markers.update(dt); this.actors.update(dt); this.decor.update(dt);
    const f = this.rig.focus;
    this.stage.follow(f, this.rig.dist);
    this.shore.update(this.stage.renderer, f.x, f.z);
    this.water.update(dt, f.x, f.z);
    if (this.sel.cell && this.mode === 'play') { const [x, z] = toWorld(this.sel.cell[0], this.sel.cell[1]), [sx, sy] = this.rig.project(x, 1.5, z); this.ui.bubble(undefined, sx, sy); }
    this.acc += dt; if (this.acc >= 1) { this.acc = 0; this.tick(); }
    this.stage.render();
    requestAnimationFrame((t) => this.loop(t));
  }
}

function start() { try { window.__game = new App(); } catch (e) { console.error(e); const d = document.createElement('p'); d.style.cssText = 'position:absolute;inset:auto 16px 16px;color:#17313b;background:#fffaf0;padding:12px;border-radius:12px'; d.textContent = '游戏启动失败：' + (e.message || e) + '。请换一个支持 WebGL 的浏览器再试。'; document.getElementById('app').appendChild(d); } }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
