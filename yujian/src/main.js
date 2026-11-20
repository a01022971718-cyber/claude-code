// 《屿见》入口：把状态、画面、界面、输入串起来。
import { LegacyView } from './legacyview.js';
import { HQView } from './hq/gameview.js';
import { CameraRig } from './camera.js';
import { CamDock } from './camdock.js';
import { AIService } from './ai.js';
import { Actors } from './actors.js';
import { Game, landmarkDef } from './state.js';
import { UI, ICON, fmtWait } from './ui.js';
import { DecorMode } from './decor.js';
import { CanvasMode } from './canvas.js';
import { CanvasHUD } from './hud.js';
import { RARE, newDiscovery, roll } from './discovery.js';
import { PerfMonitor } from './perf.js';
import { audio } from './audio.js';
import { analytics, ads } from './services.js';
import { TILE, QUALITY, QUALITY_DOWN, RES, RES_NAME, DAILY, HOUR, gfx } from './config.js';
import { GROUND } from './ground.js';
import { MARK_Y } from './tiles.js';
import { toWorld, fromWorld, key } from './hex.js';
import { PAL } from './palette.js';
import { FX } from './fx.js';
import { Sky } from './sky.js';
import { BlockApp, wantBlocks } from './blocks/app.js';

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
    if (!QUALITY[s.settings.quality]) s.settings.quality = 'ultra';
    // v0.4：默认画质改成和样张一致的“极高”；老存档里自动档的“高”也升上来（太卡会自动降回去）
    if (!s.settings.qv4) { s.settings.qv4 = 1; if (s.settings.quality === 'high' && s.settings.autoQuality) s.settings.quality = 'ultra'; }
    // 经营玩法（资源、目标、地块卡）默认关闭：打开游戏就是自由画布
    this.gameplay = qs.has('gameplay') ? qs.get('gameplay') === '1' : !!s.settings.gameplay;
    const qk = this.forceQ || s.settings.quality;
    this.rig = new CameraRig(this.canvas, 1);
    this.view = this.makeView(qk);
    this.rig.free = this.view.kind === 'hq' || !this.gameplay;
    if (this.view.kind === 'hq') {
      this.rig.lookY = 0.45; this.rig.setView({ pitch: 0.62, yaw: -0.45 });
      this.rig.heightAt = (x, z) => this.view.terrain.heightAt(x, z);   // 枢轴贴地、镜头不钻地
      this.rig.onFov = () => this.view.fovChanged?.();
    }
    this.applyCam();
    this.view.onSky = () => { this.ui?.refreshTime(); this.hud?.refreshTime(); };
    this.updateTime();
    this.perf = { t: 0, n: 0, armed: false, low: 0, settle: 0, warned: false };
    this.perfMon = new PerfMonitor(this);
    // 省电：触屏设备上，不操作 8 秒后降到 30 帧（设置里可以关）
    this.lastInput = performance.now();
    for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) addEventListener(ev, () => { this.lastInput = performance.now(); }, { passive: true });
    if (s.settings.powerSave == null) s.settings.powerSave = matchMedia('(pointer: coarse)').matches;
    this.actors = new Actors(this.view.scene, this.view.mat);
    this.actors.noChimney = this.view.kind === 'hq';
    this.actors.setHQ(this.view.kind === 'hq');
    this.actors.walkable = (q, r) => { const t = this.game.tile(q, r); return !!t && t.own && ['meadow', 'home', 'islet', 'harbor'].includes(t.t); };
    this.sel = { slot: -1, cell: null, coupon: false };
    this.mode = 'play'; // play | decor | photo | cut
    this.ai = new AIService(s.settings);   // 大模型接入（设置 → AI）
    this.ui = new UI(this);
    this.camDock = new CamDock(this);
    this.camDock.onToggle = (on) => this.hud?.root.querySelector('[data-a="cam"]')?.classList.toggle('on', on);
    this.decor = new DecorMode(this);
    if (!this.gameplay) { this.canvasMode = new CanvasMode(this); this.hud = new CanvasHUD(this); this.hud.show(false); }
    this.syncAll();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.rig.onTap = (x, y) => this.tap(x, y);
    this.rig.onDoubleTap = (x, y) => this.mode === 'play' && !!this.canvasMode?.focusAt(x, y);
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
    this.boot();
  }
  /** 开局：先显示加载页，把整座岛（地形、植被、海底、海洋生态、动物、着色器）一次性生成并预热，再进标题页。
   *  这样进入画面以后不会再边玩边生成，帧率稳定。 */
  async boot() {
    this.booting = true;
    const t0 = performance.now();
    if (this.view.preload) {
      this.ui.loading(0, '正在生成海岛');
      if (!this.canvasMode) { const g = this.game, lm = g.s.landmarks[0], [cx, cz] = g.s.started ? g.centroid() : toWorld(lm.q, lm.r); this.rig.focus.set(cx, 0, cz); this.rig.update(0); }
      await this.view.preload((p, text) => this.ui.loading(p, text), this.rig.focus, this.rig.target.dist);
      if (this.hud) { this.ui.loading(0.97, '准备界面'); await new Promise((r) => setTimeout(r, 0)); this.hud.prewarm(); }
      this.ui.loading(1, '完成'); await new Promise((r) => setTimeout(r, 200));
      this.ui.loading(null);
    }
    this.loadMs = Math.round(performance.now() - t0);
    analytics.track('load', { ms: this.loadMs, q: this.game.s.settings.quality });
    this.booting = false;
    this.intro();
    this.ready = true;
  }

  /** 高画质画面需要 WebGL2 的浮点深度等能力；建不起来就退回低多边形画面 */
  makeView(qk) {
    if (QUALITY[qk].hq) {
      try { const v = new HQView(this.canvas, gfx(this.game.s.settings, qk)); v.attach(this.rig.cam); return v; }
      catch (e) { console.warn('高画质画面不可用，改用低画质', e); qk = 'low'; this.game.s.settings.quality = 'low'; }
    }
    const v = new LegacyView(this.canvas, qk); v.attach(this.rig.cam); return v;
  }
  tileView(t) { if (t.eco) return { q: t.q, r: t.r, t: t.eco, dir: t.dir, center: t.center, harvested: false }; return { q: t.q, r: t.r, t: t.t, dir: t.dir, center: t.center, harvested: !!(TILE[t.t].harvest && t.ready > this.game.now()) }; }

  // ---------- 同步画面 ----------
  syncAll() {
    if (this.canvasMode) { this.canvasMode.syncAll(); this.actors.clearPeople(); return; }
    const g = this.game, s = g.s;
    this.view.rebuildAll(s.tiles.map((t) => this.tileView(t)));
    this.view.setLand(g.landCells());
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
    if (this.canvasMode) return;
    const g = this.game, now = g.now();
    this.view.markers.setReady(g.readyTiles());
    this.actors.syncBoats(g.s.tiles.filter((t) => t.t === 'harbor').map((t) => ({ q: t.q, r: t.r, dir: t.dir, ready: (t.ready || 0) <= now })));
    this.rig.bounds = g.bounds();
    this.actors.center = g.centroid();
    this.checkCrate();
  }
  checkCrate() {
    if (this.canvasMode) return;
    const g = this.game;
    if (g.s.day.crate !== 'ready' || this.mode === 'cut') { this.actors.hideCrate(); return; }
    // 漂在离镜头最近的岸边
    let best = null, bz = -Infinity;
    for (const k of g.front) { const i = k.indexOf(','), [x, z] = toWorld(+k.slice(0, i), +k.slice(i + 1)); if (z > bz) { bz = z; best = [x, z]; } }
    if (best) this.actors.showCrate(best[0] + 0.2, best[1] + 0.9);
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    // 底部有手牌，把画面整体往上挪一点，让岛的中心落在手牌上方
    this.rig.cam.aspect = w / h; this.rig.portrait = w < h;
    this.rig.cam.setViewOffset(w, h, 0, this.canvasMode ? 0 : Math.round(h * (w < h ? 0.07 : h < 500 ? 0.12 : 0.06)), w, h);
    this.rig.updateFov(true);
    this.view.resize(w, h);
  }
  /** 选画质预设：清掉自定义项。auto=true 是自动降档（保留“自动”） */
  setQuality(k, auto = false) {
    const st = this.game.s.settings;
    st.quality = k; if (!auto) { st.autoQuality = false; st.gfx = {}; }
    // 高画质和低多边形是两套画面，切换时保存后重新载入
    if (!!QUALITY[k].hq !== (this.view.kind === 'hq')) { this.game.save(true); this.ui.toast('正在切换画面…'); setTimeout(() => location.reload(), 300); return; }
    this.game.save();
    if (this.view.kind === 'legacy') { this.view.setQuality(k); this.view.rebuildAll(this.game.s.tiles.map((t) => this.tileView(t))); this.resize(); return; }
    this.applyGfx();
  }
  /** 镜头设置：视野（窄/标准/广）、缩放联动俯角、转动灵敏度 */
  applyCam() {
    const c = (this.game.s.settings.cam ||= { fov: 'std', autoTilt: true, sens: 1 }), r = this.rig;
    r.fovKey = c.fov; r.autoTilt = c.autoTilt !== false; r.sens = c.sens || 1; r.updateFov(true);
  }
  setCam(k, v) { this.game.s.settings.cam = { ...(this.game.s.settings.cam || {}), [k]: v }; this.game.save(); this.applyCam(); }
  /** 岛的中心和半径（预设机位用） */
  islandHome() {
    const tiles = this.canvasMode ? this.canvasMode.s.tiles.map(([q, r]) => toWorld(q, r)) : this.game.s.tiles.filter((t) => t.own).map((t) => toWorld(t.q, t.r));
    if (!tiles.length) return { x: this.rig.focus.x, z: this.rig.focus.z, r: 4 };
    let x = 0, z = 0; for (const [a, b] of tiles) { x += a; z += b; } x /= tiles.length; z /= tiles.length;
    let r = 1; for (const [a, b] of tiles) r = Math.max(r, Math.hypot(a - x, b - z) + 1);
    return { x, z, r };
  }
  /** 改单项画面设置（变成“自定义”） */
  setGfx(key, val) {
    const st = this.game.s.settings; st.gfx = { ...(st.gfx || {}), [key]: val }; st.autoQuality = false;
    if (QUALITY[st.quality]?.[key] === val) delete st.gfx[key];
    this.game.save(); this.applyGfx();
  }
  /** 把当前设置应用到画面；植被或生物数量变了就走加载页重新生成 */
  async applyGfx() {
    if (this.view.kind !== 'hq') return;
    if (this.pace) this.pace.lock30 = false;
    this.perf.settle = 4;
    const regen = this.view.setConfig(gfx(this.game.s.settings));
    this.resize();
    if (regen && !this.booting) {
      this.booting = true; this.ui.loading(0, '按新设置重新生成');
      await this.view.preload((p, t) => this.ui.loading(p, t), this.rig.focus, this.rig.target.dist);
      this.ui.loading(null); this.booting = false;
    }
  }
  async restart() { this.game.reset(); analytics.track('restart'); location.reload(); }

  // ---------- 开场 ----------
  async intro() {
    if (this.canvasMode) return this.introCanvas();
    const g = this.game, s = g.s, lm = s.landmarks[0], [lx, lz] = toWorld(lm.q, lm.r), first = !s.started;
    this.ui.hud(false); this.rig.locked = true;
    if (first) { this.rig.focus.set(lx, 0, lz); this.rig.setView({ dist: 12 }); }
    else { const [cx, cz] = g.centroid(); this.rig.focus.set(cx, 0, cz); this.rig.setView({ dist: 22 }); }
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

  /** 自由画布：标题页之后直接是完整的岛，界面只露出四个角 */
  async introCanvas() {
    this.ui.hud(false); this.rig.locked = true;
    await this.ui.showTitle(!this.game.s.started, true);
    audio.init(); audio.setEnabled(this.game.s.settings.sound); audio.setMusic(this.game.s.settings.music);
    this.game.s.started = true; this.game.save();
    this.rig.locked = false; this.hud.show(true); this.hud.wake();
    setTimeout(() => this.hud.startTutorial(), 1200);
    analytics.track('canvas_start', { tiles: this.canvasMode.s.tiles.length });
    this.perf.armed = true;
  }

  // ---------- 昼夜 ----------
  hourNow() {
    const st = this.game.s.settings;
    if (this.forceHour != null) return this.forceHour;
    return st.timeMode === 'fixed' ? st.fixedHour : Sky.realHour(this.game.now());
  }
  updateTime() { this.view.setHour(this.hourNow()); }
  setTimeMode(mode, hour) {
    const st = this.game.s.settings; st.timeMode = mode; if (hour != null) st.fixedHour = hour;
    this.forceHour = null; this.game.save(); this.updateTime();
    analytics.track('time_mode', { mode, hour: Math.round(st.fixedHour) });
  }
  /** 自动画质：开局后测 4 秒帧率，太低就降一档 */
  /** 当前帧率上限：设置里的 30 / 60；“自动”时默认 60，测出来撑不住就锁 30 */
  fpsCap(idle) {
    const f = this.game.s.settings.fps ?? 'auto';
    if (idle) return 30;
    if (f === 30 || f === '30') return 30;
    if (f === 60 || f === '60') return 60;
    if (f === '120') return 120;
    return this.pace?.lock30 ? 30 : 60;
  }
  /** 自动画质：一直在测。每 5 秒一个窗口，连续两个窗口平均低于 24 帧才降一档（极高 → 高 → 中）；
   *  降档后等 6 秒再测；加载中、演出中、测速中、省电降帧时不算。到了“中”还卡，只提示一次手动换“低”。 */
  autoQuality(dt) {
    const p = this.perf, st = this.game.s.settings;
    if (!p.armed || this.mode === 'cut' || this.perfMon.benching || this.saving || this.view.loading || document.hidden) { p.t = 0; p.n = 0; return; }
    if (p.settle > 0) { p.settle -= dt; return; }
    // 动态分辨率（默认开）：保 60 帧优先——每 2 秒看一次，帧率不够就把渲染精度降一点（最低 60%），连续够了再升回去。
    // 像游戏主机那样用清晰度换流畅，而不是一卡就锁 30 帧
    const v = this.view, cap = this.fpsCap(false);
    if (st.dynres !== false && v.setResScale) {
      p.rt = (p.rt || 0) + dt; p.rn = (p.rn || 0) + 1;
      if (p.rt >= 2) {
        const f2 = p.rn / p.rt, r = v.resScale ?? 1; p.rt = 0; p.rn = 0;
        if (f2 < cap * 0.9 && r > 0.6) { v.setResScale(Math.max(0.6, r - (f2 < cap * 0.7 ? 0.12 : 0.06))); this.resize(); p.settle = 1; p.t = 0; p.n = 0; return; }
        if (f2 >= cap * 0.97 && r < 1) { p.good = (p.good || 0) + 1; if (p.good >= 2) { p.good = 0; v.setResScale(Math.min(1, r + 0.05)); this.resize(); p.settle = 1; p.t = 0; p.n = 0; return; } } else p.good = 0;
      }
    }
    p.t += dt; p.n++;
    if (p.t < 5) return;
    const fps = p.n / p.t; p.t = 0; p.n = 0;
    analytics.track('fps', { fps: Math.round(fps), q: st.quality });
    // 帧节奏：精度已经降到底（或关了动态分辨率）还不到 48 帧，才稳定锁在 30（每帧间隔一致，比 25–50ms 来回跳顺）
    this.pace ||= { lock30: false };
    const floor = st.dynres === false || (v.resScale ?? 1) <= 0.61;
    if (!this.pace.lock30 && floor && fps < 48 && (st.fps ?? 'auto') === 'auto') { this.pace.lock30 = true; p.low = 0; p.settle = 3; return; }
    if (!st.autoQuality || this.forceQ) return;   // 手动选了档位：帧节奏和分辨率照常自动，档位不动
    p.low = fps < 24 ? p.low + 1 : 0;
    if (p.low < 2) return;
    p.low = 0;
    const next = QUALITY_DOWN[st.quality];
    if (next) { this.setQuality(next, true); p.settle = 6; this.ui.toast(`已自动调成${QUALITY[next].label}画质，保证流畅`); }
    else if (fps < 20 && this.view.kind === 'hq' && !p.warned) { p.warned = true; this.ui.toast('画面有点卡，可以在设置里换成「低」画质'); }
  }

  // ---------- 选牌 / 放置 ----------
  clearSel() {
    this.sel.slot = -1; this.sel.cell = null;
    this.view.markers.setFrontier([]); this.view.markers.setGhost(null); this.ui.bubble(null); this.ui.hint('');
  }
  selectCard(i) {
    const g = this.game, s = g.s;
    if (this.canvasMode || this.mode !== 'play') return;
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
    this.view.markers.setFrontier(cells);
    audio.sfx('select'); this.ui.hint('点亮起的格子试放，再点一次确认'); this.ui.refresh();
  }
  toggleCoupon() { this.sel.coupon = !this.sel.coupon && this.game.s.coupons > 0; this.ui.refresh(); }
  place(q, r) {
    const g = this.game, slot = this.sel.slot, useCoupon = !g.slotFree(slot) && (this.sel.coupon || !g.canPlay(slot)) && g.s.coupons > 0;
    const res = g.place(slot, q, r, useCoupon);
    if (!res) { audio.sfx('error'); this.ui.toast('资源不够了'); return; }
    this.clearSel(); this.sel.coupon = false;
    // 稀有生态：草地有机会冒出泉水（第 2 块草地必出，之后有保底）。规则上它仍是草地，外观变成溪流或池塘
    if (res.tile.t === 'meadow') {
      const disc = this.game.s.disc ||= newDiscovery(), coastal = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]].some(([a, b]) => !this.game.tile(q + a, r + b));
      const found = roll(disc, Math.random, { hour: this.view.sky.hour, coastal });
      if (found) { res.tile.eco = found; setTimeout(() => { audio.sfx('landmark'); this.ui.banner('发现新生态 · ' + RARE[found].name, RARE[found].desc, 3000); }, 800); analytics.track('discover', { type: found }); }
    }
    this.view.setTile(this.tileView(res.tile), true);
    this.view.setLand(g.landCells());
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
    if (this.canvasMode) return this.canvasMode.tap(cx, cy);
    const g = this.game, gp = this.rig.ground(cx, cy, 0), cp = this.actors.cratePos;
    if (cp && Math.hypot(gp.x - cp[0], gp.z - cp[1]) < 1.1) return this.openCrate();
    const top = this.rig.ground(cx, cy, GROUND.top);
    let [q, r] = fromWorld(top.x, top.z), tile = g.tile(q, r);
    if (!tile) { [q, r] = fromWorld(gp.x, gp.z); tile = g.tile(q, r); }
    if (this.sel.slot >= 0) {
      const type = g.s.hand[this.sel.slot];
      if (!tile && g.front.has(key(q, r)) && (!TILE[type].coastal || g.harborDir(q, r) >= 0)) {
        if (this.sel.cell && this.sel.cell[0] === q && this.sel.cell[1] === r) return this.place(q, r);
        this.sel.cell = [q, r];
        this.view.markers.setGhost(type, q, r, TILE[type].coastal ? g.harborDir(q, r) : 0);
        audio.sfx('preview'); this.showBubble();
        return;
      }
      if (tile && this.tryHarvest(tile, true)) return;
      if (this.sel.cell) { this.sel.cell = null; this.view.markers.setGhost(null); this.ui.bubble(null); } else { this.clearSel(); this.ui.refresh(); }
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
    const [x, z] = toWorld(tile.q, tile.r), y = this.view.markY(tile.t, tile.q, tile.r) ?? (MARK_Y[tile.t] || 1);
    this.view.setTile(this.tileView(tile));
    this.actors.fx.burst(x, GROUND.y(x, z) + 0.3, z, tile.t === 'forest' ? 0x49a97c : tile.t === 'harbor' ? 0x9fd8ff : 0xf0c24a, 14, 2.4, 0.06, 0.5);
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
    for (const t of this.game.s.tiles) if (t.t === 'islet' && t.lm === next.i) this.view.setTile(this.tileView(t));
    this.view.setLand(this.game.landCells());
    this.actors.addLandmark(next, nd, false);
    await wait(650);
    await this.rig.flyTo(lx, lz, 12.5, 1.5);
    this.actors.activate(lm.i); audio.sfx('landmark');
    this.ui.banner(def.lit, '', 2300);
    await wait(2100);
    const [dx, dz] = this.actors.landmarkDoor(lm.i);
    this.actors.addPerson(def.who, dx, dz, 20 + lm.i);
    this.actors.fx.burst(dx, GROUND.y(dx, dz) + 0.2, dz, 0xffffff, 12, 1.6);
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
    list.forEach((t) => this.view.setTile(this.tileView(t)));
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
    if (this.canvasMode) { this.updateTime(); if ((this._camT = (this._camT || 0) + 1) % 5 === 0) this.canvasMode.rememberCam(); return; }
    const g = this.game, grown = g.tickRegrow();
    if (grown.length) { grown.forEach((t) => this.view.setTile(this.tileView(t))); this.syncDynamic(); }
    this.updateTime();
    if (g.ensureDay()) { this.ui.toast('新的一天：委托和补给箱都刷新了'); this.checkCrate(); this.ui.refresh(); }
  }
  /** 当前画面截图（JPEG dataURL） */
  snapshot() { this.view.render(); return this.canvas.toDataURL('image/jpeg', 0.92); }

  loop(now) {
    // 帧节奏（Frame Pacing）：按时间间隔决定这一帧画不画，60/90/120Hz 的屏幕都一样。
    // 撑不住 60 帧的设备稳定锁在 30 帧（每帧间隔一致，比 25–50ms 来回跳顺）；省电模式空闲时也是 30
    const idle = this.game.s.settings.powerSave && now - this.lastInput > 8000 && this.mode === 'play' && !this.hud?.open && !this.perfMon.benching;
    this.saving = idle;
    const cap = this.fpsCap(idle);
    if (!this.booting && cap && now - (this.lastDraw || 0) < 1000 / cap - 2.5) { requestAnimationFrame((t) => this.loop(t)); return; }
    this.lastDraw = now;
    if (this.booting) { this.last = now; requestAnimationFrame((t) => this.loop(t)); return; }   // 加载页期间不跑主循环（预加载自己控制节奏）
    this.perfMon.begin();
    const raw = now - this.last, dt = Math.min(0.1, raw / 1000); this.last = now;
    this.perfMon.frame(raw);
    FX.uTime.value += dt;
    this.autoQuality(dt);
    this.rig.update(dt); this.actors.update(dt); this.decor.update(dt);
    const f = this.rig.focus;
    this.view.focusY = this.rig.lookY;
    this.view.update(dt, f, this.rig.dist);
    if (this.sel.cell && this.mode === 'play' && !this.canvasMode) { const [x, z] = toWorld(this.sel.cell[0], this.sel.cell[1]), [sx, sy] = this.rig.project(x, 1.5, z); this.ui.bubble(undefined, sx, sy); }
    this.acc += dt; if (this.acc >= 1) { this.acc = 0; this.tick(); }
    this.view.render();
    requestAnimationFrame((t) => this.loop(t));
  }
}

function start() { try { window.__game = wantBlocks() ? new BlockApp() : new App(); } catch (e) { console.error(e); const d = document.createElement('p'); d.style.cssText = 'position:absolute;inset:auto 16px 16px;color:#17313b;background:#fffaf0;padding:12px;border-radius:12px'; d.textContent = '游戏启动失败：' + (e.message || e) + '。请换一个支持 WebGL 的浏览器再试。'; document.getElementById('app').appendChild(d); } }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
