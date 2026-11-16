// 游戏状态与规则。不依赖渲染：界面和画面通过事件订阅变化。
import { TILE, BASE_CARDS, START, SCRIPT_DECK, PRICE_STEP_EVERY, PRICE_STEP_MAX, CAP_PER_LANDMARK, LANDMARKS, TRAVELER_NAMES, TRAVELER_SHIRTS,
  FIRST_LANDMARK_DIST, LANDMARK_STEP, DAILY, ORDER_LINES, GOALS, HOUR, DAY_RESET_HOUR, RES, SAVE_KEY } from './config.js';
import { key, DIRS, hexDist, toWorld, fromWorld, disk, SQ3 } from './hex.js';
import { mulberry32, hash3 } from './geo.js';
import { store, analytics } from './services.js';

export const DEFAULT_SETTINGS = { sound: true, music: true, quality: 'ultra', autoQuality: true, timeMode: 'real', fixedHour: 15, gameplay: false };

export function landmarkDef(i) {
  if (i < LANDMARKS.length) return LANDMARKS[i];
  const b = LANDMARKS[i % LANDMARKS.length];
  return { type: b.type, name: '远方的' + b.name, lit: b.lit, unlock: null,
    who: { name: TRAVELER_NAMES[(i - LANDMARKS.length) % TRAVELER_NAMES.length], role: '旅人', shirt: TRAVELER_SHIRTS[i % TRAVELER_SHIRTS.length], hat: ['straw', 'cap', 'none'][i % 3], hatColor: b.who.hatColor } };
}

export class Game {
  constructor() { this.h = {}; this.s = null; this.map = new Map(); this.reserved = new Set(); this.front = new Set(); this._saveT = 0; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); }
  emit(ev, d) { (this.h[ev] || []).forEach((f) => f(d)); }
  now() { return Date.now() + (this.s?.skew || 0); }

  // ---------- 开局 / 存档 ----------
  newGame() {
    const seed = (Math.random() * 2 ** 31) | 0;
    this.s = {
      v: 1, seed, t0: Date.now(), lastSeen: Date.now(), skew: 0,
      tiles: START.tiles.map(([q, r, t]) => ({ q, r, t, own: true, ...(TILE[t].harvest ? { ready: 0 } : {}) })),
      res: { ...START.res }, caps: { ...START.caps }, coupons: 0,
      hand: SCRIPT_DECK.slice(0, 3), deck: 3, freeSlot: -1,
      unlocked: [...BASE_CARDS], placed: 0,
      stats: { harvest: {}, harvestTotal: 0, orders: 0, decor: 0, forestPair: 0, ordersSeen: 0, maxWood: START.res.wood },
      done: [], extra: [], extraSeq: 0,
      landmarks: [], companions: [],
      day: { stamp: '', freeRefresh: 0, adRefresh: 0, adRegrow: 0, crate: 'none', orders: [] },
      decor: [], settings: { ...DEFAULT_SETTINGS }, started: false,
    };
    this._index();
    this._genLandmark(0);
    this._index();
    this.ensureDay(true);
    this.fillGoals();
    analytics.track('new_game');
    this.save(true);
  }
  load() {
    try {
      const raw = store.get(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (!s || s.v !== 1 || !Array.isArray(s.tiles)) return false;
      this.s = s;
      s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
      this._index();
      this.away = Math.max(0, this.now() - (s.lastSeen || this.now()));
      this.ensureDay();
      this.fillGoals();
      return true;
    } catch { return false; }
  }
  save(now) {
    if (!this.s) return;
    clearTimeout(this._saveT);
    const write = () => { this.s.lastSeen = this.now(); store.set(SAVE_KEY, JSON.stringify(this.s)); };
    if (now) write(); else this._saveT = setTimeout(write, 400);
  }
  reset() { store.del(SAVE_KEY); }

  _index() {
    this.map.clear(); this.reserved.clear(); this.front.clear();
    for (const t of this.s.tiles) this.map.set(key(t.q, t.r), t);
    for (const t of this.s.tiles) if (t.t === 'harbor') this.reserved.add(key(t.q + DIRS[t.dir][0], t.r + DIRS[t.dir][1]));
    for (const t of this.s.tiles) {
      if (!t.own) continue;
      for (const d of DIRS) { const k = key(t.q + d[0], t.r + d[1]); if (!this.map.has(k) && !this.reserved.has(k)) this.front.add(k); }
    }
  }
  tile(q, r) { return this.map.get(key(q, r)); }
  get owned() { return this.s.tiles.filter((t) => t.own); }
  get ownCount() { let n = 0; for (const t of this.s.tiles) if (t.own) n++; return n; }
  countType(type) { let n = 0; for (const t of this.s.tiles) if (t.own && t.t === type) n++; return n; }
  landCells() { return this.s.tiles.map((t) => [t.q, t.r]); }
  bounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const t of this.s.tiles) { const [x, z] = toWorld(t.q, t.r); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    return { minX: minX - 14, maxX: maxX + 14, minZ: minZ - 14, maxZ: maxZ + 14 };
  }
  centroid() { let x = 0, z = 0, n = 0; for (const t of this.s.tiles) if (t.own) { const w = toWorld(t.q, t.r); x += w[0]; z += w[1]; n++; } return [x / n, z / n]; }

  // ---------- 经济 ----------
  priceTier() { return Math.min(PRICE_STEP_MAX, Math.floor(this.s.placed / PRICE_STEP_EVERY)); }
  cost(type) { const c = { ...TILE[type].cost }, k = Object.keys(c)[0]; c[k] += this.priceTier(); return c; }
  canPay(c) { return RES.every((r) => (c[r] || 0) <= this.s.res[r]); }
  slotFree(i) { return this.s.freeSlot === i; }
  canPlay(i) { return this.slotFree(i) || this.canPay(this.cost(this.s.hand[i])); }
  addRes(g) {
    const got = {};
    for (const r of RES) if (g[r]) { const v = Math.min(this.s.caps[r], this.s.res[r] + g[r]) - this.s.res[r]; this.s.res[r] += v; got[r] = v; }
    if (g.coupon) { this.s.coupons += g.coupon; got.coupon = g.coupon; }
    this.s.stats.maxWood = Math.max(this.s.stats.maxWood, this.s.res.wood);
    return got;
  }
  readyTiles() { const n = this.now(); return this.s.tiles.filter((t) => t.own && TILE[t.t].harvest && (t.ready || 0) <= n); }
  /** 资源不够买任何手牌、又没有东西可收时，潮水送一张免费地块 */
  updateGift() {
    const s = this.s;
    if (s.freeSlot >= 0) return;
    if (s.coupons > 0 || s.hand.some((_, i) => this.canPay(this.cost(s.hand[i]))) || this.readyTiles().length) return;
    let best = 0, bv = Infinity;
    s.hand.forEach((t, i) => { const c = this.cost(t), v = RES.reduce((a, r) => a + (c[r] || 0), 0); if (v < bv && (!TILE[t].coastal || this.cells(t).length)) { bv = v; best = i; } });
    s.freeSlot = best;
    analytics.track('gift_card', { ...s.res });
    this.emit('gift', best);
  }

  // ---------- 放置 ----------
  /** 某种地块可以放的格子 */
  cells(type) {
    const out = [];
    for (const k of this.front) {
      const i = k.indexOf(','), q = +k.slice(0, i), r = +k.slice(i + 1);
      if (TILE[type].coastal && this.harborDir(q, r) < 0) continue;
      out.push([q, r]);
    }
    return out;
  }
  /** 渔港栈桥朝向：选一个朝外的空海格 */
  harborDir(q, r) {
    let best = -1, bv = 99;
    DIRS.forEach((d, i) => {
      const nq = q + d[0], nr = r + d[1], k = key(nq, nr);
      if (this.map.has(k) || this.reserved.has(k)) return;
      let land = 0;
      for (const e of DIRS) if (this.map.has(key(nq + e[0], nr + e[1]))) land++;
      if (land < bv) { bv = land; best = i; }
    });
    return best;
  }
  /** 预估放在 (q,r) 能得到什么 */
  preview(type, q, r) {
    const def = TILE[type], res = Object.keys(def.gain)[0], base = def.gain[res];
    let adj = 0;
    if (def.adj) for (const d of DIRS) { const t = this.tile(q + d[0], r + d[1]); if (t && def.adj.types.includes(t.t)) adj += def.adj.per; }
    return { res, base, adj, total: base + adj };
  }
  place(slot, q, r, useCoupon = false) {
    const s = this.s, type = s.hand[slot], k = key(q, r);
    if (!type || !this.front.has(k)) return null;
    const free = this.slotFree(slot), cost = this.cost(type);
    let dir;
    if (TILE[type].coastal) { dir = this.harborDir(q, r); if (dir < 0) return null; }
    if (!free) {
      if (useCoupon && s.coupons > 0) s.coupons--;
      else if (this.canPay(cost)) for (const rk of RES) s.res[rk] -= cost[rk] || 0;
      else return null;
    }
    const pv = this.preview(type, q, r);
    const tile = { q, r, t: type, own: true, ...(TILE[type].harvest ? { ready: 0 } : {}), ...(dir != null ? { dir } : {}) };
    s.tiles.push(tile);
    s.placed++;
    if (free) s.freeSlot = -1;
    if (type === 'forest' && pv.adj > 0) s.stats.forestPair++;
    const got = this.addRes({ [pv.res]: pv.total });
    // 补牌
    s.hand[slot] = this.draw();
    // 是否接通了地标小岛
    let reached = null;
    for (const d of DIRS) { const n = this.tile(q + d[0], r + d[1]); if (n && n.t === 'islet' && !n.own) { reached = n.lm; break; } }
    this._index();
    analytics.track('place', { type, free: free ? 1 : 0, coupon: useCoupon ? 1 : 0, gain: pv.total, tiles: this.ownCount });
    if (s.placed === 1) analytics.track('funnel_first_place', { sec: Math.round((Date.now() - s.t0) / 1000) });
    const res = { tile, got, pv, wasted: pv.total - (got[pv.res] || 0), reached };
    if (reached != null) res.landmark = this.reach(reached);
    this.updateGift();
    res.goals = this.checkGoals();
    this.save();
    this.emit('change');
    return res;
  }
  draw() {
    const s = this.s, i = s.deck++;
    if (i < SCRIPT_DECK.length) return SCRIPT_DECK[i];
    const rng = mulberry32(hash3(s.seed, i, 99));
    const pool = s.unlocked, total = pool.reduce((a, t) => a + TILE[t].weight, 0);
    let x = rng() * total;
    for (const t of pool) { x -= TILE[t].weight; if (x <= 0) return t; }
    return pool[0];
  }
  refreshHand() {
    const s = this.s;
    s.hand = s.hand.map(() => this.draw());
    s.freeSlot = -1;
    this.updateGift(); this.save(); this.emit('change');
  }

  // ---------- 收获 ----------
  harvest(q, r) {
    const t = this.tile(q, r), def = t && TILE[t.t].harvest;
    if (!t || !t.own || !def) return null;
    const now = this.now();
    if ((t.ready || 0) > now) return { wait: t.ready - now, tile: t };
    const got = this.addRes({ [def.res]: def.amount });
    t.ready = now + def.hours * HOUR;
    const st = this.s.stats;
    st.harvest[t.t] = (st.harvest[t.t] || 0) + 1; st.harvestTotal++;
    analytics.track('harvest', { type: t.t, gain: got[def.res] || 0 });
    const goals = this.checkGoals();
    this.updateGift(); this.save(); this.emit('change');
    return { tile: t, got, res: def.res, amount: def.amount, goals };
  }
  /** 把已到时间的地块标记为长好，返回它们 */
  tickRegrow() {
    const now = this.now(), out = [];
    for (const t of this.s.tiles) if (t.ready && t.ready <= now) { t.ready = 0; out.push(t); }
    if (out.length) { this.save(); this.emit('change'); }
    return out;
  }
  regrowAll() { const out = []; for (const t of this.s.tiles) if (t.ready) { t.ready = 0; out.push(t); } this.save(); this.emit('change'); return out; }
  growing() { const n = this.now(); return this.s.tiles.filter((t) => t.ready && t.ready > n); }

  // ---------- 地标 ----------
  _genLandmark(i) {
    const s = this.s, rng = mulberry32(hash3(s.seed, i, 555));
    let bx = 0, bz = 0, dist = FIRST_LANDMARK_DIST, ang = rng() * Math.PI * 2;
    if (i > 0) {
      const p = s.landmarks[i - 1], [cx, cz] = this.centroid();
      [bx, bz] = toWorld(p.q, p.r);
      ang = Math.atan2(bz - cz, bx - cx) + (rng() * 2 - 1) * 1.2;
      dist = LANDMARK_STEP[0] + Math.floor(rng() * (LANDMARK_STEP[1] - LANDMARK_STEP[0] + 1));
    } else ang = -0.35 + (rng() * 2 - 1) * 0.5; // 第一座放在开场镜头的右上方，一眼能看到
    // 反复尝试，直到小岛周围是空海，并且和已有陆地之间隔足够的海面（第一座 6 格，之后 7 格）
    const gapMin = i === 0 ? 6 : 7;
    let q = 0, r = 0, cells = [];
    const d0 = Math.floor(rng() * 6);
    for (let n = 0; n < 120; n++) {
      [q, r] = fromWorld(bx + Math.cos(ang) * dist * SQ3, bz + Math.sin(ang) * dist * SQ3);
      cells = [[q, r], [q + DIRS[d0][0], r + DIRS[d0][1]], [q + DIRS[(d0 + 1) % 6][0], r + DIRS[(d0 + 1) % 6][1]]];
      const clear = disk(q, r, 3).every(([a, b]) => !this.map.has(key(a, b)) && !this.reserved.has(key(a, b)));
      let gap = 99;
      for (const t of s.tiles) if (t.own) for (const c of cells) gap = Math.min(gap, hexDist(t.q, t.r, c[0], c[1]) - 1);
      if (clear && gap >= gapMin) break;
      if (gap < gapMin) dist += 1; else { ang += 0.55; if (n % 4 === 3) dist += 1; }
    }
    s.landmarks.push({ i, q, r, reached: false });
    cells.forEach(([a, b], j) => { const t = { q: a, r: b, t: 'islet', lm: i, own: false, ...(j === 0 ? { center: true } : {}) }; s.tiles.push(t); this.map.set(key(a, b), t); });
    return s.landmarks[i];
  }
  /** 当前要去的地标（最近一座未接通的） */
  nextLandmark() { return this.s.landmarks.find((l) => !l.reached); }
  distToLandmark(lm) {
    if (!lm) return 99;
    const cells = this.s.tiles.filter((t) => t.t === 'islet' && t.lm === lm.i);
    let best = 99;
    for (const t of this.s.tiles) if (t.own) for (const c of cells) best = Math.min(best, hexDist(t.q, t.r, c.q, c.r));
    return best - 1; // 中间隔着的海格数
  }
  reach(i) {
    const s = this.s, lm = s.landmarks[i], def = landmarkDef(i);
    lm.reached = true; lm.at = this.now();
    for (const t of s.tiles) if (t.t === 'islet' && t.lm === i) t.own = true;
    s.companions.push({ ...def.who, lm: i });
    if (def.unlock && !s.unlocked.includes(def.unlock)) { s.unlocked.push(def.unlock); s.hand[(s.deck + i) % 3] = def.unlock; }
    for (const r of RES) s.caps[r] += CAP_PER_LANDMARK;
    const bonus = i >= 2 ? { coupon: 2 } : {};
    this.addRes(bonus);
    const next = this._genLandmark(i + 1);
    this._index();
    if (!s.day.orders.length) this._genOrders();
    analytics.track('landmark', { i, sec: Math.round((Date.now() - s.t0) / 1000), placed: s.placed });
    return { i, lm, def, next, bonus };
  }

  // ---------- 每日内容 ----------
  dayStamp() { const d = new Date(this.now() - DAY_RESET_HOUR * HOUR); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  ensureDay(first) {
    const s = this.s, stamp = this.dayStamp();
    if (s.day.stamp === stamp) return false;
    const wasEmpty = !s.day.stamp;
    s.day = { stamp, freeRefresh: 0, adRefresh: 0, adRegrow: 0, crate: first || wasEmpty ? 'none' : 'ready', orders: [] };
    if (s.companions.length) this._genOrders();
    if (!first) { analytics.track('new_day', { tiles: this.ownCount }); this.save(); this.emit('change'); }
    return true;
  }
  _genOrders() {
    const s = this.s, rng = mulberry32(hash3(s.seed, s.stats.orders * 31 + s.day.stamp.length, hashStr(s.day.stamp)));
    s.day.orders = [];
    for (let i = 0; i < DAILY.orders; i++) {
      const res = RES[(i + Math.floor(rng() * 3)) % 3], need = res === 'stone' ? 4 + Math.floor(rng() * 5) : DAILY.orderNeed[0] + Math.floor(rng() * (DAILY.orderNeed[1] - DAILY.orderNeed[0] + 1));
      const who = Math.floor(rng() * s.companions.length), lines = ORDER_LINES[res];
      const other = RES.filter((x) => x !== res)[Math.floor(rng() * 2)];
      const reward = i === 0 || rng() < 0.4 ? { coupon: 1 } : { [other]: other === 'stone' ? 5 : DAILY.orderRewardRes };
      s.day.orders.push({ id: i, who, res, need, reward, line: lines[Math.floor(rng() * lines.length)].replace('{n}', need), done: false });
    }
  }
  deliver(id, double = false) {
    const s = this.s, o = s.day.orders.find((x) => x.id === id);
    if (!o || o.done || s.res[o.res] < o.need) return null;
    s.res[o.res] -= o.need; o.done = true; s.stats.orders++;
    const rw = { ...o.reward };
    if (double) for (const k in rw) rw[k] *= 2;
    const got = this.addRes(rw);
    analytics.track('order_done', { id, double: double ? 1 : 0 });
    const goals = this.checkGoals();
    this.updateGift(); this.save(); this.emit('change');
    return { got, goals };
  }
  openCrate() {
    if (this.s.day.crate !== 'ready') return null;
    this.s.day.crate = 'opened';
    const got = this.addRes(DAILY.crate);
    analytics.track('crate');
    this.save(); this.emit('change');
    return got;
  }

  // ---------- 目标 ----------
  goalDef(id) { return GOALS.find((g) => g.id === id) || this.s.extra.find((g) => g.id === id); }
  progress(g) {
    const s = this.s, st = s.stats;
    switch (g.kind || g.id) {
      case 'place1': return s.placed;
      case 'harvestForest': return st.harvest.forest || 0;
      case 'forestPair': return st.forestPair;
      case 'wood12': return st.maxWood;
      case 'mountain': return this.countType('mountain');
      case 'garden': return this.countType('garden');
      case 'harvestGarden': return st.harvest.garden || 0;
      case 'near': return s.landmarks[0].reached || this.distToLandmark(s.landmarks[0]) <= 2 ? 1 : 0;
      case 'size12': case 'size': return this.ownCount;
      case 'reach0': return s.landmarks[0].reached ? 1 : 0;
      case 'orders': return st.ordersSeen;
      case 'wheat': return this.countType('wheat');
      case 'reach': return s.landmarks[g.lm]?.reached ? 1 : 0;
      case 'harvest': return st.harvestTotal;
      case 'deliver': return st.orders;
      case 'decor': return st.decor;
      default: return 0;
    }
  }
  /** 当前显示的 3 个目标 */
  activeGoals() {
    const main = GOALS.filter((g) => !this.s.done.includes(g.id)).slice(0, 3);
    return main.concat(this.s.extra.slice(0, 3 - main.length));
  }
  /** 主线做完后，不断生成新的长期目标，地图有多大目标就有多远 */
  fillGoals() {
    const s = this.s, mainLeft = GOALS.filter((g) => !s.done.includes(g.id)).length;
    const kinds = ['reach', 'size', 'harvest', 'deliver', 'decor'];
    let guard = 0;
    while (mainLeft + s.extra.length < 3 && guard++ < 10) {
      const kind = kinds.find((k) => !s.extra.some((g) => g.kind === k) && !(k === 'decor' && s.stats.decor > 0) && !(k === 'reach' && !this.nextLandmark()));
      if (!kind) break;
      const id = 'x' + s.extraSeq++;
      if (kind === 'reach') { const lm = this.nextLandmark(), d = landmarkDef(lm.i); s.extra.push({ id, kind, lm: lm.i, max: 1, title: '接通' + d.name + '小岛', desc: '顺着海面找到它，把地铺过去', reward: { coupon: 2 } }); }
      if (kind === 'size') { const n = Math.ceil((this.ownCount + 6) / 10) * 10; s.extra.push({ id, kind, max: n, title: `小岛达到 ${n} 块地`, desc: '', reward: { wood: 4, food: 4 } }); }
      if (kind === 'harvest') { const n = s.stats.harvestTotal + 8; s.extra.push({ id, kind, max: n, title: `累计收获 ${n} 次`, desc: '森林、菜园、麦田、渔港都算', reward: { stone: 3 } }); }
      if (kind === 'deliver') { const n = s.stats.orders + 3; s.extra.push({ id, kind, max: n, title: `累计完成 ${n} 个委托`, desc: '', reward: { coupon: 1 } }); }
      if (kind === 'decor') s.extra.push({ id, kind, max: 1, title: '摆一件装饰', desc: '点右侧的「装饰」', reward: { food: 3 } });
    }
  }
  checkGoals() {
    const s = this.s, out = [];
    for (let guard = 0; guard < 12; guard++) {
      const g = this.activeGoals().find((x) => this.progress(x) >= x.max);
      if (!g) break;
      if (GOALS.includes(g)) s.done.push(g.id); else s.extra.splice(s.extra.indexOf(g), 1);
      const got = this.addRes(g.reward || {});
      out.push({ g, got });
      analytics.track('goal', { id: g.kind || g.id, sec: Math.round((Date.now() - s.t0) / 1000) });
      if (g.id === 'mountain' && s.day.crate === 'none') s.day.crate = 'ready';
      this.fillGoals();
    }
    if (out.length) { this.save(); this.emit('change'); }
    return out;
  }

  // ---------- 装饰 ----------
  addDecor(d) { this.s.decor.push(d); this.s.stats.decor++; analytics.track('decor_place', { asset: d.a }); const goals = this.checkGoals(); this.save(); return goals; }
  removeDecor(d) { const i = this.s.decor.indexOf(d); if (i >= 0) this.s.decor.splice(i, 1); this.save(); }
}

function hashStr(str) { let h = 7; for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0; return h; }
