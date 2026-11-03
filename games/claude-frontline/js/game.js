/* RTS 战斗引擎 */
(function () {
  const CF = window.CF;
  const CELL = 40, TICK = 1 / 30;
  const TAU = Math.PI * 2;

  // ---------- 建筑 ----------
  const BT = {
    core: { name: '主脑', hp: 2200, r: 46, desc: 'Claude 的主脑。被摧毁即失败。每秒产出晶片与算力，自带防御脉冲。', atk: { range: 210, dmg: 12, rate: 0.8, air: true } },
    miner: { name: '矿机', key: '1', cost: { chip: 50 }, hp: 260, r: 22, build: 4, desc: '必须建在晶片矿或语料泉上，每秒采集 3 单位资源。', yield: 3 },
    turret: { name: '炮塔', key: '2', cost: { chip: 80, corp: 20 }, hp: 450, r: 20, build: 5, desc: '对地对空的自动防御。附近有雷达站时射程 +20%。', atk: { range: 230, dmg: 16, rate: 0.7, air: true } },
    barrier: { name: '屏障', key: '3', cost: { chip: 30 }, hp: 1000, r: 19, build: 2, desc: '高耐久的墙，乱码军团会绕行或被迫攻击它。' },
    repair: { name: '修复站', key: '4', cost: { chip: 60, corp: 40 }, hp: 380, r: 22, build: 5, desc: '每秒为 200 范围内的友军单位与建筑恢复耐久。', heal: { range: 200, amt: 14 } },
    radar: { name: '雷达站', key: '5', cost: { chip: 70, corp: 40 }, hp: 320, r: 22, build: 6, desc: '大幅扩展建造范围，附近炮塔射程 +20%，并提前预警敌军来向。' },
    workshop: { name: 'Agent 工坊', key: '6', cost: { chip: 100, corp: 60 }, hp: 750, r: 30, build: 7, desc: '训练地面 Agent。右键地面设置集结点。', trains: ['scout', 'coder', 'refactor'] },
    port: { name: '无人机空港', key: '7', cost: { chip: 120, corp: 60, comp: 30 }, hp: 650, r: 30, build: 8, desc: '训练无人机。空中单位无视断崖地形。', trains: ['interceptor', 'bomber'] },
    ctx: { name: '上下文节点', hp: 1500, r: 26, desc: '保存关键记忆的节点。4 秒未受攻击会自我修复，也能被修复站与「灵感和弦」修复。' },
    gcore: { name: '乱码主脑', hp: 5000, r: 52, desc: '乱码军团的核心，源源不断地制造混乱。', atk: { range: 250, dmg: 20, rate: 1, air: true } },
    gtower: { name: '噪声塔', hp: 650, r: 20, desc: '乱码军团的防御塔。', atk: { range: 220, dmg: 14, rate: 0.8, air: true } },
  };
  const BUILD_ORDER = ['miner', 'turret', 'barrier', 'repair', 'radar', 'workshop', 'port'];

  // ---------- 单位 ----------
  const UT = {
    claude: { name: 'Claude', hp: 650, r: 17, speed: 100, atk: { range: 160, dmg: 20, rate: 0.6, air: true }, desc: '英雄。R「弦振冲击」范围伤害并击退；E「灵感和弦」治疗并激励友军。阵亡 20 秒后在主脑重生。' },
    scout: { name: '侦察 Agent', cost: { corp: 40 }, hp: 130, r: 9, speed: 155, time: 4, atk: { range: 120, dmg: 6, rate: 0.5, air: true }, desc: '速度快、造价低，适合侦察与骚扰。' },
    coder: { name: '编码 Agent', cost: { chip: 50, corp: 30 }, hp: 230, r: 11, speed: 92, time: 6, atk: { range: 170, dmg: 12, rate: 0.75, air: true }, desc: '主力步兵，对地对空。' },
    refactor: { name: '重构 Agent', cost: { chip: 90, corp: 60, comp: 20 }, hp: 650, r: 15, speed: 66, time: 9, atk: { range: 145, dmg: 34, rate: 1.4, splash: 55 }, desc: '重装单位，溅射伤害，适合攻坚。不能对空。' },
    interceptor: { name: '拦截无人机', cost: { chip: 70, corp: 40, comp: 20 }, hp: 190, r: 11, speed: 165, time: 6, air: true, atk: { range: 165, dmg: 10, rate: 0.4, air: true, vsAir: 2 }, desc: '高速空中单位，对空伤害翻倍。' },
    bomber: { name: '轰炸无人机', cost: { chip: 110, corp: 50, comp: 40 }, hp: 320, r: 14, speed: 100, time: 9, air: true, atk: { range: 70, dmg: 60, rate: 2, splash: 75, ground: true }, desc: '空中轰炸，溅射伤害，只能攻击地面。' },
    proto: { name: '原型机', hp: 2600, r: 20, speed: 32, noAtk: true, desc: '具身智能原型机。附近有友军时才会沿路线前进。' },
    bug: { name: '乱码虫', hp: 70, r: 9, speed: 110, atk: { range: 18, dmg: 8, rate: 0.6, melee: true }, bounty: { chip: 4 } },
    noise: { name: '噪声兵', hp: 150, r: 11, speed: 70, atk: { range: 150, dmg: 10, rate: 1, air: true }, bounty: { chip: 6, corp: 3 } },
    titan: { name: '幻觉巨像', hp: 950, r: 21, speed: 44, atk: { range: 32, dmg: 45, rate: 1.5, melee: true, splash: 45 }, bounty: { chip: 30, corp: 15 } },
    bat: { name: '乱码蝠', hp: 110, r: 10, speed: 140, air: true, atk: { range: 90, dmg: 9, rate: 0.7, air: true }, bounty: { chip: 6 } },
    forget: { name: '遗忘者', hp: 3200, r: 30, speed: 42, boss: true, atk: { range: 60, dmg: 55, rate: 1.2, splash: 60, melee: true }, bounty: { chip: 200, corp: 100 } },
    carrier: { name: '过拟合空母', hp: 3600, r: 36, speed: 36, boss: true, air: true, atk: { range: 210, dmg: 22, rate: 0.5, air: true }, bounty: { chip: 200, corp: 100, comp: 50 } },
    entropy: { name: '熵之王', hp: 6500, r: 36, speed: 36, boss: true, atk: { range: 180, dmg: 40, rate: 0.9, splash: 50, air: true }, bounty: { chip: 300 } },
  };
  const TRAIN_KEY = { scout: 'Z', coder: 'X', refactor: 'V', interceptor: 'Z', bomber: 'X' };

  // ---------- 小工具 ----------
  const COLS = { chip: '#e9b949', corp: '#3fd0c9', comp: '#9b7bff', me: '#d97757', foe: '#ff4f9a', foe2: '#29e0e0' };
  const GLYPH = '#%&@$?!¥§¤∆≠≈';
  const canPay = (res, cost) => Object.keys(cost || {}).every((k) => res[k] >= cost[k]);
  const pay = (res, cost) => Object.keys(cost || {}).forEach((k) => (res[k] -= cost[k]));
  const costHtml = (cost) => Object.keys(cost || {}).map((k) => `<span class="c-${k === 'chip' ? 'chip' : k === 'corp' ? 'corp' : 'comp'}">${cost[k]}</span>`).join('');

  class Game {
    constructor(L) {
      const g = this;
      g.L = L; g.W = L.w; g.H = L.h;
      g.time = 0; g.speed = 1; g.paused = false; g.over = false; g.acc = 0;
      g.bonus = CF.P.battleBonus();
      g.res = { chip: 200 + g.bonus.chips, corp: 120 + g.bonus.corp, comp: 40 + g.bonus.comp };
      g.rate = { chip: 0, corp: 0, comp: 0 };
      g.ents = []; g.nid = 1; g.proj = []; g.fx = []; g.parts = [];
      g.sel = []; g.build = null; g.amove = false; g.boxMode = false;
      g.wave = 0; g.waveTimer = L.first; g.spawnQ = []; g.spawnCd = 0; g.waveTag = '';
      g.boss = null; g.bossDone = new Set(); g.bossHalf = false;
      g.stats = { kills: 0, lost: 0, built: 0, trained: 0, gathered: { chip: 0, corp: 0, comp: 0 }, army: [], waves: [], riffs: 0 };
      g.lostAir = 0; g.protoArrived = false; g.researchCd = 20; g.heroRespawn = 0;
      g.scriptI = 0; g.ambushI = 0; g.shake = 0; g.beat = 0;
      g.cam = { x: 0, y: 0, z: 1 };
      // 导航网格
      g.cols = Math.ceil(g.W / CELL); g.rows = Math.ceil(g.H / CELL);
      g.block = new Uint8Array(g.cols * g.rows);
      (L.cliffs || []).forEach(([x, y, w, h]) => {
        for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) {
          const px = cx * CELL + CELL / 2, py = cy * CELL + CELL / 2;
          if (px >= x && px <= x + w && py >= y && py <= y + h) g.block[cy * g.cols + cx] = 1;
        }
      });
      g.nodes = (L.nodes || []).map(([type, x, y]) => ({ type, x, y, r: 30, miner: null }));
      // 初始实体
      g.core = g.addB('core', 0, L.core[0], L.core[1], true);
      g.hero = g.addU('claude', 0, L.hero[0], L.hero[1]);
      g.hero.maxHp = g.hero.hp = Math.round(UT.claude.hp * g.bonus.heroHp);
      g.hero.cd = { riff: 0, chord: 0 };
      (L.ctx || []).forEach(([x, y]) => g.addB('ctx', 0, x, y, true));
      (L.prebuilt || []).forEach(([t, x, y]) => g.addB(t, 0, x, y, true));
      (L.startUnits || []).forEach(([t, x, y]) => g.addU(t, 0, x, y));
      if (L.proto) { g.proto = g.addU('proto', 0, L.proto[0], L.proto[1]); g.proto.wp = 0; }
      (L.towers || []).forEach(([x, y]) => g.addB('gtower', 1, x, y, true));
      if (L.gcore) g.gcore = g.addB('gcore', 1, L.gcore[0], L.gcore[1], true);
      if (L.hpMul) g.ents.filter((e) => e.team === 1).forEach((e) => { e.maxHp = e.hp = Math.round(e.hp * L.hpMul); });
      g.flowDirty = true; g.flowT = 0;
      g.beatSink = { pulse: (s, strum) => { g.beat = Math.max(g.beat, s); if (strum) g.strum = 0.25; }, visible: () => false };
      CF.PixelFX.Stage.all.add(g.beatSink);
      g.prerender();
      g.sample();
    }
    destroy() { CF.PixelFX.Stage.all.delete(this.beatSink); }

    // ---------- 实体 ----------
    addB(type, team, x, y, done) {
      const d = BT[type];
      const e = { id: this.nid++, kind: 'b', type, team, x, y, r: d.r, def: d, maxHp: d.hp, hp: done ? d.hp : d.hp * 0.1, done, prog: done ? 1 : 0, queue: [], atkCd: 0, ang: 0, hit: 0, healCd: 0, spawnCd: 0 };
      if (type === 'miner') { const n = this.nodeAt(x, y); if (n) { n.miner = e; e.node = n; e.x = n.x; e.y = n.y; } }
      e.rally = { x: x + 70, y: y + 30 };
      this.ents.push(e); this.flowDirty = true;
      return e;
    }
    addU(type, team, x, y) {
      const d = UT[type];
      const e = { id: this.nid++, kind: 'u', type, team, x, y, r: d.r, def: d, maxHp: d.hp, hp: d.hp, air: !!d.air, vx: 0, vy: 0, atkCd: Math.random() * 0.5, hit: 0, order: { t: 'idle' }, path: null, tgt: null, face: 1, scan: Math.random() * 0.3, buff: 0, step: 0 };
      e.guard = { x, y };
      this.ents.push(e);
      return e;
    }
    get(id) { return this.ents.find((e) => e.id === id && !e.dead); }
    count(type, doneOnly) { return this.ents.filter((e) => e.type === type && !e.dead && e.team === 0 && (!doneOnly || e.done !== false)).length; }
    coreHpPct() { return this.core.dead ? 0 : this.core.hp / this.core.maxHp; }
    protoHpPct() { return this.proto && !this.proto.dead ? this.proto.hp / this.proto.maxHp : 0; }
    bossKilled(t) { return this.bossDone.has(t); }
    foeCoreDead() { return this.gcore ? !!this.gcore.dead : false; }
    wavesCleared() { const n = (this.L.waves || []).length; return !this.L.endless && this.wave >= n && !this.spawnQ.length && !this.ents.some((e) => e.team === 1 && e.kind === 'u' && !e.dead); }
    nodeAt(x, y) { return this.nodes.find((n) => CF.dist(n.x, n.y, x, y) < 34); }

    // ---------- 导航 ----------
    cellOf(x, y) { return [CF.clamp(Math.floor(x / CELL), 0, this.cols - 1), CF.clamp(Math.floor(y / CELL), 0, this.rows - 1)]; }
    walk(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows && !this.block[cy * this.cols + cx]; }
    walkXY(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H && this.walk(Math.floor(x / CELL), Math.floor(y / CELL)); }
    nearestWalk(cx, cy) {
      if (this.walk(cx, cy)) return [cx, cy];
      for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && this.walk(cx + dx, cy + dy)) return [cx + dx, cy + dy];
      return [cx, cy];
    }
    los(ax, ay, bx, by) {
      const d = CF.dist(ax, ay, bx, by), n = Math.ceil(d / (CELL / 3));
      for (let i = 1; i < n; i++) if (!this.walkXY(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false;
      return true;
    }
    findPath(sx, sy, tx, ty) {
      if (this.los(sx, sy, tx, ty)) return [[tx, ty]];
      const C = this.cols, [s0, s1] = this.nearestWalk(...this.cellOf(sx, sy)), [t0, t1] = this.nearestWalk(...this.cellOf(tx, ty));
      const start = s1 * C + s0, goal = t1 * C + t0;
      const gS = new Float64Array(C * this.rows).fill(Infinity), came = new Int32Array(C * this.rows).fill(-1), closed = new Uint8Array(C * this.rows);
      const heap = [[0, start]]; gS[start] = 0;
      const h = (i) => { const dx = Math.abs((i % C) - t0), dy = Math.abs(Math.floor(i / C) - t1); return dx + dy + (1.414 - 2) * Math.min(dx, dy); };
      const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
      let it = 0, found = false;
      while (heap.length && it++ < 8000) {
        const [, cur] = pop();
        if (cur === goal) { found = true; break; }
        if (closed[cur]) continue; closed[cur] = 1;
        const cx = cur % C, cy = Math.floor(cur / C);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.walk(nx, ny)) continue;
          if (dx && dy && (!this.walk(cx + dx, cy) || !this.walk(cx, cy + dy))) continue;
          const ni = ny * C + nx, ng = gS[cur] + (dx && dy ? 1.414 : 1);
          if (ng < gS[ni]) { gS[ni] = ng; came[ni] = cur; push(ng + h(ni), ni); }
        }
      }
      if (!found) return [[tx, ty]];
      const cells = []; let c = goal;
      while (c !== -1 && c !== start) { cells.push(c); c = came[c]; }
      cells.reverse();
      const pts = cells.map((i) => [(i % C) * CELL + CELL / 2, Math.floor(i / C) * CELL + CELL / 2]);
      if (this.walkXY(tx, ty)) pts.push([tx, ty]);
      // 视线平滑
      const out = []; let ax = sx, ay = sy, i = 0;
      while (i < pts.length) { let j = pts.length - 1; while (j > i && !this.los(ax, ay, pts[j][0], pts[j][1])) j--; out.push(pts[j]); [ax, ay] = pts[j]; i = j + 1; }
      return out;
    }
    computeFlow(tx, ty) {
      const C = this.cols, N = C * this.rows, dist = new Float64Array(N).fill(Infinity), cost = new Float32Array(N).fill(1);
      this.ents.forEach((e) => { if (e.kind === 'b' && e.team === 0 && e.type !== 'core') { const [cx, cy] = this.cellOf(e.x, e.y); const rr = Math.ceil(e.r / CELL); for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) if (x >= 0 && y >= 0 && x < C && y < this.rows) cost[y * C + x] = 6; } });
      const [g0, g1] = this.nearestWalk(...this.cellOf(tx, ty)), goal = g1 * C + g0;
      dist[goal] = 0;
      const heap = [[0, goal]];
      const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
      while (heap.length) {
        const [d, cur] = pop();
        if (d > dist[cur]) continue;
        const cx = cur % C, cy = Math.floor(cur / C);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.walk(nx, ny)) continue;
          if (dx && dy && (!this.walk(cx + dx, cy) || !this.walk(cx, cy + dy))) continue;
          const ni = ny * C + nx, nd = d + (dx && dy ? 1.414 : 1) * cost[ni];
          if (nd < dist[ni]) { dist[ni] = nd; push(nd, ni); }
        }
      }
      this.flow = dist;
    }
    flowDir(x, y) {
      if (!this.flow) return null;
      const C = this.cols, [cx, cy] = this.cellOf(x, y);
      let best = this.flow[cy * C + cx], bx = 0, by = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.walk(nx, ny)) continue;
        if (dx && dy && (!this.walk(cx + dx, cy) || !this.walk(cx, cy + dy))) continue;
        const v = this.flow[ny * C + nx];
        if (v < best) { best = v; bx = dx; by = dy; }
      }
      if (!bx && !by) return null;
      return [cx * CELL + CELL / 2 + bx * CELL, cy * CELL + CELL / 2 + by * CELL];
    }

    // ---------- 空间哈希 ----------
    rebuildHash() {
      const m = (this.hash = new Map());
      for (const e of this.ents) { if (e.dead) continue; const k = ((e.x / 100) | 0) * 1000 + ((e.y / 100) | 0); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(e); }
    }
    near(x, y, rad, fn) {
      const out = [], x0 = ((x - rad) / 100) | 0, x1 = ((x + rad) / 100) | 0, y0 = ((y - rad) / 100) | 0, y1 = ((y + rad) / 100) | 0;
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const a = this.hash.get(i * 1000 + j); if (a) for (const e of a) if (!e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 <= (rad + e.r) ** 2 && (!fn || fn(e))) out.push(e); }
      return out;
    }
    canHit(a, t) { const k = a.def.atk; if (!k || t.dead || t.team === a.team) return false; if (t.air && !k.air) return false; if (!t.air && k.ground === false) return false; if (t.air && k.ground) return false; return true; }
    bestTarget(a, rad) {
      let best = null, bd = Infinity;
      for (const t of this.near(a.x, a.y, rad, (t) => this.canHit(a, t))) {
        let d = CF.dist(a.x, a.y, t.x, t.y) - t.r;
        if (t.kind === 'b' && a.team === 0) d += 60; // 我方优先打单位
        if (t.type === 'barrier' && a.team === 1) d += 80;
        if (d < bd) { bd = d; best = t; }
      }
      return best;
    }

    // ---------- 主循环 ----------
    frame(dt) {
      if (this.over) return;
      if (!this.paused && !CF.modal.isOpen()) {
        this.acc += Math.min(dt, 0.1) * this.speed;
        let n = 0;
        while (this.acc >= TICK && n++ < 8) { this.tick(TICK); this.acc -= TICK; }
      }
      this.beat = Math.max(0, this.beat - dt * 3); if (this.strum) this.strum = Math.max(0, this.strum - dt);
      this.shake = Math.max(0, this.shake - dt);
    }
    tick(dt) {
      const g = this, L = g.L;
      g.time += dt;
      // 经济
      const r = { chip: 0, corp: 0, comp: 0 };
      if (!g.core.dead) { r.chip += 2; r.comp += 1 + g.bonus.compRate; }
      for (const e of g.ents) if (e.type === 'miner' && e.done && !e.dead && e.node) r[e.node.type] += BT.miner.yield;
      g.rate = r;
      for (const k in r) { g.res[k] += r[k] * dt; g.stats.gathered[k] += r[k] * dt; }
      // 剧本
      const sc = L.script || [];
      while (g.scriptI < sc.length && g.time >= sc[g.scriptI][0]) { const [, who, t] = sc[g.scriptI++]; CF.UI.say(who, t); }
      // 波次
      const total = L.endless ? Infinity : (L.waves || []).length;
      if (g.wave < total) { g.waveTimer -= dt; if (g.waveTimer <= 0) g.spawnWave(); }
      g.spawnCd -= dt;
      const alive = g.ents.reduce((s, e) => s + (e.team === 1 && e.kind === 'u' && !e.dead ? 1 : 0), 0);
      while (g.spawnQ.length && g.spawnCd <= 0 && alive < 180) {
        const s = g.spawnQ.shift(); g.spawnCd = 0.18;
        const u = g.addU(s.type, 1, s.x + CF.rand(-40, 40), s.y + CF.rand(-40, 40));
        if (!u.air && !g.walkXY(u.x, u.y)) { const [cx, cy] = g.nearestWalk(...g.cellOf(u.x, u.y)); u.x = cx * CELL + 20; u.y = cy * CELL + 20; }
        if (L.hpMul) { u.maxHp = u.hp = Math.round(u.hp * L.hpMul); }
        if (s.boss) { g.boss = u; u.spawnCd = 5; CF.UI.bossBar(u); CF.Audio.play('boss'); }
      }
      // 伏击（第 3 关）
      if (L.ambush && g.proto) while (g.ambushI < L.ambush.length && g.proto.wp >= L.ambush[g.ambushI][2]) { const [x, y] = L.ambush[g.ambushI++]; for (let i = 0; i < 7; i++) g.spawnQ.push({ type: i < 5 ? 'bug' : 'noise', x, y }); CF.UI.say('侦察Agent', '前方发现伏击！保护原型机！'); CF.Audio.sfx('alert'); }
      // 半血 Boss（第 5 关）
      if (L.bossAtHalf && g.gcore && !g.gcore.dead && !g.bossHalf && g.gcore.hp < g.gcore.maxHp * 0.5) { g.bossHalf = true; g.spawnQ.unshift({ type: L.bossAtHalf, x: g.gcore.x - 120, y: g.gcore.y, boss: true }); CF.UI.say('乱码', '熵……终将……吞没一切……'); CF.Audio.sfx('alert'); CF.toast('熵之王 现身！', 'bad'); }
      // 流场
      g.flowT -= dt;
      const goal = L.waveTarget === 'proto' && g.proto && !g.proto.dead ? g.proto : g.core;
      if ((g.flowDirty && g.flowT <= 0) || (L.waveTarget === 'proto' && g.flowT <= 0) || !g.flow) { g.computeFlow(goal.x, goal.y); g.flowDirty = false; g.flowT = L.waveTarget === 'proto' ? 2 : 0.5; }
      g.goal = goal;
      // 研究与英雄
      g.researchCd = Math.max(0, g.researchCd - dt);
      if (g.hero.dead) { g.heroRespawn -= dt; if (g.heroRespawn <= 0 && !g.core.dead) { const h = g.addU('claude', 0, g.core.x + 60, g.core.y + 40); h.maxHp = h.hp = Math.round(UT.claude.hp * g.bonus.heroHp); h.cd = { riff: 0, chord: 0 }; g.hero = h; CF.UI.say('Claude', '我回来了。继续演奏！'); } }
      else { g.hero.cd.riff = Math.max(0, g.hero.cd.riff - dt); g.hero.cd.chord = Math.max(0, g.hero.cd.chord - dt); }
      // 实体
      g.rebuildHash();
      for (const e of g.ents) { if (e.dead) continue; e.hit = Math.max(0, e.hit - dt); e.buff = Math.max(0, (e.buff || 0) - dt); if (e.kind === 'b') g.updB(e, dt); else g.updU(e, dt); }
      g.separate(dt);
      g.updProj(dt);
      g.updFx(dt);
      g.cleanup();
      // 采样
      if (Math.floor(g.time / 5) !== Math.floor((g.time - dt) / 5)) g.sample();
      // 胜负
      if (g.core.dead) return g.end(false, '主脑被摧毁了。');
      if (L.lose && L.lose(g)) return g.end(false, L.loseText || '任务失败。');
      if (L.win(g)) return g.end(true);
    }
    end(win, why) {
      if (this.over) return;
      this.over = true;
      const g = this, L = g.L, d = CF.Save.data;
      g.sample();
      const stars = win ? L.stars.filter(([, f]) => { try { return f(g); } catch (e) { return false; } }).length : 0;
      d.stats.battles++; d.stats.kills += g.stats.kills; if (win) d.stats.wins++;
      if (L.skirmish) { if (win) d.skirmish[L.skirmish] = (d.skirmish[L.skirmish] || 0) + 1; }
      else {
        const rec = d.campaign[L.id] || { won: false, stars: 0, best: null };
        if (win) { rec.won = true; rec.stars = Math.max(rec.stars || 0, stars); rec.best = rec.best ? Math.min(rec.best, g.time) : g.time; }
        d.campaign[L.id] = rec;
      }
      CF.Save.save(); CF.P.checkAch(); CF.P.announceUnlocks();
      setTimeout(() => CF.UI.endScreen(g, win, stars, why), win ? 900 : 1200);
    }
    sample() {
      let me = 0, foe = 0;
      for (const e of this.ents) if (!e.dead && e.kind === 'u') { if (e.team === 0) me += e.hp; else foe += e.hp; }
      this.stats.army.push({ t: this.time, me, foe });
    }
    spawnWave() {
      const g = this, L = g.L;
      g.wave++;
      const def = L.endless ? CF.Levels.genWave(g.wave, L.mul || 1) : L.waves[g.wave - 1];
      g.waveTag = def.tag || '';
      const pts = L.spawns === 'gcore' ? (g.gcore && !g.gcore.dead ? [[g.gcore.x - 70, g.gcore.y - 60], [g.gcore.x - 70, g.gcore.y + 60]] : []) : L.spawns;
      if (pts.length) {
        let k = 0;
        def.units.forEach(([t, n]) => { for (let i = 0; i < n; i++) { const p = pts[k++ % pts.length]; g.spawnQ.push({ type: t, x: p[0], y: p[1] }); } });
        if (def.boss) { const p = pts[0]; g.spawnQ.push({ type: def.boss, x: p[0], y: p[1], boss: true }); }
      }
      g.stats.waves.push({ n: g.wave, lost: 0, killed: 0 });
      const more = L.endless || g.wave < L.waves.length;
      g.waveTimer = more ? L.gap : Infinity;
      CF.Audio.sfx('wave');
      CF.toast(`第 ${g.wave} 波来袭${g.waveTag ? ' · ' + g.waveTag : ''}`, def.boss ? 'bad' : '');
      if (g.count('radar', true)) CF.UI.say('侦察Agent', `雷达预警：第 ${g.wave} 波，约 ${def.units.reduce((s, u) => s + u[1], 0)} 个乱码单位${def.boss ? '，含 Boss' : ''}。`);
    }

    // ---------- 建筑逻辑 ----------
    updB(b, dt) {
      const g = this;
      if (!b.done) { b.prog += dt / b.def.build; b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * 0.9 * dt) / b.def.build); if (b.prog >= 1) { b.done = true; b.prog = 1; CF.Audio.sfx('place', 0.6); if (b.team === 0) g.stats.built++; } return; }
      const atk = b.def.atk;
      if (atk) {
        b.atkCd -= dt;
        let range = atk.range;
        if (b.type === 'turret' && g.ents.some((r) => r.type === 'radar' && r.done && !r.dead && CF.dist(r.x, r.y, b.x, b.y) < 320)) range *= 1.2;
        b.range = range;
        if (b.atkCd <= 0) {
          const t = g.bestTarget(b, range);
          if (t) { b.ang = Math.atan2(t.y - b.y, t.x - b.x); g.fire(b, t, atk); b.atkCd = atk.rate; }
          else b.atkCd = 0.2;
        }
      }
      if (b.def.heal) {
        b.healCd -= dt;
        if (b.healCd <= 0) {
          b.healCd = 1;
          g.near(b.x, b.y, b.def.heal.range, (e) => e.team === 0 && e !== b && e.hp < e.maxHp && (e.kind === 'u' || e.done !== false)).forEach((e) => { e.hp = Math.min(e.maxHp, e.hp + b.def.heal.amt); g.parts.push({ x: e.x + CF.rand(-8, 8), y: e.y, vx: 0, vy: -30, life: 0.6, age: 0, c: '#6fdc8c', s: 3 }); });
        }
      }
      if (b.queue.length) {
        const q = b.queue[0];
        q.t -= dt;
        if (q.t <= 0) {
          b.queue.shift();
          const a = Math.atan2(b.rally.y - b.y, b.rally.x - b.x);
          const u = g.addU(q.type, 0, b.x + Math.cos(a) * (b.r + 14), b.y + Math.sin(a) * (b.r + 14));
          g.orderMove([u], b.rally.x, b.rally.y, true);
          g.stats.trained++; CF.Audio.sfx('train', 0.6);
        }
      }
      if (b.type === 'ctx' && b.hit <= 0 && b.hp < b.maxHp) { b.regen = (b.regen || 0) + dt; if (b.regen > 4) b.hp = Math.min(b.maxHp, b.hp + 6 * dt); } else if (b.type === 'ctx') b.regen = 0;
    }

    // ---------- 单位逻辑 ----------
    updU(u, dt) {
      const g = this, d = u.def;
      if (u.type === 'proto') return g.updProto(u, dt);
      u.atkCd -= dt; u.scan -= dt;
      // Boss 技能
      if (u.type === 'carrier') { u.spawnCd -= dt; if (u.spawnCd <= 0) { u.spawnCd = 7; for (let i = 0; i < 3; i++) g.spawnQ.push({ type: 'bat', x: u.x, y: u.y }); } }
      if (u.type === 'entropy') { u.spawnCd = (u.spawnCd ?? 6) - dt; if (u.spawnCd <= 0) { u.spawnCd = 12; for (let i = 0; i < 4; i++) g.spawnQ.push({ type: 'bug', x: u.x, y: u.y }); g.fx.push({ k: 'ring', x: u.x, y: u.y, r: 0, max: 230, t: 0, c: '#ff4f9a' }); g.near(u.x, u.y, 230, (e) => e.team === 0).forEach((e) => g.damage(e, 40, u)); } }
      // 目标选择
      let t = u.tgt ? g.get(u.tgt) : null;
      if (t && !g.canHit(u, t)) t = null;
      const o = u.order;
      if (u.team === 0) {
        if (o.t === 'attack') { t = g.get(o.id); if (!t) { u.order = { t: 'idle' }; } }
        else if (o.t !== 'move' && u.scan <= 0) { u.scan = 0.3; const rad = d.atk ? d.atk.range + (o.t === 'hold' ? 0 : 150) : 0; t = rad ? g.bestTarget(u, rad) : null; }
        else if (o.t === 'move') t = null;
      } else if (u.scan <= 0) {
        u.scan = 0.35;
        if (u.type === 'forget') { const c = g.ents.filter((e) => e.type === 'ctx' && !e.dead).sort((a, b) => CF.dist(a.x, a.y, u.x, u.y) - CF.dist(b.x, b.y, u.x, u.y))[0]; t = c || g.bestTarget(u, 260); }
        else t = g.bestTarget(u, d.atk.range + 130);
      }
      u.tgt = t ? t.id : null;
      if (t) {
        const dd = CF.dist(u.x, u.y, t.x, t.y) - t.r - u.r;
        u.face = t.x > u.x ? 1 : -1;
        if (dd <= d.atk.range) {
          u.vx *= 0.5; u.vy *= 0.5;
          if (u.atkCd <= 0) { g.fire(u, t, d.atk); u.atkCd = d.atk.rate * (u.buff > 0 ? 0.65 : 1); }
          return;
        }
        if (o.t !== 'hold') {
          if (!u.air && !g.los(u.x, u.y, t.x, t.y)) {
            if (!u.path || (u.repath = (u.repath || 0) - dt) <= 0) { u.path = g.findPath(u.x, u.y, t.x, t.y); u.repath = 1; }
            return g.followPath(u, dt);
          }
          return g.steer(u, t.x, t.y, dt);
        }
        return;
      }
      // 无目标：执行命令
      if (u.team === 0) {
        if ((o.t === 'move' || o.t === 'amove') && u.path) { if (g.followPath(u, dt)) { u.order = { t: 'idle' }; u.guard = { x: u.x, y: u.y }; } return; }
        if (o.t === 'idle' && CF.dist(u.x, u.y, u.guard.x, u.guard.y) > 60) { if (!u.path) u.path = g.findPath(u.x, u.y, u.guard.x, u.guard.y); if (g.followPath(u, dt)) u.path = null; return; }
        u.vx *= 0.8; u.vy *= 0.8;
        return;
      }
      // 敌军：沿流场前进
      const goal = u.type === 'forget' ? g.core : g.goal;
      if (u.air) return g.steer(u, goal.x, goal.y, dt);
      const nx = g.flowDir(u.x, u.y);
      if (nx) g.steer(u, nx[0], nx[1], dt); else g.steer(u, goal.x, goal.y, dt);
    }
    updProto(u, dt) {
      const g = this, route = g.L.route;
      const escort = g.near(u.x, u.y, 240, (e) => e.team === 0 && e.kind === 'u' && e !== u).length > 0;
      u.escort = escort;
      if (!escort || u.wp >= route.length) { u.vx *= 0.7; u.vy *= 0.7; return; }
      const [tx, ty] = route[u.wp];
      if (CF.dist(u.x, u.y, tx, ty) < 24) { u.wp++; if (u.wp >= route.length) { g.protoArrived = true; CF.toast('原型机抵达发射台！', 'good'); } return; }
      g.steer(u, tx, ty, dt);
    }
    followPath(u, dt) {
      if (!u.path || !u.path.length) return true;
      const [tx, ty] = u.path[0];
      const last = u.path.length === 1;
      if (CF.dist(u.x, u.y, tx, ty) < (last ? 10 : 22)) { u.path.shift(); if (!u.path.length) { u.path = null; u.vx *= 0.3; u.vy *= 0.3; return true; } }
      this.steer(u, tx, ty, dt);
      return false;
    }
    steer(u, tx, ty, dt) {
      const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy) || 1;
      const sp = u.def.speed * (u.team === 1 && this.L.skirmish === 'hard' ? 1.08 : 1);
      u.vx = CF.lerp(u.vx, (dx / d) * sp, 0.25); u.vy = CF.lerp(u.vy, (dy / d) * sp, 0.25);
      if (Math.abs(u.vx) > 5) u.face = u.vx > 0 ? 1 : -1;
      u.step += dt * 8;
    }
    separate(dt) {
      const g = this;
      for (const u of g.ents) {
        if (u.dead || u.kind !== 'u') continue;
        let px = 0, py = 0;
        for (const o of g.near(u.x, u.y, u.r + 22)) {
          if (o === u) continue;
          if (o.kind === 'u' && o.air !== u.air) continue;
          if (o.kind === 'b' && u.air) continue;
          const dx = u.x - o.x, dy = u.y - o.y, d = Math.hypot(dx, dy) || 0.01, min = u.r + o.r + (o.kind === 'b' ? 2 : 1);
          if (d < min) {
            const push = (min - d) / d;
            if (o.kind === 'b') { u.x += dx * push; u.y += dy * push; if (u.team === 1 && o.team === 0 && u.def.atk && !u.tgt && u.scan > 0.1) u.tgt = o.id; }
            else { px += dx * push * 0.5; py += dy * push * 0.5; }
          }
        }
        let nx = u.x + u.vx * dt + px, ny = u.y + u.vy * dt + py;
        if (!u.air) {
          if (!g.walkXY(nx, ny)) { if (g.walkXY(nx, u.y)) ny = u.y; else if (g.walkXY(u.x, ny)) nx = u.x; else { nx = u.x; ny = u.y; } }
        }
        u.x = CF.clamp(nx, 4, g.W - 4); u.y = CF.clamp(ny, 4, g.H - 4);
      }
    }

    // ---------- 战斗 ----------
    fire(a, t, atk) {
      const g = this;
      let dmg = atk.dmg;
      if (atk.vsAir && t.air) dmg *= atk.vsAir;
      if (a.type === 'claude') dmg *= 1 + (g.bonus.riffMul - 1) * 0.5;
      if (a.type === 'forget' && t.type === 'ctx') dmg *= 1.5;
      if (atk.melee) { g.damage(t, dmg, a, atk.splash); g.parts.push({ x: t.x, y: t.y, vx: 0, vy: 0, life: 0.15, age: 0, c: a.team ? COLS.foe : '#fff', s: 6 }); return; }
      const col = a.team === 0 ? (a.type === 'claude' ? '#b3abea' : a.air ? '#f0936f' : '#e9b949') : (Math.random() < 0.5 ? COLS.foe : COLS.foe2);
      g.proj.push({ x: a.x, y: a.y - (a.air ? 10 : 0), tid: t.id, tx: t.x, ty: t.y, sp: atk.splash ? 380 : 560, dmg, splash: atk.splash || 0, team: a.team, src: a.id, c: col, ground: atk.ground, big: !!atk.splash });
      if (this.onScreen(a.x, a.y)) CF.Audio.sfx(atk.splash ? 'laser' : 'shoot', 0.5);
    }
    updProj(dt) {
      const g = this;
      for (const p of g.proj) {
        const t = g.get(p.tid);
        if (t) { p.tx = t.x; p.ty = t.y; }
        const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
        const step = p.sp * dt;
        if (d <= step + 4) {
          p.done = true;
          const src = g.get(p.src) || { team: p.team, id: p.src, def: {} };
          if (p.splash) {
            g.fx.push({ k: 'boom', x: p.tx, y: p.ty, r: p.splash, t: 0, c: p.team ? COLS.foe : '#e9b949' });
            g.near(p.tx, p.ty, p.splash, (e) => e.team !== p.team && (!p.ground || !e.air)).forEach((e) => g.damage(e, p.dmg * (e === t ? 1 : 0.6), src));
          } else if (t) g.damage(t, p.dmg, src);
          g.parts.push({ x: p.tx, y: p.ty, vx: 0, vy: 0, life: 0.12, age: 0, c: p.c, s: 5 });
        } else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
      }
      g.proj = g.proj.filter((p) => !p.done);
    }
    damage(t, dmg, src) {
      if (t.dead) return;
      t.hp -= dmg; t.hit = 0.1;
      if (t.team === 0 && t.kind === 'b' && t.type === 'core' && Math.random() < 0.05) CF.UI.flashCore();
      if (t.hp <= 0) { t.dead = true; t.killer = src ? src.team : -1; }
    }
    cleanup() {
      const g = this;
      const dead = g.ents.filter((e) => e.dead && !e.gone);
      if (!dead.length) return;
      for (const e of dead) {
        e.gone = true;
        const big = e.kind === 'b' || e.def.boss || e.r > 18;
        g.fx.push({ k: 'boom', x: e.x, y: e.y, r: big ? e.r * 2.2 : 26, t: 0, c: e.team ? COLS.foe : COLS.me });
        for (let i = 0; i < (big ? 18 : 7); i++) { const a = Math.random() * TAU, s = CF.rand(40, big ? 180 : 110); g.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: CF.rand(0.3, 0.8), age: 0, c: e.team ? (Math.random() < 0.5 ? COLS.foe : COLS.foe2) : (Math.random() < 0.5 ? COLS.me : '#e9b949'), s: CF.rand(2, 5) }); }
        if (g.onScreen(e.x, e.y)) CF.Audio.sfx('boom', big ? 0.9 : 0.35);
        const w = g.stats.waves[g.stats.waves.length - 1];
        if (e.team === 1) {
          if (e.kind === 'u') { g.stats.kills++; if (w) w.killed++; const b = e.def.bounty || {}; for (const k in b) g.res[k] += b[k]; }
          if (e.def.boss) { g.bossDone.add(e.type); g.boss = null; CF.UI.bossBar(null); CF.Audio.play('battle'); CF.toast(`${e.def.name} 被击败！`, 'gold', 3000); CF.UI.say('Claude', '漂亮！这段 solo 献给你，指挥官。'); }
          if (e.type === 'gcore') { CF.toast('乱码主脑已摧毁！', 'gold', 3000); }
        } else {
          if (e.type !== 'proto') { g.stats.lost++; if (w) w.lost++; if (e.air) g.lostAir++; }
          if (e.kind === 'b') { g.flowDirty = true; if (e.node) e.node.miner = null; if (e.type !== 'core') CF.toast(`${e.def.name} 被摧毁`, 'bad', 1500); }
          if (e.type === 'claude') { g.heroRespawn = 20; CF.UI.say('Claude', '琴弦断了……20 秒后我会回来。'); }
        }
      }
      g.ents = g.ents.filter((e) => !e.dead);
      g.sel = g.sel.filter((id) => g.get(id));
      CF.UI.selDirty = true;
    }
    updFx(dt) {
      for (const f of this.fx) { f.t += dt; if (f.k === 'ring') f.r = (f.t / 0.55) * f.max; }
      this.fx = this.fx.filter((f) => f.t < (f.k === 'ring' ? 0.6 : f.k === 'notes' ? 1.2 : 0.35));
      for (const p of this.parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
      this.parts = this.parts.filter((p) => p.age < p.life);
      if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
    }

    // ---------- 技能 ----------
    riff() {
      const g = this, h = g.hero;
      if (h.dead) return CF.toast('Claude 正在重生');
      if (h.cd.riff > 0) return CF.toast(`弦振冲击冷却中 ${Math.ceil(h.cd.riff)}s`);
      if (g.res.comp < 40) { CF.Audio.sfx('error'); return CF.toast('算力不足（需要 40）', 'bad'); }
      g.res.comp -= 40; h.cd.riff = 12; g.stats.riffs++; CF.Save.data.stats.riffs++;
      const R = 200, dmg = 120 * g.bonus.riffMul;
      g.fx.push({ k: 'ring', x: h.x, y: h.y, r: 0, max: R, t: 0, c: '#b3abea', pixel: true });
      g.fx.push({ k: 'ring', x: h.x, y: h.y, r: 0, max: R * 0.7, t: -0.12, c: '#8b80d6', pixel: true });
      g.near(h.x, h.y, R, (e) => e.team === 1).forEach((e) => {
        g.damage(e, e.def.boss || e.kind === 'b' ? dmg * 0.6 : dmg, h);
        if (e.kind === 'u' && !e.def.boss) { const a = Math.atan2(e.y - h.y, e.x - h.x); const nx = e.x + Math.cos(a) * 46, ny = e.y + Math.sin(a) * 46; if (e.air || g.walkXY(nx, ny)) { e.x = nx; e.y = ny; } }
      });
      for (let i = 0; i < 14; i++) g.parts.push({ x: h.x + 10, y: h.y - 14, vx: CF.rand(-80, 80), vy: CF.rand(-140, -40), life: 1, age: 0, c: '#f2c14e', s: 4, note: true });
      g.shake = 0.3; g.strum = 0.6; CF.Audio.sfx('riff');
    }
    chord() {
      const g = this, h = g.hero;
      if (h.dead) return CF.toast('Claude 正在重生');
      if (h.cd.chord > 0) return CF.toast(`灵感和弦冷却中 ${Math.ceil(h.cd.chord)}s`);
      if (g.res.comp < 30) { CF.Audio.sfx('error'); return CF.toast('算力不足（需要 30）', 'bad'); }
      g.res.comp -= 30; h.cd.chord = 20;
      g.fx.push({ k: 'ring', x: h.x, y: h.y, r: 0, max: 230, t: 0, c: '#6fdc8c' });
      g.near(h.x, h.y, 230, (e) => e.team === 0).forEach((e) => { e.hp = Math.min(e.maxHp, e.hp + (e.kind === 'b' ? 75 : 150)); e.buff = 6; g.parts.push({ x: e.x, y: e.y - 6, vx: CF.rand(-20, 20), vy: -50, life: 1, age: 0, c: '#f2c14e', s: 3, note: true }); });
      g.strum = 0.6; CF.Audio.sfx('chord'); CF.Audio.sfx('heal');
    }
    research() {
      const g = this;
      if (g.researchCd > 0) return CF.toast(`研究冷却中 ${Math.ceil(g.researchCd)}s`);
      const dom = { L1: 'ai', L2: 'ai', L3: 'emb', L4: 'aero', L5: 'biz' }[g.L.id] || 'all';
      g.researchCd = 45;
      CF.Academy.quiz({ domain: dom, n: 1, title: '🔬 战地研究 · 答对获得资源', inBattle: true, onDone: (right) => {
        if (right) { g.res.chip += 80; g.res.corp += 40; g.res.comp += 20; CF.toast('研究成功：晶片 +80 · 语料 +40 · 算力 +20', 'gold'); }
        else { g.res.chip += 20; CF.toast('研究未成功，但你学到了：晶片 +20'); }
      } });
    }

    // ---------- 命令 ----------
    myUnits(ids) { return (ids || this.sel).map((id) => this.get(id)).filter((e) => e && e.team === 0 && e.kind === 'u' && e.type !== 'proto'); }
    orderMove(units, x, y, attack) {
      const n = units.length, cols = Math.ceil(Math.sqrt(n)), sp = 30;
      units.forEach((u, i) => {
        const ox = ((i % cols) - (cols - 1) / 2) * sp, oy = (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * sp;
        let tx = CF.clamp(x + ox, 10, this.W - 10), ty = CF.clamp(y + oy, 10, this.H - 10);
        if (!u.air && !this.walkXY(tx, ty)) { tx = x; ty = y; }
        u.order = { t: attack ? 'amove' : 'move', x: tx, y: ty };
        u.path = u.air ? [[tx, ty]] : this.findPath(u.x, u.y, tx, ty);
        u.tgt = null; u.guard = { x: tx, y: ty };
      });
    }
    orderAttack(units, t) { units.forEach((u) => { if (this.canHit(u, t)) { u.order = { t: 'attack', id: t.id }; u.tgt = t.id; u.path = null; } else this.orderMove([u], t.x, t.y, true); }); }
    orderStop(units) { units.forEach((u) => { u.order = { t: 'idle' }; u.path = null; u.tgt = null; u.guard = { x: u.x, y: u.y }; }); }
    orderHold(units) { units.forEach((u) => { u.order = { t: 'hold' }; u.path = null; u.guard = { x: u.x, y: u.y }; }); CF.toast('驻守：原地攻击射程内的敌人'); }
    pushTarget() {
      if (this.gcore && !this.gcore.dead) return [this.gcore.x, this.gcore.y];
      if (this.proto && !this.proto.dead) { const r = this.L.route[Math.min(this.proto.wp, this.L.route.length - 1)]; return [(this.proto.x + r[0]) / 2, (this.proto.y + r[1]) / 2]; }
      const foes = this.ents.filter((e) => e.team === 1 && !e.dead);
      if (foes.length) { foes.sort((a, b) => CF.dist(a.x, a.y, this.core.x, this.core.y) - CF.dist(b.x, b.y, this.core.x, this.core.y)); return [foes[0].x, foes[0].y]; }
      const sp = this.L.spawns; return Array.isArray(sp) ? sp[0] : [this.W - 200, this.H / 2];
    }
    orderPush(units) { const [x, y] = this.pushTarget(); this.orderMove(units, x, y, true); CF.toast('全军推进！'); CF.Audio.sfx('alert', 0.6); }
    allArmy() { return this.ents.filter((e) => e.team === 0 && e.kind === 'u' && e.type !== 'proto' && !e.dead).map((e) => e.id); }
    train(b, type) {
      const d = UT[type];
      if (this.L.noGround && b.type === 'workshop') return CF.toast('本关地面工坊被干扰，无法生产', 'bad');
      if (b.queue.length >= 5) return CF.toast('训练队列已满（5）');
      if (!canPay(this.res, d.cost)) { CF.Audio.sfx('error'); return CF.toast('资源不足', 'bad'); }
      pay(this.res, d.cost); b.queue.push({ type, t: d.time, total: d.time }); CF.Audio.sfx('click');
    }
    sell(b) {
      if (b.type === 'core' || b.type === 'ctx' || b.team !== 0) return;
      const c = b.def.cost || {}; for (const k in c) this.res[k] += Math.floor(c[k] * 0.5 * (b.hp / b.maxHp));
      b.dead = true; b.gone = true; if (b.node) b.node.miner = null; this.flowDirty = true;
      this.ents = this.ents.filter((e) => e !== b); this.sel = []; CF.UI.selDirty = true; CF.Audio.sfx('click');
    }

    // ---------- 建造 ----------
    buildRangeOk(x, y) { return this.ents.some((e) => e.team === 0 && e.kind === 'b' && e.done !== false && e.type !== 'ctx' && CF.dist(e.x, e.y, x, y) <= (e.type === 'radar' ? 460 : e.type === 'core' ? 340 : 260)); }
    checkBuild(type, x, y) {
      const d = BT[type];
      if (type === 'miner') { const n = this.nodeAt(x, y); if (!n) return [false, '矿机必须建在资源点上']; if (n.miner) return [false, '这个资源点已有矿机']; x = n.x; y = n.y; }
      if (x < d.r || y < d.r || x > this.W - d.r || y > this.H - d.r) return [false, '超出地图'];
      for (let a = 0; a < TAU; a += TAU / 8) if (!this.walkXY(x + Math.cos(a) * d.r * 0.8, y + Math.sin(a) * d.r * 0.8)) return [false, '不能建在数据断崖上'];
      if (!this.walkXY(x, y)) return [false, '不能建在数据断崖上'];
      if (this.ents.some((e) => e.kind === 'b' && !e.dead && CF.dist(e.x, e.y, x, y) < e.r + d.r + 4)) return [false, '与其他建筑重叠'];
      if (type !== 'miner' && this.nodes.some((n) => CF.dist(n.x, n.y, x, y) < n.r + d.r)) return [false, '资源点只能放矿机'];
      if (!this.buildRangeOk(x, y)) return [false, '超出信号覆盖范围（靠近已有建筑，雷达站可扩展）'];
      if (!canPay(this.res, d.cost)) return [false, '资源不足'];
      return [true, '', x, y];
    }
    startBuild(type) {
      const u = CF.P.buildUnlocked(type);
      if (!u.ok) { CF.Audio.sfx('error'); return CF.toast('🔒 ' + u.why, 'bad', 3000); }
      if (this.L.noGround && type === 'workshop') return CF.toast('本关地面工坊被干扰，无法建造', 'bad');
      this.build = { type, x: this.cam.x + this.viewW() / 2, y: this.cam.y + this.viewH() / 2 };
      this.amove = false;
      this.updateGhost(this.build.x, this.build.y);
      CF.UI.buildMode(true);
    }
    updateGhost(x, y) { const b = this.build; if (!b) return; b.x = x; b.y = y; const r = this.checkBuild(b.type, x, y); b.ok = r[0]; b.why = r[1]; if (r[0]) { b.sx = r[2]; b.sy = r[3]; } }
    placeBuild(keep) {
      const b = this.build; if (!b) return;
      this.updateGhost(b.x, b.y);
      if (!b.ok) { CF.Audio.sfx('error'); CF.toast(b.why, 'bad'); return; }
      pay(this.res, BT[b.type].cost);
      this.addB(b.type, 0, b.sx, b.sy, false);
      CF.Audio.sfx('place');
      if (!keep || !canPay(this.res, BT[b.type].cost)) this.cancelBuild();
    }
    cancelBuild() { this.build = null; CF.UI.buildMode(false); }

    // ---------- 视图 ----------
    viewW() { return this.vw / this.cam.z; }
    viewH() { return this.vh / this.cam.z; }
    clampCam() { const c = this.cam, m = 60; c.x = CF.clamp(c.x, -m, Math.max(-m, this.W - this.viewW() + m)); c.y = CF.clamp(c.y, -m, Math.max(-m, this.H - this.viewH() + m)); }
    centerOn(x, y) { this.cam.x = x - this.viewW() / 2; this.cam.y = y - this.viewH() / 2; this.clampCam(); }
    zoomAt(sx, sy, f) { const c = this.cam, wx = c.x + sx / c.z, wy = c.y + sy / c.z; c.z = CF.clamp(c.z * f, 0.4, 2.2); c.x = wx - sx / c.z; c.y = wy - sy / c.z; this.clampCam(); }
    toWorld(sx, sy) { return [this.cam.x + sx / this.cam.z, this.cam.y + sy / this.cam.z]; }
    onScreen(x, y) { const c = this.cam; return x > c.x - 50 && y > c.y - 50 && x < c.x + this.viewW() + 50 && y < c.y + this.viewH() + 50; }
    pick(wx, wy) {
      let best = null, bd = Infinity;
      for (const e of this.ents) { if (e.dead) continue; const d = CF.dist(e.x, e.y - (e.air ? 10 : 0), wx, wy); if (d < e.r + 8 && d < bd) { bd = d; best = e; } }
      return best;
    }

    // ---------- 预渲染背景 ----------
    prerender() {
      const g = this, lowQ = CF.Save.data.settings.quality === 'low', sc = lowQ ? 0.5 : 1;
      const cv = document.createElement('canvas'); cv.width = Math.ceil(g.W * sc); cv.height = Math.ceil(g.H * sc);
      const x = cv.getContext('2d'); x.scale(sc, sc);
      x.fillStyle = '#0c0a16'; x.fillRect(0, 0, g.W, g.H);
      const rnd = CF.rng(CF.hashStr(g.L.id || 'x'));
      // 网格
      x.strokeStyle = '#15122266'; x.lineWidth = 1;
      for (let i = 0; i <= g.cols; i++) { x.beginPath(); x.moveTo(i * CELL, 0); x.lineTo(i * CELL, g.H); x.stroke(); }
      for (let j = 0; j <= g.rows; j++) { x.beginPath(); x.moveTo(0, j * CELL); x.lineTo(g.W, j * CELL); x.stroke(); }
      // 电路走线
      for (let k = 0; k < (g.W * g.H) / 16000; k++) {
        let px = Math.floor(rnd() * g.cols) * CELL, py = Math.floor(rnd() * g.rows) * CELL;
        x.strokeStyle = rnd() < 0.12 ? '#33255f' : '#1b1630'; x.lineWidth = rnd() < 0.2 ? 2.5 : 1.2;
        x.beginPath(); x.moveTo(px, py);
        for (let s = 0; s < 3 + rnd() * 4; s++) { const dir = Math.floor(rnd() * 4), len = (1 + Math.floor(rnd() * 3)) * CELL; px += [len, 0, -len, 0][dir]; py += [0, len, 0, -len][dir]; x.lineTo(px, py); }
        x.stroke();
        x.fillStyle = '#2c2152'; x.fillRect(px - 3, py - 3, 6, 6);
      }
      // 数据断崖
      for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) {
        if (!g.block[cy * g.cols + cx]) continue;
        const X = cx * CELL, Y = cy * CELL;
        x.fillStyle = '#030206'; x.fillRect(X, Y, CELL, CELL);
        x.fillStyle = rnd() < 0.5 ? '#ff4f9a14' : '#29e0e010';
        x.font = '12px ui-monospace,monospace';
        for (let k = 0; k < 2; k++) x.fillText(GLYPH[Math.floor(rnd() * GLYPH.length)], X + rnd() * 30, Y + 10 + rnd() * 28);
        const edge = (dx, dy) => !g.block[(cy + dy) * g.cols + cx + dx] && g.walk(cx + dx, cy + dy);
        x.fillStyle = '#ff4f9a';
        if (edge(0, -1)) x.fillRect(X, Y, CELL, 2);
        if (edge(0, 1)) { x.fillStyle = '#29e0e0'; x.fillRect(X, Y + CELL - 2, CELL, 2); x.fillStyle = '#ff4f9a'; }
        if (edge(-1, 0)) x.fillRect(X, Y, 2, CELL);
        if (edge(1, 0)) { x.fillStyle = '#29e0e0'; x.fillRect(X + CELL - 2, Y, 2, CELL); x.fillStyle = '#ff4f9a'; }
      }
      if (g.L.route) { x.strokeStyle = '#6fdc8c33'; x.setLineDash([10, 10]); x.lineWidth = 3; x.beginPath(); x.moveTo(g.L.proto[0], g.L.proto[1]); g.L.route.forEach(([a, b]) => x.lineTo(a, b)); x.stroke(); x.setLineDash([]); const [ex, ey] = g.L.route[g.L.route.length - 1]; x.strokeStyle = '#6fdc8c'; x.lineWidth = 3; x.strokeRect(ex - 40, ey - 40, 80, 80); x.fillStyle = '#6fdc8c'; x.font = 'bold 14px sans-serif'; x.fillText('发射台', ex - 22, ey + 60); }
      g.bg = cv; g.bgScale = sc;
      // 小地图底图
      const mm = document.createElement('canvas'); mm.width = 320; mm.height = 200; const m = mm.getContext('2d');
      const s = Math.min(320 / g.W, 200 / g.H); g.mmS = s; g.mmOx = (320 - g.W * s) / 2; g.mmOy = (200 - g.H * s) / 2;
      m.fillStyle = '#06050b'; m.fillRect(0, 0, 320, 200); m.fillStyle = '#100d1c'; m.fillRect(g.mmOx, g.mmOy, g.W * s, g.H * s);
      m.fillStyle = '#2a1030';
      for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) if (g.block[cy * g.cols + cx]) m.fillRect(g.mmOx + cx * CELL * s, g.mmOy + cy * CELL * s, CELL * s + 0.5, CELL * s + 0.5);
      g.mmBg = mm;
    }

    // ---------- 渲染 ----------
    render(ctx, dpr) {
      const g = this, c = g.cam, t = performance.now() / 1000;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#050409'; ctx.fillRect(0, 0, g.vw * dpr, g.vh * dpr);
      const sh = g.shake > 0 ? (Math.random() - 0.5) * 8 * g.shake : 0;
      ctx.setTransform(dpr * c.z, 0, 0, dpr * c.z, (-c.x * c.z + sh) * dpr, (-c.y * c.z + sh) * dpr);
      const vx0 = Math.max(0, c.x), vy0 = Math.max(0, c.y), vx1 = Math.min(g.W, c.x + g.viewW()), vy1 = Math.min(g.H, c.y + g.viewH());
      if (vx1 > vx0 && vy1 > vy0) ctx.drawImage(g.bg, vx0 * g.bgScale, vy0 * g.bgScale, (vx1 - vx0) * g.bgScale, (vy1 - vy0) * g.bgScale, vx0, vy0, vx1 - vx0, vy1 - vy0);
      // 资源点
      for (const n of g.nodes) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 2 + n.x);
        ctx.fillStyle = n.type === 'chip' ? `rgba(233,185,73,${0.12 + 0.1 * pulse})` : `rgba(63,208,201,${0.12 + 0.1 * pulse})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, TAU); ctx.fill();
        ctx.fillStyle = n.type === 'chip' ? COLS.chip : COLS.corp;
        if (n.type === 'chip') for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.3; ctx.save(); ctx.translate(n.x + Math.cos(a) * 14, n.y + Math.sin(a) * 14); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore(); }
        else { ctx.font = '12px ui-monospace,monospace'; for (let k = 0; k < 4; k++) ctx.fillText('文语料字'[k], n.x - 18 + k * 10, n.y + 4 + Math.sin(t * 3 + k) * 6); }
      }
      // 建造范围
      if (g.build) {
        ctx.strokeStyle = '#9b7bff33'; ctx.fillStyle = '#9b7bff0a'; ctx.setLineDash([6, 6]);
        g.ents.forEach((e) => { if (e.team === 0 && e.kind === 'b' && e.done && e.type !== 'ctx') { ctx.beginPath(); ctx.arc(e.x, e.y, e.type === 'radar' ? 460 : e.type === 'core' ? 340 : 260, 0, TAU); ctx.fill(); ctx.stroke(); } });
        ctx.setLineDash([]);
      }
      // 选中圈与射程
      for (const id of g.sel) { const e = g.get(id); if (!e) continue; ctx.strokeStyle = e.team === 0 ? '#6fdc8c' : COLS.foe; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(e.x, e.y + (e.air ? 4 : e.r * 0.3), e.r + 5, (e.r + 5) * 0.6, 0, 0, TAU); ctx.stroke(); ctx.lineWidth = 1; if (e.kind === 'b' && (e.range || (e.def.atk && e.def.atk.range))) { ctx.strokeStyle = '#ffffff18'; ctx.beginPath(); ctx.arc(e.x, e.y, e.range || e.def.atk.range, 0, TAU); ctx.stroke(); } if (e.kind === 'b' && e.def.trains && e.team === 0) { ctx.strokeStyle = '#6fdc8c55'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.rally.x, e.rally.y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#6fdc8c'; ctx.fillRect(e.rally.x - 3, e.rally.y - 10, 2, 12); ctx.fillRect(e.rally.x - 1, e.rally.y - 10, 7, 5); } }
      // 实体
      const vis = g.ents.filter((e) => !e.dead && g.onScreen(e.x, e.y));
      vis.filter((e) => !e.air).sort((a, b) => a.y - b.y).forEach((e) => (e.kind === 'b' ? g.drawB(ctx, e, t) : g.drawU(ctx, e, t)));
      vis.filter((e) => e.air).forEach((e) => { ctx.fillStyle = '#0008'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 16, e.r, e.r * 0.4, 0, 0, TAU); ctx.fill(); });
      vis.filter((e) => e.air).forEach((e) => g.drawU(ctx, e, t));
      // 弹道
      for (const p of g.proj) { ctx.fillStyle = p.c; const s = p.big ? 6 : 4; ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); ctx.globalAlpha = 0.4; ctx.fillRect(p.x - s, p.y - s / 4, s * 2, s / 2); ctx.globalAlpha = 1; }
      // 特效
      for (const f of g.fx) {
        if (f.t < 0) continue;
        if (f.k === 'ring') {
          const a = 1 - f.t / 0.6;
          if (f.pixel) { const cs = 10, n = Math.max(12, Math.floor((f.r * TAU) / cs)); ctx.fillStyle = f.c; ctx.globalAlpha = a; for (let i = 0; i < n; i++) { const an = (i / n) * TAU; const px = Math.round((f.x + Math.cos(an) * f.r) / cs) * cs, py = Math.round((f.y + Math.sin(an) * f.r) / cs) * cs; ctx.fillRect(px - cs / 2 + 1, py - cs / 2 + 1, cs - 2, cs - 2); } ctx.globalAlpha = a * 0.15; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
          else { ctx.strokeStyle = f.c; ctx.globalAlpha = a; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.stroke(); ctx.lineWidth = 1; ctx.globalAlpha = 1; }
        } else if (f.k === 'boom') { const a = 1 - f.t / 0.35; ctx.fillStyle = f.c; ctx.globalAlpha = a * 0.35; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + f.t * 2), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      }
      for (const p of g.parts) { ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = p.c; if (p.note) CF.PixelFX.drawPattern(ctx, CF.PixelFX.NOTES[Math.abs(p.x | 0) % 4], p.x, p.y, 2, p.c); else ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
      ctx.globalAlpha = 1;
      // 建造虚影
      if (g.build) { const b = g.build, d = BT[b.type], x = b.ok ? b.sx : b.x, y = b.ok ? b.sy : b.y; ctx.globalAlpha = 0.55; g.drawB(ctx, { type: b.type, x, y, r: d.r, def: d, done: true, hp: 1, maxHp: 1, team: 0, ang: 0, queue: [] }, t); ctx.globalAlpha = 1; ctx.strokeStyle = b.ok ? '#6fdc8c' : '#ff5d6c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, d.r + 6, 0, TAU); ctx.stroke(); ctx.lineWidth = 1; if (d.atk) { ctx.strokeStyle = '#ffffff22'; ctx.beginPath(); ctx.arc(x, y, d.atk.range, 0, TAU); ctx.stroke(); } }
      // 框选
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (g.box) { const { x0, y0, x1, y1 } = g.box; ctx.strokeStyle = '#6fdc8c'; ctx.fillStyle = '#6fdc8c14'; ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0)); }
      if (g.amove) { ctx.fillStyle = '#ff5d6c'; ctx.font = '12px sans-serif'; ctx.fillText('攻击移动：点击目标位置（右键取消）', 12, g.vh - 12); }
    }
    hpBar(ctx, e, w) {
      if (e.hp >= e.maxHp && !this.sel.includes(e.id)) return;
      const y = e.y - e.r - (e.air ? 22 : 10), p = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = '#000a'; ctx.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 5);
      ctx.fillStyle = e.team === 0 ? (p > 0.5 ? '#6fdc8c' : p > 0.25 ? '#e9b949' : '#ff5d6c') : COLS.foe;
      ctx.fillRect(e.x - w / 2, y, w * p, 3);
    }
    drawB(ctx, b, t) {
      const { x, y, r } = b;
      const flash = b.hit > 0;
      ctx.save();
      if (!b.done) ctx.globalAlpha *= 0.55;
      switch (b.type) {
        case 'core': {
          ctx.fillStyle = '#1d1530'; ctx.strokeStyle = COLS.me; ctx.lineWidth = 3;
          ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.translate(x, y); ctx.rotate(t * 0.6); ctx.fillStyle = COLS.me;
          const k = 1 + this.beat * 0.15;
          for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.fillRect(-2.5, -r * 0.62 * k, 5, r * 0.42 * k); }
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
          break;
        }
        case 'miner': {
          const col = b.node && b.node.type === 'corp' ? COLS.corp : COLS.chip;
          ctx.fillStyle = '#1a1626'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeRect(x - r, y - r, r * 2, r * 2);
          ctx.translate(x, y); ctx.rotate(b.done ? t * 3 : 0); ctx.fillStyle = col; ctx.fillRect(-r * 0.7, -3, r * 1.4, 6); ctx.fillRect(-3, -r * 0.7, 6, r * 1.4);
          break;
        }
        case 'turret': {
          ctx.fillStyle = '#1a1626'; ctx.strokeStyle = COLS.me; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.translate(x, y); ctx.rotate(b.ang); ctx.fillStyle = '#b3abea'; ctx.fillRect(0, -4, r + 8, 8); ctx.fillStyle = COLS.me; ctx.fillRect(-6, -6, 12, 12);
          break;
        }
        case 'barrier': {
          ctx.fillStyle = '#2a2340'; ctx.fillRect(x - r, y - r * 0.75, r * 2, r * 1.5);
          ctx.fillStyle = COLS.me; for (let i = 0; i < 4; i++) ctx.fillRect(x - r + 3 + i * 9, y - r * 0.75 + 3, 5, r * 1.5 - 6);
          ctx.strokeStyle = '#ffffff22'; ctx.strokeRect(x - r, y - r * 0.75, r * 2, r * 1.5);
          break;
        }
        case 'repair': {
          ctx.fillStyle = '#132a20'; ctx.strokeStyle = '#6fdc8c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#6fdc8c'; ctx.fillRect(x - 3, y - r * 0.6, 6, r * 1.2); ctx.fillRect(x - r * 0.6, y - 3, r * 1.2, 6);
          if (b.done) { ctx.strokeStyle = `rgba(111,220,140,${0.3 * (1 - (t % 1))})`; ctx.beginPath(); ctx.arc(x, y, r + (t % 1) * 30, 0, TAU); ctx.stroke(); }
          break;
        }
        case 'radar': {
          ctx.fillStyle = '#1a1626'; ctx.strokeStyle = COLS.comp; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.translate(x, y); ctx.rotate(t * 1.5); ctx.strokeStyle = COLS.comp; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 0.65, -0.8, 0.8); ctx.stroke(); ctx.fillStyle = '#9b7bff44'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 1.6, -0.25, 0.25); ctx.fill();
          break;
        }
        case 'workshop': case 'port': {
          const col = b.type === 'port' ? COLS.corp : COLS.me;
          ctx.fillStyle = '#1a1626'; ctx.strokeStyle = col; ctx.lineWidth = 2;
          if (b.type === 'port') { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = col; ctx.font = `bold ${r}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('H', x, y + r * 0.35); ctx.textAlign = 'left'; }
          else { ctx.fillRect(x - r, y - r * 0.8, r * 2, r * 1.6); ctx.strokeRect(x - r, y - r * 0.8, r * 2, r * 1.6); ctx.fillStyle = col; ctx.font = `bold ${r * 0.7}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText('</>', x, y + r * 0.25); ctx.textAlign = 'left'; }
          if (b.queue && b.queue.length) { const q = b.queue[0]; ctx.fillStyle = '#000a'; ctx.fillRect(x - r, y + r * 0.9, r * 2, 4); ctx.fillStyle = COLS.me; ctx.fillRect(x - r, y + r * 0.9, r * 2 * (1 - q.t / q.total), 4); }
          break;
        }
        case 'ctx': {
          ctx.translate(x, y + Math.sin(t * 2 + x) * 3);
          ctx.fillStyle = '#0f2a30'; ctx.strokeStyle = COLS.corp; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = COLS.corp; ctx.font = 'bold 10px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText('CTX', 0, 4); ctx.textAlign = 'left';
          break;
        }
        case 'gcore': {
          ctx.translate(x, y);
          for (let k = 0; k < 2; k++) {
            ctx.save(); ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4); ctx.rotate(k ? -t * 0.4 : t * 0.3);
            ctx.fillStyle = k ? '#29e0e022' : '#2a0b1e'; ctx.strokeStyle = k ? COLS.foe2 : COLS.foe; ctx.lineWidth = 3;
            ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
          }
          ctx.fillStyle = COLS.foe; ctx.font = `bold ${r * 0.8}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.fillText(GLYPH[Math.floor(t * 6) % GLYPH.length], 0, r * 0.28); ctx.textAlign = 'left';
          break;
        }
        case 'gtower': {
          ctx.fillStyle = '#2a0b1e'; ctx.strokeStyle = COLS.foe; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y + r * 0.7); ctx.lineTo(x - r, y + r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = COLS.foe2; ctx.fillRect(x - 3 + (Math.random() - 0.5) * 2, y - 4, 6, 6);
          break;
        }
      }
      ctx.restore();
      if (flash) { ctx.fillStyle = '#ffffff40'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
      if (!b.done && b.prog !== undefined) { ctx.strokeStyle = '#e9b949'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * b.prog); ctx.stroke(); ctx.lineWidth = 1; }
      if (b.id) this.hpBar(ctx, b, Math.max(30, r * 1.6));
    }
    drawU(ctx, u, t) {
      const { x, y, r } = u, D = CF.PixelFX.drawClawd;
      const fl = u.hit > 0;
      const ay = u.air ? y - 10 + Math.sin(t * 4 + u.id) * 2 : y;
      ctx.save();
      switch (u.type) {
        case 'claude': {
          const px = 2.6, s = this.strum > 0 || (this.beat > 0.6);
          ctx.translate(x, ay); if (u.face < 0) ctx.scale(-1, 1);
          if (u.buff > 0 || this.strum > 0.3) { ctx.fillStyle = '#9b7bff33'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill(); }
          D(ctx, -10 * px, -6 * px, px, { bob: this.beat > 0.7 ? -1 : 0, strum: s ? 1 : 0, blink: this.strum > 0.4, lean: this.strum > 0.45 ? 1 : 0, tint: fl ? '#ffffff' : undefined });
          break;
        }
        case 'scout': case 'coder': case 'refactor': {
          const px = { scout: 1.25, coder: 1.5, refactor: 2.1 }[u.type];
          const tint = fl ? '#fff' : { scout: '#f0a080', coder: '#d97757', refactor: '#b0603f' }[u.type];
          ctx.translate(x, y); if (u.face < 0) ctx.scale(-1, 1);
          D(ctx, -6.5 * px, -6 * px, px, { noGuitar: true, tint, tintD: '#9c4e33', walk: Math.hypot(u.vx, u.vy) > 10, step: Math.floor(u.step) });
          ctx.fillStyle = '#b3abea';
          if (u.type === 'scout') { ctx.fillRect(2 * px, -9 * px, px, 3 * px); ctx.fillRect(2 * px, -9 * px, 3 * px, px); }
          if (u.type === 'coder') { ctx.fillRect(-4 * px, -1 * px, 8 * px, px); }
          if (u.type === 'refactor') { ctx.fillStyle = '#2b2641'; ctx.fillRect(-7 * px, -2 * px, 14 * px, 3 * px); ctx.fillStyle = '#e9b949'; ctx.fillRect(5 * px, -3 * px, 3 * px, 2 * px); }
          break;
        }
        case 'interceptor': case 'bomber': {
          const s = u.type === 'bomber' ? 1.3 : 1;
          ctx.translate(x, ay); ctx.scale(s, s);
          ctx.fillStyle = fl ? '#fff' : COLS.me; ctx.fillRect(-9, -4, 18, 8);
          ctx.fillStyle = '#1b1226'; ctx.fillRect(-5, -2, 2, 2); ctx.fillRect(3, -2, 2, 2);
          const sp = Math.floor(t * 30 + u.id) % 2;
          ctx.fillStyle = '#b3abea'; [[-14, -7], [8, -7], [-14, 5], [8, 5]].forEach(([a, b]) => ctx.fillRect(a, b, sp ? 6 : 3, 2));
          ctx.fillStyle = '#5e54b0'; ctx.fillRect(-12, -5, 2, 10); ctx.fillRect(10, -5, 2, 10);
          if (u.type === 'bomber') { ctx.fillStyle = '#e9b949'; ctx.fillRect(-3, 4, 6, 4); }
          break;
        }
        case 'proto': {
          ctx.translate(x, y);
          ctx.fillStyle = fl ? '#fff' : '#cfc8f2'; ctx.fillRect(-16, -22, 32, 26);
          ctx.fillStyle = COLS.me; ctx.fillRect(-12, -16, 24, 7);
          ctx.fillStyle = '#1b1226'; ctx.fillRect(-8, -14, 4, 3); ctx.fillRect(4, -14, 4, 3);
          ctx.fillStyle = '#5e54b0'; ctx.fillRect(-18, 4, 36, 6);
          const w = Math.floor(t * 8) % 2; ctx.fillStyle = '#2b2641'; for (let i = 0; i < 4; i++) ctx.fillRect(-16 + i * 9 + w, 10, 6, 6);
          if (u.escort) { ctx.strokeStyle = '#6fdc8c66'; ctx.beginPath(); ctx.arc(0, 0, 240, 0, TAU); ctx.stroke(); }
          ctx.fillStyle = '#ede6d6'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(u.escort ? '前进中' : '等待护送', 0, -30); ctx.textAlign = 'left';
          break;
        }
        default: this.drawFoe(ctx, u, x, ay, r, t, fl);
      }
      ctx.restore();
      this.hpBar(ctx, u, Math.max(22, r * 2));
      if (u.def.boss) { ctx.fillStyle = COLS.foe; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(u.def.name, x, ay - r - 18); ctx.textAlign = 'left'; }
    }
    drawFoe(ctx, u, x, y, r, t, fl) {
      const j = () => (Math.random() - 0.5) * 2.5;
      ctx.translate(x, y);
      const pk = fl ? '#fff' : COLS.foe, cy = COLS.foe2;
      switch (u.type) {
        case 'bug': ctx.fillStyle = cy; ctx.fillRect(-r + 2 + j(), -r * 0.7, r * 2 - 2, r * 1.4); ctx.fillStyle = pk; ctx.fillRect(-r, -r * 0.7 + j(), r * 2 - 2, r * 1.4); ctx.fillStyle = '#1b1226'; ctx.fillRect(-4, -3, 2, 2); ctx.fillRect(3, -3, 2, 2); ctx.fillStyle = pk; const s = Math.floor(t * 10 + u.id) % 2; ctx.fillRect(-r, r * 0.7, 2, s ? 3 : 2); ctx.fillRect(r - 3, r * 0.7, 2, s ? 2 : 3); break;
        case 'noise': ctx.rotate(Math.PI / 4); ctx.fillStyle = cy; ctx.fillRect(-r * 0.75 + 2, -r * 0.75 + j(), r * 1.5, r * 1.5); ctx.fillStyle = pk; ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5); ctx.rotate(-Math.PI / 4); ctx.fillStyle = '#1b1226'; ctx.font = 'bold 10px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(GLYPH[(Math.floor(t * 8) + u.id) % GLYPH.length], 0, 4); break;
        case 'titan': ctx.fillStyle = cy; ctx.fillRect(-r + 3 + j(), -r, r * 2, r * 2); ctx.fillStyle = pk; ctx.fillRect(-r, -r + j(), r * 2, r * 2); ctx.fillStyle = '#1b1226'; ctx.font = `bold ${r}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('幻', 0, r * 0.35); ctx.fillStyle = '#ffffff55'; ctx.fillRect(-r, -r + ((t * 40) % (r * 2)), r * 2, 2); break;
        case 'bat': { const f = Math.sin(t * 14 + u.id) * 5; ctx.fillStyle = cy; ctx.beginPath(); ctx.moveTo(-r - 4, -4 + f); ctx.lineTo(0, 4); ctx.lineTo(r + 4, -4 + f); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill(); ctx.fillStyle = pk; ctx.fillRect(-3, -3, 6, 6); break; }
        case 'forget': {
          ctx.rotate(t * 0.8);
          for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.fillStyle = i % 2 ? pk : cy; ctx.font = 'bold 14px ui-monospace,monospace'; ctx.fillText(GLYPH[(i + Math.floor(t * 4)) % GLYPH.length], r * 0.7, 4); }
          ctx.rotate(-t * 0.8); ctx.fillStyle = '#2a0b1e'; ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, TAU); ctx.fill(); ctx.fillStyle = pk; ctx.beginPath(); ctx.arc(0, 0, r * 0.25 + Math.sin(t * 5) * 2, 0, TAU); ctx.fill();
          break;
        }
        case 'carrier': ctx.fillStyle = cy; ctx.fillRect(-r * 1.3 + 3, -r * 0.5 + j(), r * 2.6, r); ctx.fillStyle = '#2a0b1e'; ctx.fillRect(-r * 1.3, -r * 0.5, r * 2.6, r); ctx.strokeStyle = pk; ctx.lineWidth = 2; ctx.strokeRect(-r * 1.3, -r * 0.5, r * 2.6, r); for (let i = 0; i < 5; i++) { ctx.fillStyle = (Math.floor(t * 3) + i) % 2 ? pk : cy; ctx.fillRect(-r + i * r * 0.45, -4, 6, 8); } break;
        case 'entropy':
          for (let i = 0; i < 6; i++) { ctx.save(); ctx.rotate(t * (i % 2 ? 0.6 : -0.9) + i); ctx.fillStyle = i % 2 ? pk : cy; ctx.fillRect(r * 0.6, -4, r * 0.6, 8); ctx.restore(); }
          ctx.fillStyle = '#2a0b1e'; ctx.fillRect(-r * 0.6 + j(), -r * 0.6, r * 1.2, r * 1.2); ctx.strokeStyle = pk; ctx.lineWidth = 2; ctx.strokeRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2); ctx.fillStyle = pk; ctx.font = `bold ${r * 0.7}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('熵', 0, r * 0.25);
          break;
      }
      ctx.textAlign = 'left';
    }
    renderMini(m) {
      const g = this, s = g.mmS, ox = g.mmOx, oy = g.mmOy;
      m.drawImage(g.mmBg, 0, 0);
      for (const n of g.nodes) { m.fillStyle = n.type === 'chip' ? COLS.chip : COLS.corp; m.fillRect(ox + n.x * s - 2, oy + n.y * s - 2, 4, 4); }
      for (const e of g.ents) { if (e.dead) continue; m.fillStyle = e.team === 0 ? (e.type === 'claude' ? '#fff' : COLS.me) : COLS.foe; const k = e.kind === 'b' ? 4 : e.def.boss ? 6 : 2.5; m.fillRect(ox + e.x * s - k / 2, oy + e.y * s - k / 2, k, k); }
      m.strokeStyle = '#ede6d6'; m.lineWidth = 1; m.strokeRect(ox + g.cam.x * s, oy + g.cam.y * s, g.viewW() * s, g.viewH() * s);
    }
  }

  CF.Game = { Game, BT, UT, BUILD_ORDER, TRAIN_KEY, canPay, costHtml, current: null };
})();
