/* 英雄技能：属性、被动、Q/W/R 的实现（依赖 game.js 提供的 ring/shot/field/buff/later 等原语） */
(function () {
  const CF = window.CF;
  const TAU = Math.PI * 2;

  // 基础属性（沉浸模式下会随等级成长）
  const STATS = {
    xs: { hp: 650, dmg: 20, range: 160, rate: 0.6, speed: 100 },
    omni: { hp: 560, dmg: 18, range: 190, rate: 0.7, speed: 95 },
    twin: { hp: 520, dmg: 14, range: 170, rate: 0.6, speed: 105 },
    riot: { hp: 820, dmg: 26, range: 40, rate: 0.55, speed: 115, melee: true },
    llama: { hp: 950, dmg: 16, range: 150, rate: 0.8, speed: 90, armor: 5 },
    abyss: { hp: 600, dmg: 22, range: 180, rate: 0.8, speed: 90 },
    luna: { hp: 480, dmg: 24, range: 260, rate: 0.9, speed: 105 },
    pearl: { hp: 520, dmg: 10, range: 200, rate: 0.35, speed: 100 },
    bun: { hp: 700, dmg: 14, range: 150, rate: 0.7, speed: 100 },
  };
  const ICON = { xs: ['🎸', '🎵', '🌅'], omni: ['🎹', '🦶', '🎼'], twin: ['🌌', '🛡️', '♊'], riot: ['🥁', '💥', '⚡'], llama: ['🌬️', '🧶', '🦙'], abyss: ['🌊', '🌀', '🐋'], luna: ['🏹', '🌑', '🌕'], pearl: ['🤌', '🍽️', '🎯'], bun: ['📯', '🧺', '🐦'] };

  const S = (CF.Skills = { STATS, ICON });
  const lvMul = (h, k) => 1 + 0.25 * (((h.skillLv && h.skillLv[k]) || 1) - 1);
  S.cost = (h, sk) => Math.round(sk.cost * (h.heroId === 'abyss' ? 0.7 : 1));
  // 鲸歌「深度思考」：每层 +35% 伤害，施放后清空
  function think(g, h) { if (h.heroId !== 'abyss') return 1; const n = h.think || 0; h.think = 0; if (n) g.say('HERO', `深度思考 ×${n}`); return 1 + 0.35 * n; }

  S.cast = function (g, h, key, tx, ty) {
    const P = h.heroDef.pal, m = lvMul(h, key), id = h.heroId;
    const ang = Math.atan2(ty - h.y, tx - h.x), dx = Math.cos(ang), dy = Math.sin(ang);
    const K = id + key;
    switch (K) {
      // ---------- X-S ----------
      case 'xsQ': g.ring(h.x, h.y, 200, 120 * m * g.bonus.riffMul, h, { knock: 46, c: P.instL, pixel: true }); g.ring(h.x, h.y, 140, 0, h, { c: P.inst, pixel: true, delay: 0.12 }); g.notes(h, 14); g.shake = 0.3; return true;
      case 'xsW': g.allies(h.x, h.y, 230).forEach((e) => { g.heal(e, 150 * m); g.buff(e, 'haste', 6, 0.4); }); g.ring(h.x, h.y, 230, 0, h, { c: '#7ee081' }); g.notes(h, 10); return true;
      case 'xsR': for (let i = 0; i < 12; i++) g.later(i * 0.5, () => { if (!h.dead) { g.ring(h.x, h.y, 220, 70 * m, h, { c: i % 2 ? P.instL : P.accent, pixel: true }); g.strum = 0.4; g.notes(h, 4); } });
        g.later(6.1, () => { if (!h.dead) { g.ring(h.x, h.y, 320, 200 * m, h, { c: '#ffb14a', pixel: true, knock: 60 }); g.flash('#ff9a5c'); g.shake = 0.5; } }); return true;
      // ---------- 万象 ----------
      case 'omniQ': for (let i = 0; i < 8; i++) { const a = ang - 0.44 + (i / 7) * 0.88; g.shot({ src: h, x: h.x, y: h.y, dx: Math.cos(a), dy: Math.sin(a), speed: 620, range: 380, w: 16, dmg: 50 * m, pierce: 2, c: i % 2 ? P.dark : P.white, glyph: 'key', delay: i * 0.03 }); } return true;
      case 'omniW': g.field({ x: tx, y: ty, r: 180, dur: 5, team: 0, c: P.em, kind: 'pedal', tick: (f, dt) => { g.enemiesIn(f.x, f.y, f.r).forEach((e) => g.buff(e, 'slow', 0.3, 0.4)); g.allies(f.x, f.y, f.r).forEach((e) => g.buff(e, 'haste', 0.3, 0.25)); } }); return true;
      case 'omniR': g.field({ x: tx, y: ty, r: 260, dur: 4, team: 0, c: P.white, kind: 'rain', every: 0.1, tick: (f) => { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * f.r; g.ring(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, 44, 45 * m, h, { c: Math.random() < 0.5 ? P.white : P.em, pixel: true, small: true }); } }); return true;
      // ---------- 双子 ----------
      case 'twinQ': g.beam(h, h.x, h.y, dx, dy, 440, 40, 110 * m, P.blue, P.pink); return true;
      case 'twinW': g.allies(h.x, h.y, 240).forEach((e) => g.buff(e, 'shield', 6, 180 * m)); g.ring(h.x, h.y, 240, 0, h, { c: P.pink }); return true;
      case 'twinR': { const c = g.spawnHero(h.x + 30, h.y + 10, { clone: true, life: 10, mul: 0.7 }); c.cloneOf = h.id; g.ring(h.x, h.y, 120, 0, h, { c: P.pink, pixel: true }); return true; }
      // ---------- 狂想 ----------
      case 'riotQ': g.dash(h, tx, ty, 320, 90 * m, 0.5, P.red); return true;
      case 'riotW': g.ring(h.x, h.y, 170, 80 * m, h, { stun: 1.2, c: P.red, pixel: true }); g.shake = 0.35; return true;
      case 'riotR': g.buff(h, 'frenzy', 7, 1); g.buff(h, 'haste', 7, 1.0); g.flash('#ff2d55'); return true;
      // ---------- 羊驼 ----------
      case 'llamaQ': g.cone(h, ang, 1.22, 260, 70 * m, { knock: 80, c: P.wool }); return true;
      case 'llamaW': g.buff(h, 'shield', 6, 400 * m); g.allies(h.x, h.y, 200).forEach((e) => e !== h && g.buff(e, 'shield', 6, 150 * m)); g.ring(h.x, h.y, 200, 0, h, { c: P.wool }); return true;
      case 'llamaR': for (let i = 0; i < 8; i++) { const off = (i - 3.5) * 26; g.shot({ src: h, x: h.x - dx * 60 - dy * off, y: h.y - dy * 60 + dx * off, dx, dy, speed: 420, range: 760, w: 26, dmg: 60 * m, pierce: 99, knock: 40, c: P.wool, glyph: 'llama', delay: i * 0.06 }); } return true;
      // ---------- 鲸歌 ----------
      case 'abyssQ': { const k = think(g, h); g.shot({ src: h, x: h.x, y: h.y, dx, dy, speed: 520, range: 540, w: 50, dmg: 100 * m * k, pierce: 99, c: P.spout, glyph: 'wave' }); return true; }
      case 'abyssW': { const k = think(g, h); g.field({ x: tx, y: ty, r: 170, dur: 4, team: 0, c: P.spout, kind: 'whirl', tick: (f, dt) => { g.enemiesIn(f.x, f.y, f.r).forEach((e) => { if (e.kind !== 'u' || e.def.boss) return; const a2 = Math.atan2(f.y - e.y, f.x - e.x); e.x += Math.cos(a2) * 60 * dt; e.y += Math.sin(a2) * 60 * dt; g.damage(e, 28 * m * k * dt, h); }); } }); return true; }
      case 'abyssR': { const k = think(g, h); g.field({ x: tx, y: ty, r: 240, dur: 1.2, team: 0, c: '#0a0f2e', kind: 'shadow' }); g.later(1.2, () => { g.ring(tx, ty, 240, 380 * m * k, h, { stun: 1.5, c: P.spout, pixel: true }); g.fx.push({ k: 'whale', x: tx, y: ty, t: 0, c: P.blue }); g.shake = 0.6; }); return true; }
      // ---------- 月弦 ----------
      case 'lunaQ': g.shot({ src: h, x: h.x, y: h.y, dx, dy, speed: 900, range: 720, w: 22, dmg: 90 * m, pierce: 99, marks: 2, c: '#eef2ff', glyph: 'moon' }); return true;
      case 'lunaW': g.buff(h, 'stealth', 4, 1); g.buff(h, 'speed', 4, 0.4); h.empower = 3; return true;
      case 'lunaR': { let n = 0; g.ents.forEach((e) => { if (e.team === 1 && !e.dead && e.st && e.st.marks > 0) { n++; const d = (60 + 50 * e.st.marks) * m; g.fx.push({ k: 'moonbeam', x: e.x, y: e.y, t: 0 }); g.damage(e, d, h); e.st.marks = 0; } }); g.flash('#c9d4ff'); if (!n) CF.toast('没有被「记住」的敌人——先用攻击和月光弓叠记忆'); return true; }
      // ---------- 珠问 ----------
      case 'pearlQ': g.buff(h, 'rapid', 2.5, 4); return true;
      case 'pearlW': { const j = g.addB('jade', 0, tx, ty, true); j.life = 12; return true; }
      case 'pearlR': for (let i = 0; i < 50; i++) g.later(i * 0.05, () => { const a = (i % 10) / 10 * TAU, sx = tx + Math.cos(a) * 420, sy = ty + Math.sin(a) * 420, r = Math.random() * 200, b = Math.random() * TAU; const ex = tx + Math.cos(b) * r, ey = ty + Math.sin(b) * r, l = Math.hypot(ex - sx, ey - sy); g.shot({ src: h, x: sx, y: sy, dx: (ex - sx) / l, dy: (ey - sy) / l, speed: 760, range: l + 20, w: 18, dmg: 40 * m, pierce: 1, c: i % 3 ? P.pearl : P.gold, glyph: 'pearl' }); }); return true;
      // ---------- 团团 ----------
      case 'bunQ': g.cone(h, ang, 1.57, 220, 60 * m, { knock: 120, slow: 0.5, c: P.gold }); g.shake = 0.25; return true;
      case 'bunW': for (let i = 0; i < 3; i++) { const u = g.addU('beanie', 0, tx + CF.rand(-20, 20), ty + CF.rand(-20, 20)); u.life = 20; } g.fx.push({ k: 'boom', x: tx, y: ty, r: 50, t: 0, c: '#ffffff' }); return true;
      case 'bunR': g.ents.forEach((e) => { if (e.team === 0 && e.kind === 'u' && !e.dead) { g.buff(e, 'dmgUp', 8, 0.4); g.buff(e, 'speed', 8, 0.3); } }); for (let i = 0; i < 12; i++) g.later(i * 0.08, () => g.shot({ src: h, x: h.x, y: h.y - 10, dx: Math.cos(i), dy: Math.sin(i), speed: 380, range: 1400, w: 16, dmg: 50 * m, pierce: 1, homing: true, c: P.gold, glyph: 'bird' })); g.flash('#ffd34d'); return true;
    }
    return false;
  };

  // 被动：攻击时触发，返回伤害倍率
  S.onAttack = function (g, a, t, atk) {
    let mul = 1;
    if (a.heroId) {
      const id = a.heroId;
      if (id === 'xs') { a.n4 = (a.n4 || 0) + 1; if (a.n4 % 4 === 0) { mul *= 1.8; g.ring(t.x, t.y, 60, atk.dmg * 0.6, a, { c: a.heroDef.pal.accent, small: true }); } }
      if (id === 'omni') { a.key = !a.key; if (a.key) mul *= 1.2; else g.buff(t, 'slow', 1.5, 0.3); }
      if (id === 'twin') g.later(0.12, () => { if (!t.dead && !a.dead) g.proj.push({ x: a.x + 18, y: a.y - 18, tid: t.id, tx: t.x, ty: t.y, sp: 560, dmg: atk.dmg * 0.6, splash: 0, team: 0, src: a.id, c: a.heroDef.pal.pink }); });
      if (id === 'riot') { const st = g.stat(a); st.rage = Math.min(10, (st.rage || 0) + 1); st.rageT = 3; if (st.frenzy > 0) { g.heal(a, atk.dmg * 0.4); g.chain(a, t, 2, 40); } }
      if (id === 'luna') { const st = g.stat(t); st.marks = Math.min(5, (st.marks || 0) + 1); }
      if (id === 'pearl' && Math.random() < 0.3) g.later(0.1, () => { const n = g.near(t.x, t.y, 170, (e) => e.team === 1 && e !== t && !e.dead)[0]; if (n) g.proj.push({ x: t.x, y: t.y, tid: n.id, tx: n.x, ty: n.y, sp: 600, dmg: atk.dmg, splash: 0, team: 0, src: a.id, c: a.heroDef.pal.pearl }); });
      if (a.empower) { mul *= a.empower; a.empower = 0; if (a.st) a.st.stealth = 0; }
    }
    if (a.def.rage) { const st = g.stat(a); st.rage = Math.min(8, (st.rage || 0) + 1); st.rageT = 3; }
    if (a.def.lifesteal) g.heal(a, atk.dmg * a.def.lifesteal);
    return mul;
  };

  // 被动：每帧（光环、思考层、狂热衰减）
  S.tick = function (g, h, dt) {
    const st = g.stat(h);
    if (st.rageT > 0) { st.rageT -= dt; if (st.rageT <= 0) st.rage = 0; }
    h.auraT = (h.auraT || 0) - dt;
    if (h.auraT <= 0) {
      h.auraT = 0.5;
      if (h.heroId === 'llama') g.allies(h.x, h.y, 260).forEach((e) => g.buff(e, 'dmgUp', 0.7, 0.15));
      if (h.heroId === 'bun') g.allies(h.x, h.y, 260).forEach((e) => { g.buff(e, 'haste', 0.7, 0.15); g.buff(e, 'speed', 0.7, 0.15); });
    }
    if (h.heroId === 'abyss') { h.thinkT = (h.thinkT || 0) + dt; if (h.thinkT >= 8) { h.thinkT = 0; h.think = Math.min(3, (h.think || 0) + 1); } }
  };
})();
