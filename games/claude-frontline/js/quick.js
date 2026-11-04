/* 快速模式：90 秒节奏爽局（通勤单手玩，竖屏横屏均可）
 * 设计要点：0 学习成本 · 每 1~3 秒一次正反馈 · 踩拍的「完美」 · 连击称号 · 三选一强化 · FEVER 爆发 · 结尾一张成绩卡 */
(function () {
  const CF = window.CF;
  const $ = CF.$;
  const TAU = Math.PI * 2;
  const Q = (CF.Quick = { on: false });
  const DUR = 90;
  const ETYPE = {
    bug: { hp: 26, r: 9, speed: 95, dmg: 6, xp: 1, score: 10 },
    bat: { hp: 20, r: 10, speed: 135, dmg: 5, xp: 1, score: 12, air: true },
    noise: { hp: 60, r: 11, speed: 70, dmg: 9, xp: 2, score: 20 },
    titan: { hp: 380, r: 21, speed: 46, dmg: 18, xp: 8, score: 120 },
    boss: { hp: 5200, r: 40, speed: 38, dmg: 30, xp: 60, score: 3000, drawAs: 'entropy' },
  };
  const UPS = [
    ['dmg', '⚔', '攻击力', '伤害 +25%', 6], ['rate', '⏩', '攻速', '攻击间隔 -18%', 5], ['proj', '✳', '多重弹', '每次多射一发', 4], ['pierce', '➶', '穿透', '弹道多穿透 1 个敌人', 3],
    ['area', '◎', '范围', '冲击波与技能范围 +20%', 4], ['speed', '👟', '移速', '移动速度 +12%', 3], ['magnet', '🧲', '磁吸', '拾取范围 +45%', 3], ['hp', '❤', '耐久', '最大耐久 +25% 并回满', 3],
    ['crit', '✦', '暴击', '暴击率 +10%（2 倍伤害）', 4], ['orbit', '♪', '环绕音符', '多一颗绕身旋转的音符', 4], ['beat', '🥁', '节拍冲击', '每一拍自动放出冲击波', 4], ['skill', '⟳', '招牌技', '英雄招牌技冷却 -20%', 3], ['steal', '🩸', '吸血', '造成伤害的 2% 回复耐久', 3],
  ];
  const TITLES = [[10, '上头！'], [30, '停不下来！'], [60, '超神！'], [100, '封神！'], [200, '造物者！']];

  let S = null, raf = 0, last = 0, cv, ctx, beatSink = null;
  Q.start = function (heroId) {
    if (!CF.Stamina.spend({ quick: true })) return;
    if (heroId) { CF.Save.data.hero = heroId; CF.Heroes.applyTheme(heroId); }
    CF.UI.show('quick');
    Q.on = true;
    cv = $('#quickCanvas'); ctx = cv.getContext('2d');
    const h = CF.Heroes.current();
    const lvl = CF.City ? CF.City.level('hall') : 0;
    S = {
      h, t: 0, over: false, paused: false, score: 0, kills: 0, combo: 0, maxCombo: 0, comboT: 0, perfects: 0, fever: 0, feverT: 0, slow: 1, slowT: 0, stopT: 0, shake: 0,
      hero: { x: 1200, y: 1200, hp: 300, maxHp: 300, speed: 165, dmg: 14, rate: 0.42, cd: 0, proj: 1, pierce: 1, area: 1, magnet: 90, crit: 0.05, orbit: 0, beatLv: 0, skillCd: 5, skillT: 2, steal: 0, hitT: 0, face: 1, lv: 1, xp: 0, next: 4, ups: {} },
      ens: [], gems: [], shots: [], texts: [], parts: [], waves: [], spawnT: 0, eliteT: 20, bossDone: false, boss: null,
      multi: 0, multiT: 0, packT: 5, joy: null, lastBeat: 0, beatIv: 60 / (CF.Audio.curBpm || 110), pickPitch: 0, pickT: 0, tapCd: 0, lastTitle: 0, startT: performance.now(),
    };
    if (h.power) { S.hero.dmg *= h.power; S.hero.maxHp = S.hero.hp = Math.round(S.hero.maxHp * h.power); }
    { const sm = CF.Roster.starMul(h.id); S.hero.dmg *= sm; S.hero.maxHp = S.hero.hp = Math.round(S.hero.maxHp * sm); }
    if (h.companion) S.hero.drone = { x: 1170, y: 1160, cd: 0.5 };
    if (lvl) { S.hero.dmg *= 1 + lvl * 0.06; CF.toast(`音乐厅 Lv${lvl}：开局攻击 +${lvl * 6}%`, 'gold'); }
    beatSink = { pulse: (s) => { if (s < 0.5 || !S) return; const now = performance.now(); if (S.lastBeat) S.beatIv = CF.lerp(S.beatIv, CF.clamp((now - S.lastBeat) / 1000, 0.25, 1.2), 0.3); S.lastBeat = now; Q.onBeat(s); }, visible: () => false };
    CF.PixelFX.Stage.all.add(beatSink);
    Q.resize(); Q.hud();
    cancelAnimationFrame(raf); last = performance.now();
    const loop = (now) => { raf = requestAnimationFrame(loop); if (!Q.on) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!S.paused && !CF.modal.isOpen()) Q.update(dt); Q.render(); };
    raf = requestAnimationFrame(loop);
    CF.toast('拖动移动 · 踩着节拍点屏幕打出「完美」', 'gold', 3000);
  };
  Q._S = () => S; // 调试用
  Q.stop = function () { Q.on = false; cancelAnimationFrame(raf); if (beatSink) CF.PixelFX.Stage.all.delete(beatSink); beatSink = null; S = null; };
  Q.resize = function () { const dpr = Math.min(2, window.devicePixelRatio || 1); Q.dpr = dpr; Q.w = cv.clientWidth; Q.h = cv.clientHeight; cv.width = Q.w * dpr; cv.height = Q.h * dpr; };

  // ---------- 输入 ----------
  Q.bind = function () {
    const c = $('#quickCanvas');
    let down = null;
    const pt = (e) => { const r = CF.appRect(c), p = CF.appPoint(e.clientX, e.clientY); return { x: p.x - r.left, y: p.y - r.top }; };
    c.addEventListener('pointerdown', (e) => { if (!S) return; CF.Audio.unlock(); try { c.setPointerCapture(e.pointerId); } catch (er) {} const p = pt(e); down = { x: p.x, y: p.y, t: performance.now(), id: e.pointerId, moved: false }; S.joy = { ox: p.x, oy: p.y, dx: 0, dy: 0 }; });
    c.addEventListener('pointermove', (e) => { if (!S || !down || e.pointerId !== down.id) return; const p = pt(e); const dx = p.x - down.x, dy = p.y - down.y, d = Math.hypot(dx, dy); if (d > 12) down.moved = true; const k = Math.min(1, d / 60); S.joy = { ox: down.x, oy: down.y, dx: d ? (dx / d) * k : 0, dy: d ? (dy / d) * k : 0 }; });
    const up = (e) => { if (!S || !down || e.pointerId !== down.id) return; const tap = !down.moved && performance.now() - down.t < 220; down = null; S.joy = null; if (tap) Q.strum(); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    const keys = new Set();
    window.addEventListener('keydown', (e) => { if (CF.UI.cur !== 'quick' || !S || CF.modal.isOpen()) return; const k = e.key.toLowerCase(); if (k === ' ') { Q.strum(); e.preventDefault(); } else if (k === 'e' || k === 'enter') Q.feverGo(); else if (k === 'escape' || k === 'p') Q.pause(); else { keys.add(k); Q.keys = keys; } });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    Q.keys = keys;
    $('#qFever').onclick = () => Q.feverGo();
    $('#qPause').onclick = () => Q.pause();
    window.addEventListener('resize', () => CF.UI.cur === 'quick' && Q.resize());
  };
  Q.pause = function () {
    if (!S) return; S.paused = true;
    CF.modal.open({ title: '暂停', body: `<p class="small muted">当前 ${S.score} 分 · ${CF.fmtTime(DUR - S.t)} 剩余</p>`, foot: [{ text: '退出', cls: 'ghost', onClick: () => { CF.modal.close(); CF.UI.show('lobby'); } }, { text: '继续', cls: 'primary', onClick: () => { CF.modal.close(); } }], onClose: () => { if (S) S.paused = false; } });
  };

  // ---------- 节拍：踩拍判定 ----------
  Q.onBeat = function (s) {
    const H = S.hero;
    S.waves.push({ t: 0, x: H.x, y: H.y, s });
    if (H.beatLv) Q.nova(H.x, H.y, 90 * H.area * (1 + H.beatLv * 0.15), H.dmg * (0.8 + H.beatLv * 0.4), S.h.pal.glow, false);
    if (S.feverT > 0) { Q.nova(H.x, H.y, 200 * H.area, H.dmg * 3, S.h.pal.accent, true); CF.Audio.lick(S.h.id, true); }
  };
  Q.strum = function () {
    if (!S || S.over || S.tapCd > 0) return;
    S.tapCd = 0.22;
    const now = performance.now(), iv = S.beatIv * 1000, off = Math.min(Math.abs(now - S.lastBeat), Math.abs(S.lastBeat + iv - now));
    const H = S.hero, perfect = off < 130;
    if (perfect) { S.perfects++; S.combo += 3; Q.flash(S.h.pal.accent, 0.18); Q.buzz(8); Q.nova(H.x, H.y, 190 * H.area, H.dmg * 3.2, S.h.pal.accent, true); Q.text(H.x, H.y - 46, 'PERFECT', '#ffe08a', 22); S.shake = 0.18; CF.Audio.lick(S.h.id, true); S.fever = Math.min(100, S.fever + 4); }
    else { Q.nova(H.x, H.y, 110 * H.area, H.dmg * 1.2, S.h.pal.glow, false); Q.text(H.x, H.y - 40, 'GOOD', '#ffffffcc', 14); CF.Audio.sfx('chord', 0.4); }
  };
  Q.feverGo = function () {
    if (!S || S.fever < 100 || S.feverT > 0) return;
    S.fever = 0; S.feverT = 6; S.slow = 0.35; S.slowT = 0.5; S.shake = 0.4;
    CF.Audio.sfx('riff'); Q.text(S.hero.x, S.hero.y - 70, 'FEVER!!', S.h.pal.accent, 34);
    Q.nova(S.hero.x, S.hero.y, 320, S.hero.dmg * 6, S.h.pal.accent, true);
  };
  Q.nova = function (x, y, r, dmg, c, big) {
    S.parts.push({ k: 'ring', x, y, r: 0, max: r, t: 0, c, big });
    for (const e of S.ens) { if (e.dead) continue; const d = CF.dist(e.x, e.y, x, y); if (d < r + e.r) { Q.hit(e, dmg, big); if (!e.boss) { const a = Math.atan2(e.y - y, e.x - x); e.x += Math.cos(a) * (big ? 40 : 18); e.y += Math.sin(a) * (big ? 40 : 18); } } }
  };
  // 反馈工具：闪屏（边缘光）、手机震动、升级冲击
  Q.flash = function (c, a) { if (!S || CF.Save.data.settings.reduceMotion) return; S.flashC = c; S.flashA = Math.max(S.flashA || 0, a); };
  Q.buzz = function (ms) { try { if (navigator.vibrate && !CF.Save.data.settings.reduceMotion) navigator.vibrate(ms); } catch (e) { /* 不支持 */ } };
  Q.levelBurst = function () { const H = S.hero; Q.nova(H.x, H.y, 230 * H.area, H.dmg * 2.5, '#ffffff', true); Q.text(H.x, H.y - 64, `LEVEL ${H.lv}`, '#ffe08a', 26); H.hitT = Math.max(H.hitT, 1); Q.flash('#ffe08a', 0.3); Q.buzz(20); };
  Q.text = function (x, y, txt, c, size = 14) { S.texts.push({ x, y, txt, c, size, t: 0 }); if (S.texts.length > 60) S.texts.shift(); };
  Q.hit = function (e, dmg, big) {
    const H = S.hero, crit = Math.random() < H.crit;
    if (crit) dmg *= 2;
    if (S.feverT > 0) dmg *= 2;
    e.hp -= dmg; e.hit = 0.08;
    if (H.steal) H.hp = Math.min(H.maxHp, H.hp + dmg * H.steal);
    if (crit || big || Math.random() < 0.3) Q.text(e.x + CF.rand(-8, 8), e.y - e.r, Math.round(dmg), crit ? '#fff35c' : '#ffffff', crit ? 18 : 12);
    if (crit && !S.stopT) S.stopT = 0.04;
    if (e.hp <= 0 && !e.dead) Q.kill(e);
  };
  Q.kill = function (e) {
    const H = S.hero, T = ETYPE[e.type];
    e.dead = true; S.kills++; S.combo++; S.comboT = 2; S.maxCombo = Math.max(S.maxCombo, S.combo);
    S.score += Math.round(T.score * (1 + S.combo / 25) * (e.elite ? 4 : 1));
    S.fever = Math.min(100, S.fever + (e.elite ? 14 : 2.4));
    // 经验：连击越高掉得越多（每 20 连击 +50%）
    const xk = 1 + Math.min(2, S.combo / 40);
    for (let i = 0; i < (e.elite || e.boss ? 10 : 1); i++) S.gems.push({ x: e.x + CF.rand(-10, 10), y: e.y + CF.rand(-10, 10), v: (e.boss ? 12 : e.elite ? 4 : T.xp * 1.3) * xk });
    // 多杀：0.6 秒内连续击杀
    S.multi = S.multiT > 0 ? S.multi + 1 : 1; S.multiT = 0.6;
    if (S.multi >= 5 && S.multi % 5 === 0) { const MK = { 5: '五连破！', 10: '十连破！！', 15: '清屏！！！', 20: '无双！！！' }; Q.text(H.x, H.y - 120, MK[Math.min(20, S.multi)] || `${S.multi} 连破！`, '#ffe08a', 24 + Math.min(16, S.multi)); S.shake = Math.max(S.shake, 0.2); Q.flash(S.h.pal.accent, 0.25); Q.buzz(12); CF.Audio.sfx('levelup', 0.35); }
    for (let i = 0; i < (e.boss ? 40 : 8); i++) { const a = Math.random() * TAU, sp = CF.rand(60, e.boss ? 320 : 180); S.parts.push({ k: 'px', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: CF.rand(0.3, 0.7), c: Math.random() < 0.5 ? '#ff4f9a' : '#29e0e0' }); }
    if (S.kills % 3 === 0) CF.Audio.sfx('boom', 0.25);
    const ti = TITLES.filter(([n]) => S.combo >= n).pop();
    if (ti && ti[0] > S.lastTitle) { S.lastTitle = ti[0]; Q.text(H.x, H.y - 80, ti[1], S.h.pal.accent, 30); CF.Audio.sfx('levelup', 0.6); S.shake = 0.25; }
    if (e.boss) { S.slow = 0.25; S.slowT = 0.9; S.shake = 0.7; S.score += 5000; Q.text(H.x, H.y - 100, '首领击破！', '#ffe08a', 36); CF.Audio.sfx('win'); S.boss = null; Q.flash('#ffffff', 0.6); Q.buzz([40, 30, 80]); }
    if (e.elite) { S.stopT = 0.1; Q.flash('#ffd34d', 0.35); Q.buzz(30); Q.levelUp(); }
    if (e.type === 'titan' && !e.elite) { S.stopT = Math.max(S.stopT, 0.05); S.shake = Math.max(S.shake, 0.22); }
  };

  // ---------- 升级三选一 ----------
  Q.levelUp = function () {
    const H = S.hero;
    if (CF.modal.isOpen()) { S.pendingUp = (S.pendingUp || 0) + 1; return; }
    H.lv++; H.xp = Math.max(0, H.xp - H.next); H.next = Math.round(H.next * 1.25 + 3);
    Q.levelBurst();
    CF.Audio.sfx('levelup');
    const pool = CF.shuffle(UPS.filter(([id, , , , max]) => (H.ups[id] || 0) < max)).slice(0, 3);
    if (!pool.length) return;
    const body = CF.h(`<div><p class="small muted" style="text-align:center;margin-bottom:10px">Lv ${H.lv} · 选一个强化</p><div class="cards3"></div></div>`);
    pool.forEach(([id, ic, n, d], i) => {
      const b = CF.h(`<button class="upc" style="animation-delay:${i * 60}ms"><div class="ic">${ic}</div><h4>${n}</h4><p>${d}</p><div class="lv">Lv ${(H.ups[id] || 0) + 1}</div></button>`);
      b.onclick = () => { Q.apply(id); CF.modal.close(); CF.Audio.sfx('unlock'); if (S && S.pendingUp > 0) { S.pendingUp--; setTimeout(() => S && Q.levelUp(), 80); } };
      body.querySelector('.cards3').appendChild(b);
    });
    CF.modal.open({ title: '⬆ 升级！', body, closable: false });
  };
  Q.apply = function (id) {
    const H = S.hero; H.ups[id] = (H.ups[id] || 0) + 1;
    switch (id) {
      case 'dmg': H.dmg *= 1.25; break; case 'rate': H.rate *= 0.82; break; case 'proj': H.proj++; break; case 'pierce': H.pierce++; break;
      case 'area': H.area *= 1.2; break; case 'speed': H.speed *= 1.12; break; case 'magnet': H.magnet *= 1.45; break; case 'hp': H.maxHp *= 1.25; H.hp = H.maxHp; break;
      case 'crit': H.crit += 0.1; break; case 'orbit': H.orbit++; break; case 'beat': H.beatLv++; break; case 'skill': H.skillCd *= 0.8; break; case 'steal': H.steal += 0.02; break;
    }
  };

  // ---------- 招牌技（每位英雄不同） ----------
  function signature() {
    const H = S.hero, P = S.h.pal, id = S.h.id;
    const near = S.ens.filter((e) => !e.dead).sort((a, b) => CF.dist(a.x, a.y, H.x, H.y) - CF.dist(b.x, b.y, H.x, H.y));
    const t = near[0]; const ang = t ? Math.atan2(t.y - H.y, t.x - H.x) : 0;
    const fan = (n, spread, sp, dmg, c, pierce = 2) => { for (let i = 0; i < n; i++) { const a = ang - spread / 2 + (n > 1 ? (i / (n - 1)) * spread : 0); S.shots.push({ x: H.x, y: H.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, pierce, life: 1.2, c, w: 6, hit: new Set() }); } };
    switch (id) {
      case 'zaole': { const C9 = CF.Heroes.ensembleColors(); C9.forEach((c, i) => setTimeout(() => S && fan(1, 0, 760, H.dmg * 2.4, c, 4), i * 40)); Q.nova(H.x, H.y, 220 * H.area, H.dmg * 3, P.accent, true); break; }
      case 'xs': Q.nova(H.x, H.y, 200 * H.area, H.dmg * 4, P.instL, true); break;
      case 'omni': fan(10, 1.2, 620, H.dmg * 2.2, P.white, 3); break;
      case 'twin': fan(1, 0, 900, H.dmg * 3, P.blue, 99); setTimeout(() => S && fan(1, 0, 900, H.dmg * 3, P.pink, 99), 120); break;
      case 'riot': Q.nova(H.x, H.y, 170 * H.area, H.dmg * 3.4, P.red, true); near.slice(0, 6).forEach((e) => e.stun = 1); break;
      case 'llama': fan(7, 1.3, 520, H.dmg * 2, P.wool, 99); break;
      case 'abyss': fan(1, 0, 600, H.dmg * 6, P.spout, 99); S.parts.push({ k: 'whirl', x: t ? t.x : H.x, y: t ? t.y : H.y, t: 0 }); break;
      case 'luna': fan(3, 0.25, 1100, H.dmg * 3.5, '#eef2ff', 99); break;
      case 'pearl': fan(14, TAU * 0.9, 560, H.dmg * 1.4, P.pearl, 1); break;
      case 'bun': fan(9, 1.6, 420, H.dmg * 1.8, P.gold, 2); H.hp = Math.min(H.maxHp, H.hp + H.maxHp * 0.08); break;
    }
    CF.Audio.lick(S.h.id, true);
  }

  // ---------- 主循环 ----------
  Q.update = function (dt0) {
    if (S.over) return;
    if (S.stopT > 0) { S.stopT -= dt0; return; }
    if (S.slowT > 0) { S.slowT -= dt0; if (S.slowT <= 0) S.slow = 1; }
    const dt = dt0 * S.slow, H = S.hero;
    S.t += dt; S.tapCd -= dt0; S.shake = Math.max(0, S.shake - dt0);
    if (S.feverT > 0) S.feverT -= dt;
    if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) { S.combo = 0; S.lastTitle = 0; } }
    if (S.multiT > 0) S.multiT -= dt0;
    if (S.flashA > 0) S.flashA = Math.max(0, S.flashA - dt0 * 1.8);
    // 移动
    let mx = 0, my = 0;
    if (S.joy) { mx = S.joy.dx; my = S.joy.dy; }
    const K = Q.keys; if (K && K.size) { if (K.has('a') || K.has('arrowleft')) mx -= 1; if (K.has('d') || K.has('arrowright')) mx += 1; if (K.has('w') || K.has('arrowup')) my -= 1; if (K.has('s') || K.has('arrowdown')) my += 1; const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; } }
    H.x = CF.clamp(H.x + mx * H.speed * dt, 40, 2360); H.y = CF.clamp(H.y + my * H.speed * dt, 40, 2360);
    if (Math.abs(mx) > 0.1) H.face = mx > 0 ? 1 : -1;
    H.moving = Math.hypot(mx, my) > 0.1;
    // 自动攻击
    H.cd -= dt * (S.feverT > 0 ? 2 : 1);
    if (H.cd <= 0) {
      const tg = S.ens.filter((e) => !e.dead && CF.dist(e.x, e.y, H.x, H.y) < 420).sort((a, b) => CF.dist(a.x, a.y, H.x, H.y) - CF.dist(b.x, b.y, H.x, H.y));
      if (tg.length) {
        H.cd = H.rate; H.strum = 0.2;
        for (let i = 0; i < H.proj; i++) { const e = tg[i % tg.length], a = Math.atan2(e.y - H.y, e.x - H.x) + (i >= tg.length ? (i - tg.length + 1) * 0.15 : 0); S.shots.push({ x: H.x, y: H.y - 6, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, dmg: H.dmg, pierce: H.pierce, life: 0.8, c: S.h.pal.note, w: 4, hit: new Set() }); }
        if (S.kills % 2 === 0) CF.Audio.sfx('shoot', 0.3);
      }
    }
    H.skillT -= dt; if (H.skillT <= 0) { H.skillT = H.skillCd; signature(); }
    // 伴生无人机：跟随、自动射击、回血
    if (H.drone) { const D = H.drone; D.x = CF.lerp(D.x, H.x - 30, Math.min(1, dt * 6)); D.y = CF.lerp(D.y, H.y - 42, Math.min(1, dt * 6)); H.hp = Math.min(H.maxHp, H.hp + H.maxHp * 0.012 * dt); D.cd -= dt; if (D.cd <= 0) { const tg = S.ens.find((e) => !e.dead && CF.dist(e.x, e.y, D.x, D.y) < 320); if (tg) { D.cd = 0.45; const a = Math.atan2(tg.y - D.y, tg.x - D.x); S.shots.push({ x: D.x, y: D.y, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, dmg: H.dmg * 0.45, pierce: 1, life: 0.6, c: S.h.pal.accent, w: 4, hit: new Set() }); } else D.cd = 0.2; } }
    if (H.strum > 0) H.strum -= dt;
    // 环绕音符
    if (H.orbit) { const n = H.orbit; for (let i = 0; i < n; i++) { const a = S.t * 3 + (i / n) * TAU, ox = H.x + Math.cos(a) * 80 * H.area, oy = H.y + Math.sin(a) * 80 * H.area; for (const e of S.ens) if (!e.dead && CF.dist(e.x, e.y, ox, oy) < e.r + 12 && (e.orbT || 0) <= 0) { e.orbT = 0.3; Q.hit(e, H.dmg * 1.1); } } }
    // 生成敌人
    // 出怪：开局就有 3 只/秒，后期接近 20 只/秒；每 6 秒一股「虫潮」从同一方向涌来，专门给范围技能清屏
    const p = S.t / DUR, rate = 3.2 + p * 6 + p * p * 10;
    S.packT -= dt;
    if (S.packT <= 0 && S.ens.length < 240) { S.packT = 6 - p * 2; const a = Math.random() * TAU, d = Math.max(Q.w, Q.h) * 0.6 + 40, n = 8 + Math.round(p * 14); for (let i = 0; i < n; i++) Q.spawn(Math.random() < 0.2 ? 'bat' : 'bug', H.x + Math.cos(a) * d + CF.rand(-60, 60), H.y + Math.sin(a) * d + CF.rand(-60, 60)); Q.text(H.x + Math.cos(a) * 160, H.y + Math.sin(a) * 160, '虫潮 ▸', '#ff4f9a', 16); }
    S.spawnT -= dt;
    while (S.spawnT <= 0 && S.ens.length < 260) {
      S.spawnT += 1 / rate;
      const a = Math.random() * TAU, d = Math.max(Q.w, Q.h) * 0.62 + 60, type = Math.random() < 0.08 + p * 0.1 ? 'noise' : Math.random() < 0.25 ? 'bat' : Math.random() < 0.03 + p * 0.05 ? 'titan' : 'bug';
      Q.spawn(type, H.x + Math.cos(a) * d, H.y + Math.sin(a) * d);
    }
    S.eliteT -= dt; if (S.eliteT <= 0) { S.eliteT = 18; const a = Math.random() * TAU; const e = Q.spawn('titan', H.x + Math.cos(a) * 500, H.y + Math.sin(a) * 500); e.elite = true; e.hp = e.maxHp = 900 + S.t * 20; e.r = 26; Q.text(H.x, H.y - 60, '精英来袭！', '#ffd34d', 20); }
    if (!S.bossDone && S.t >= 60) { S.bossDone = true; const e = Q.spawn('boss', H.x + 520, H.y); S.boss = e; CF.Audio.sfx('alert'); Q.text(H.x, H.y - 80, '乱码首领 降临', '#ff4f9a', 30); S.shake = 0.5; }
    // 敌人移动与接触伤害
    const grid = new Map(), key = (x, y) => ((x / 64) | 0) * 10000 + ((y / 64) | 0);
    for (const e of S.ens) {
      if (e.dead) continue;
      e.hit = Math.max(0, e.hit - dt); if (e.orbT) e.orbT -= dt;
      if (e.stun > 0) e.stun -= dt;
      else { const a = Math.atan2(H.y - e.y, H.x - e.x); e.x += Math.cos(a) * e.speed * dt; e.y += Math.sin(a) * e.speed * dt; }
      const k = key(e.x, e.y); let arr = grid.get(k); if (!arr) grid.set(k, (arr = [])); arr.push(e);
      if (CF.dist(e.x, e.y, H.x, H.y) < e.r + 14 && H.hitT <= 0) { H.hp -= e.dmg; H.hitT = 0.45; S.shake = 0.15; CF.Audio.sfx('hit'); }
    }
    H.hitT -= dt;
    // 分离（避免叠成一坨）
    for (const arr of grid.values()) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < Math.min(arr.length, i + 6); j++) { const a = arr[i], b = arr[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 0.1, m = a.r + b.r; if (d < m) { const push = (m - d) / d * 0.5; a.x += dx * push; a.y += dy * push; b.x -= dx * push; b.y -= dy * push; } }
    // 弹道
    for (const s of S.shots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      for (let ix = -1; ix <= 1 && s.life > 0; ix++) for (let iy = -1; iy <= 1 && s.life > 0; iy++) { const arr = grid.get(((s.x / 64 | 0) + ix) * 10000 + ((s.y / 64 | 0) + iy)); if (!arr) continue; for (const e of arr) { if (e.dead || s.hit.has(e)) continue; if (CF.dist(e.x, e.y, s.x, s.y) < e.r + s.w) { s.hit.add(e); Q.hit(e, s.dmg); if (s.hit.size >= s.pierce) { s.life = 0; break; } } } }
    }
    S.shots = S.shots.filter((s) => s.life > 0);
    S.ens = S.ens.filter((e) => !e.dead);
    // 经验宝石（磁吸 + 音高递增的拾取音）
    S.pickT -= dt; if (S.pickT <= 0) S.pickPitch = 0;
    for (const g of S.gems) {
      const d = CF.dist(g.x, g.y, H.x, H.y);
      if (d < H.magnet || g.pull) { g.pull = true; const a = Math.atan2(H.y - g.y, H.x - g.x), sp = 300 + (H.magnet - d) * 2; g.x += Math.cos(a) * sp * dt; g.y += Math.sin(a) * sp * dt; }
      if (d < 18) { g.got = true; H.xp += g.v; S.score += Math.round(g.v * 5); S.pickPitch = Math.min(24, S.pickPitch + 1); S.pickT = 0.6; Q.pickSfx(S.pickPitch); }
    }
    S.gems = S.gems.filter((g) => !g.got);
    if (H.xp >= H.next) Q.levelUp();
    // 特效
    S.waves.forEach((w) => (w.t += dt)); S.waves = S.waves.filter((w) => w.t < 1.4);
    S.parts.forEach((q) => { q.t += dt; if (q.k === 'ring') q.r = (q.t / 0.4) * q.max; if (q.k === 'px') { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; } });
    S.parts = S.parts.filter((q) => q.t < (q.k === 'ring' ? 0.45 : q.k === 'whirl' ? 0.8 : q.life || 0.6));
    S.texts.forEach((x) => { x.t += dt; x.y -= 40 * dt; }); S.texts = S.texts.filter((x) => x.t < 0.9);
    if (H.hp <= 0) return Q.end(false);
    if (S.t >= DUR) return Q.end(true);
    Q.hud();
  };
  Q.pickSfx = function (n) {
    const A = CF.Audio; if (!A.ctx || A.ctx.state !== 'running') return;
    const t = A.ctx.currentTime, o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 660 * Math.pow(2, n / 12);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(A.sfxBus); o.start(t); o.stop(t + 0.14);
  };
  Q.spawn = function (type, x, y) {
    const T = ETYPE[type], mul = 1 + (S.t / DUR) * 1.6;
    const e = { type, x: CF.clamp(x, 20, 2380), y: CF.clamp(y, 20, 2380), r: T.r, hp: T.hp * mul, maxHp: T.hp * mul, speed: T.speed * (0.9 + Math.random() * 0.2), dmg: T.dmg, hit: 0, id: Math.random() * 1000 | 0, boss: type === 'boss', air: T.air };
    S.ens.push(e); return e;
  };
  Q.hud = function () {
    if (!S) return;
    $('#qScore').textContent = S.score.toLocaleString();
    $('#qTime').textContent = CF.fmtTime(DUR - S.t);
    $('#qXp').style.width = (S.hero.xp / S.hero.next) * 100 + '%';
    $('#qCombo').textContent = S.combo >= 5 ? S.combo : '';
    $('#qComboLbl').textContent = S.combo >= 5 ? `COMBO ×${(1 + S.combo / 25).toFixed(1)}` : '';
    const f = $('#qFever'); f.style.setProperty('--fv', S.fever + '%'); f.classList.toggle('ready', S.fever >= 100);
    $('#qFeverTxt').textContent = S.feverT > 0 ? Math.ceil(S.feverT) + 's' : S.fever >= 100 ? 'FEVER!' : Math.floor(S.fever) + '%';
  };

  // ---------- 渲染 ----------
  const dummy = { beat: 0, strum: 0, hpBar() {} };
  Q.render = function () {
    if (!S) return;
    const { w, h, dpr } = Q, H = S.hero, P = S.h.pal, t = performance.now() / 1000;
    const sh = S.shake > 0 ? (Math.random() - 0.5) * 14 * S.shake : 0;
    const cx = H.x - w / 2 + sh, cy = H.y - h / 2 + sh;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, P.bg[0]); g.addColorStop(1, P.bg[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // 地面：英雄配色的像素方格随节拍从英雄处扩散（招牌动效铺满地面）
    const cs = 44, x0 = Math.floor(cx / cs) * cs, y0 = Math.floor(cy / cs) * cs, rgb = P.grid.join(',');
    for (let yy = y0; yy < cy + h + cs; yy += cs) for (let xx = x0; xx < cx + w + cs; xx += cs) {
      let b = 0.1 + 0.05 * Math.sin(xx * 0.01 + yy * 0.013 + t);
      for (const wv of S.waves) { const d = CF.dist(xx + cs / 2, yy + cs / 2, wv.x, wv.y), r = wv.t * 520; if (d < r && d > r - 140) b += wv.s * (1 - (r - d) / 140) * Math.exp(-wv.t * 1.6); }
      if (S.feverT > 0) b += 0.18 + 0.12 * Math.sin(t * 10 + xx * 0.02);
      if (b < 0.08) continue;
      ctx.fillStyle = `rgba(${rgb},${Math.min(0.75, b * 0.8)})`;
      ctx.fillRect(xx - cx + 1, yy - cy + 1, cs - 2, cs - 2);
    }
    ctx.save(); ctx.translate(-cx, -cy);
    ctx.strokeStyle = `rgba(${rgb},.6)`; ctx.lineWidth = 3; ctx.strokeRect(20, 20, 2360, 2360); ctx.lineWidth = 1;
    // 宝石
    for (const q of S.gems) { ctx.fillStyle = q.v >= 3 ? '#ffe08a' : P.glow; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.restore(); }
    // 敌人
    for (const e of S.ens) { ctx.save(); const u = { type: ETYPE[e.type].drawAs || e.type, id: e.id }; CF.Game.Game.prototype.drawFoe.call(dummy, ctx, u, e.x, e.y, e.r, t, e.hit > 0); ctx.restore(); if (e.elite) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, TAU); ctx.stroke(); ctx.lineWidth = 1; } if (e.elite || e.boss) { ctx.fillStyle = '#000a'; ctx.fillRect(e.x - 26, e.y - e.r - 12, 52, 5); ctx.fillStyle = '#ff4f9a'; ctx.fillRect(e.x - 26, e.y - e.r - 12, 52 * Math.max(0, e.hp / e.maxHp), 5); } }
    // 弹道
    for (const s of S.shots) { ctx.fillStyle = s.c; ctx.fillRect(s.x - s.w, s.y - s.w, s.w * 2, s.w * 2); ctx.globalAlpha = 0.35; ctx.fillRect(s.x - s.vx * 0.02 - s.w / 2, s.y - s.vy * 0.02 - s.w / 2, s.w, s.w); ctx.globalAlpha = 1; }
    // 特效
    for (const q of S.parts) {
      if (q.k === 'ring') { const a = 1 - q.t / 0.45, cs2 = q.big ? 12 : 8, n = Math.max(12, (q.r * TAU / cs2) | 0); ctx.globalAlpha = a; ctx.fillStyle = q.c; for (let i = 0; i < n; i++) { const an = i / n * TAU, px = Math.round((q.x + Math.cos(an) * q.r) / cs2) * cs2, py = Math.round((q.y + Math.sin(an) * q.r) / cs2) * cs2; ctx.fillRect(px - cs2 / 2 + 1, py - cs2 / 2 + 1, cs2 - 2, cs2 - 2); } ctx.globalAlpha = 1; }
      else if (q.k === 'px') { ctx.globalAlpha = 1 - q.t / q.life; ctx.fillStyle = q.c; ctx.fillRect(q.x - 3, q.y - 3, 6, 6); ctx.globalAlpha = 1; }
      else if (q.k === 'whirl') { ctx.strokeStyle = P.spout || P.glow; ctx.globalAlpha = 1 - q.t / 0.8; ctx.beginPath(); ctx.arc(q.x, q.y, 40 + q.t * 120, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    }
    // 环绕音符
    for (let i = 0; i < H.orbit; i++) { const a = S.t * 3 + (i / H.orbit) * TAU; CF.PixelFX.drawPattern(ctx, CF.PixelFX.NOTES[i % 4], H.x + Math.cos(a) * 80 * H.area - 5, H.y + Math.sin(a) * 80 * H.area - 5, 3, P.note); }
    // 英雄
    ctx.save(); ctx.translate(H.x, H.y); if (H.face < 0) ctx.scale(-1, 1); if (H.hitT > 0.3) ctx.globalAlpha = 0.6;
    const px = 3; S.h.draw(ctx, -10 * px, -7 * px, px, { noDrone: true, t, strum: H.strum > 0 ? 1 : 0, bob: CF.PixelFX.beat() > 0.6 ? 1 : 0, walk: H.moving, step: Math.floor(t * 10), lean: S.feverT > 0 && Math.floor(t * 6) % 2 ? 1 : 0 });
    ctx.restore();
    if (H.drone) CF.Heroes.drawDrone(ctx, H.drone.x - 6, H.drone.y - 6, 2.4, t);
    ctx.fillStyle = '#000a'; ctx.fillRect(H.x - 24, H.y + 30, 48, 5); ctx.fillStyle = H.hp / H.maxHp > 0.35 ? '#6fdc8c' : '#ff5d6c'; ctx.fillRect(H.x - 24, H.y + 30, 48 * Math.max(0, H.hp / H.maxHp), 5);
    // 文字
    for (const x of S.texts) { ctx.globalAlpha = 1 - x.t / 0.9; ctx.font = `900 ${x.size * (x.t < 0.1 ? 1.4 - x.t * 4 : 1)}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000a'; ctx.strokeText(x.txt, x.x, x.y); ctx.fillStyle = x.c; ctx.fillText(x.txt, x.x, x.y); }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
    ctx.restore();
    // 虚拟摇杆
    if (S.joy) { ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S.joy.ox, S.joy.oy, 60, 0, TAU); ctx.stroke(); ctx.fillStyle = `rgba(${rgb},.6)`; ctx.beginPath(); ctx.arc(S.joy.ox + S.joy.dx * 60, S.joy.oy + S.joy.dy * 60, 22, 0, TAU); ctx.fill(); ctx.lineWidth = 1; }
    // 节拍指示：屏幕底部的拍点光条 + 英雄脚下收缩的拍点圈（圈收到最小时点屏 = PERFECT）
    const ph = S.lastBeat ? ((performance.now() - S.lastBeat) / 1000) / S.beatIv : 0, near = Math.min(ph % 1, 1 - (ph % 1));
    { const fr = ph % 1, rr = 26 + 46 * (1 - fr), n = 20, ac = CF.Heroes.rgb(P.accent).join(','); ctx.fillStyle = `rgba(${ac},${near < 0.15 ? 0.95 : 0.35})`; for (let i = 0; i < n; i++) { const an = (i / n) * TAU; ctx.fillRect(w / 2 - sh + Math.cos(an) * rr - 2, h / 2 - sh + Math.sin(an) * rr * 0.6 + 14 - 2, 4, 4); } }
    ctx.fillStyle = `rgba(${CF.Heroes.rgb(P.accent).join(',')},${near < 0.15 ? 0.9 : 0.25})`; ctx.fillRect(w / 2 - 60, h - 10, 120, 4);
    if (S.feverT > 0) { ctx.fillStyle = `rgba(${CF.Heroes.rgb(P.accent).join(',')},${0.08 + 0.06 * Math.sin(t * 12)})`; ctx.fillRect(0, 0, w, h); }
    if (S.flashA > 0) { const fc = CF.Heroes.rgb(S.flashC || '#ffffff').join(','), gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7); gr.addColorStop(0, `rgba(${fc},0)`); gr.addColorStop(1, `rgba(${fc},${S.flashA})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h); }
    if (S.boss && !S.boss.dead) { ctx.fillStyle = '#000a'; ctx.fillRect(w / 2 - 150, 64, 300, 8); ctx.fillStyle = '#ff4f9a'; ctx.fillRect(w / 2 - 150, 64, 300 * S.boss.hp / S.boss.maxHp, 8); }
  };

  // ---------- 结算 ----------
  Q.end = function (survived) {
    S.over = true; Q._last = { score: S.score, kills: S.kills, lv: S.hero.lv, combo: S.maxCombo, perfects: S.perfects, t: Math.round(S.t), hp: Math.round(S.hero.hp) };
    const d = CF.Save.data, H = S.hero;
    if (survived) S.score += Math.round(H.hp) * 10;
    const sc = Math.round(S.score), rank = sc >= 250000 ? 'S' : sc >= 150000 ? 'A' : sc >= 70000 ? 'B' : 'C';
    const best = sc > (d.quick.best || 0);
    d.quick.runs++; if (best) { d.quick.best = sc; d.quick.bestRank = rank; }
    d.stats.kills += S.kills; CF.Save.save();
    const reward = CF.City ? CF.City.add({ chip: Math.round(sc / 60), corp: Math.round(sc / 120), comp: Math.round(S.perfects * 2) }) : null;
    CF.Audio.sfx(survived ? 'win' : 'lose');
    const body = CF.h(`<div style="text-align:center"><div class="rank-big">${rank}</div><div class="t-h2" style="margin-top:6px">${sc.toLocaleString()} 分 ${best ? '<span class="pill warn">新纪录！</span>' : ''}</div><p class="small muted" style="margin-top:4px">${survived ? '撑满 90 秒！' : '英雄倒下了'} · 击杀 ${S.kills} · 最高连击 ${S.maxCombo} · 完美 ${S.perfects} · Lv ${H.lv}</p>${reward ? `<p class="small" style="margin-top:8px">🏰 主城入账 <span class="c-chip">+${reward.chip}</span> <span class="c-corp">+${reward.corp}</span> <span class="c-comp">+${reward.comp}</span></p>` : ''}<div class="explain" style="text-align:left;margin-top:12px">📚 <b>知识闪卡</b>：答对 1 道题，本局分数 ×1.2，还能拿知识经验。<button class="btn sm" id="qQuiz" style="margin-left:6px">来一题</button></div></div>`);
    CF.modal.open({ title: survived ? '⚡ 爽局结束' : '⚡ 再来一局？', body, closable: false, foot: [{ text: '返回大厅', cls: 'ghost', onClick: () => { CF.modal.close(); CF.UI.show('lobby'); } }, { text: '换英雄', onClick: () => { CF.modal.close(); CF.UI.show('heroes'); } }, { text: '再来一局 ▶', cls: 'primary', onClick: () => { CF.modal.close(); Q.start(); } }] });
    body.querySelector('#qQuiz').onclick = () => {
      CF.Academy.quiz({ n: 1, title: '📚 知识闪卡', onDone: (r) => { if (r) { const add = Math.round(sc * 0.2); d.quick.best = Math.max(d.quick.best, sc + add); CF.Save.save(); CF.toast(`答对了！分数 +${add}`, 'gold'); } else CF.toast('没关系，讲解看懂了就是收获'); setTimeout(() => CF.UI.show('lobby'), 200); } });
    };
  };
})();
