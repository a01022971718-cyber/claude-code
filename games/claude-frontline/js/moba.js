/* 沉浸模式的 MOBA 操控（v7，参考王者荣耀、英雄联盟手游；规则见《游戏界面视觉宪法》第 18 章）
 * - 左手：动态摇杆。在屏幕左下区域任意位置按下就出现摇杆，拖动控制英雄移动，松手英雄停下（附近有敌人会自动反击）。
 * - 右手：普攻键 + 三个技能键排成弧形。技能键：点一下 = 自动对准最近的敌人释放；按住拖动 = 瞄准（方向 / 落点），松手释放；
 *   拖到「取消」圈上松手 = 不放。普攻键按住会持续攻击最近的敌人。
 * - 镜头：跟随镜头（一直跟着英雄，拖动战场不会移动镜头）/ 自由镜头（单指拖动平移）。右上角按钮或 Y 键切换；点小地图会自动切到自由镜头。
 * - 电脑：方向键 = 摇杆，Q / W / R 仍然对准鼠标释放。
 * 设置里可以改回「经典点击」操控。 */
(function () {
  const CF = window.CF;
  const M = (CF.Moba = { active: false, cam: 'follow' });
  const S = () => CF.Save.data.settings;
  const JR = 56, AR = 72; // 摇杆最大半径、技能瞄准最大半径（屏幕像素）
  let root = null, zone, base, knob, cancel, camBtn, joy = null, aim = null, atkHeld = false, atkT = 0, frameN = 0;
  const P = (e) => CF.appPoint(e.clientX, e.clientY);
  const center = (el) => { const r = CF.appRect(el); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const G = () => CF.Game.current;

  M.wanted = (L) => !!(L && L.immersive) && S().mobaCtl !== 'classic';
  M.locked = () => M.active && M.cam === 'follow';

  M.setCam = function (mode, why) {
    M.cam = mode; S().mobaCam = mode; CF.Save.save();
    if (camBtn) { camBtn.innerHTML = `${CF.Icons ? CF.Icons.svg(mode === 'follow' ? 'target' : 'map', 'pi') : ''}<span>${mode === 'follow' ? '跟随镜头' : '自由镜头'}</span>`; camBtn.classList.toggle('on', mode === 'follow'); }
    if (why) CF.toast(mode === 'follow' ? '跟随镜头：镜头一直跟着英雄' : '自由镜头：拖动战场移动镜头' + (why === 'mini' ? '（点小地图时自动切换）' : ''), '', 1600);
  };

  M.enable = function (g) {
    M.disable();
    const field = CF.$('#field');
    root = CF.h(`<div id="mobaUI">
      <div class="mb-zone"><div class="mb-base"><i class="mb-knob"></i></div></div>
      <div class="mb-cluster">
        <div class="mb-cancel hidden">${CF.Icons ? CF.Icons.svg('lock', 'pi') : ''}<span>取消</span></div>
        <button class="mb-atk" title="普攻：按住持续攻击最近的敌人">${CF.Icons ? CF.Icons.svg('swords', 'pi') : '⚔'}<span>普攻</span></button>
      </div>
      <button class="glass mb-cam" title="切换镜头（Y）"></button>
    </div>`);
    field.appendChild(root);
    zone = root.querySelector('.mb-zone'); base = root.querySelector('.mb-base'); knob = root.querySelector('.mb-knob');
    cancel = root.querySelector('.mb-cancel'); camBtn = root.querySelector('.mb-cam');
    const cl = root.querySelector('.mb-cluster'), hd = g.heroDef;
    hd.skills.forEach((sk, i) => {
      const b = CF.h(`<button class="sk mb-sk mb-${sk.key}" data-k="${sk.key}"><span class="key">${sk.key}</span>${CF.Icons ? CF.Icons.skill(hd.id, i) : sk.key}<span class="cost"></span><i class="cdm"></i><span class="cdt"></span><b class="mb-up hidden">＋</b></button>`);
      bindSkill(b, sk); cl.appendChild(b);
    });
    bindJoy(); bindAtk(root.querySelector('.mb-atk'));
    camBtn.onclick = () => { CF.Audio.sfx('click'); M.setCam(M.cam === 'follow' ? 'free' : 'follow', 'btn'); };
    const mm = CF.$('#miniCanvas'); mm.addEventListener('pointerdown', onMini);
    window.addEventListener('keydown', onKey);
    document.body.classList.add('moba'); M.active = true;
    M.setCam(S().mobaCam || 'follow');
    if (!S().mobaTipSeen) { S().mobaTipSeen = true; CF.Save.save(); setTimeout(() => CF.toast('新操控：左手摇杆移动；右手技能——点一下自动释放，按住拖动瞄准，拖到「取消」松手不放', 'gold', 5200), 900); }
  };
  M.disable = function () {
    if (root) root.remove(); root = null; joy = null; aim = null; atkHeld = false;
    const mm = CF.$('#miniCanvas'); if (mm) mm.removeEventListener('pointerdown', onMini);
    window.removeEventListener('keydown', onKey);
    document.body.classList.remove('moba'); M.active = false;
    const g = G(); if (g) { g.stick = null; g.aim = null; }
  };
  function onMini() { if (M.locked()) M.setCam('free', 'mini'); }
  function onKey(e) {
    if (CF.UI.cur !== 'battle' || CF.modal.isOpen() || (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
    if (e.key === 'y' || e.key === 'Y') M.setCam(M.cam === 'follow' ? 'free' : 'follow', 'key');
  }

  // ---------- 左手摇杆（动态：按在哪里，摇杆就出现在哪里） ----------
  function bindJoy() {
    zone.addEventListener('pointerdown', (e) => {
      if (joy) return; e.preventDefault(); e.stopPropagation(); CF.Audio.unlock();
      const p = P(e), zr = CF.appRect(zone);
      joy = { id: e.pointerId, cx: p.x, cy: p.y, x: 0, y: 0 };
      base.style.left = (p.x - zr.left) + 'px'; base.style.top = (p.y - zr.top) + 'px'; base.classList.add('on');
      try { zone.setPointerCapture(e.pointerId); } catch (er) { /* 合成事件 */ }
    });
    zone.addEventListener('pointermove', (e) => {
      if (!joy || joy.id !== e.pointerId) return;
      const p = P(e); let dx = p.x - joy.cx, dy = p.y - joy.cy; const d = Math.hypot(dx, dy);
      if (d > JR) { dx *= JR / d; dy *= JR / d; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      joy.x = dx / JR; joy.y = dy / JR;
    });
    const up = (e) => { if (!joy || joy.id !== e.pointerId) return; joy = null; knob.style.transform = ''; base.classList.remove('on'); base.style.left = ''; base.style.top = ''; const g = G(); if (g) g.stick = null; };
    zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
  }

  // ---------- 普攻键 ----------
  function attackNearest() {
    const g = G(), h = g && g.hero; if (!h || h.dead) return;
    const t = g.bestTarget(h, h.def.atk.range + 240);
    if (t) { g.orderAttack([h], t); if (CF.Voice) CF.Voice.event(g.heroDef, 'attack'); }
  }
  function bindAtk(b) {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); CF.Audio.unlock(); atkHeld = true; atkT = 0; b.classList.add('down'); attackNearest(); try { b.setPointerCapture(e.pointerId); } catch (er) { /* 合成事件 */ } });
    const up = () => { atkHeld = false; b.classList.remove('down'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }

  // ---------- 技能键：点击释放 / 拖动瞄准 / 拖到取消 ----------
  function aimPoint(g, sk, vx, vy) {
    const h = g.hero, len = Math.hypot(vx, vy);
    if (sk.target === 'dir') { const ux = len > 0.05 ? vx / len : h.face, uy = len > 0.05 ? vy / len : 0; return [h.x + ux * 320, h.y + uy * 320]; }
    return [h.x + vx * 520, h.y + vy * 520];
  }
  const overCancel = (p) => { const [x, y] = center(cancel), r = CF.appRect(cancel); return Math.hypot(p.x - x, p.y - y) < r.width * 0.7; };
  function bindSkill(b, sk) {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation(); CF.Audio.unlock();
      const g = G(); if (!g || !g.hero || g.hero.dead) return;
      if (e.target.classList.contains('mb-up')) { g.learnSkill(sk.key); if (g.imHud) { CF.$('#itemBar')._sig = ''; g.imHud(); } return; }
      const [cx, cy] = center(b);
      aim = { id: e.pointerId, sk, b, cx, cy, vx: 0, vy: 0, moved: false, cancel: false };
      if (sk.target !== 'self') cancel.classList.remove('hidden');
      b.classList.add('aim');
      try { b.setPointerCapture(e.pointerId); } catch (er) { /* 合成事件 */ }
    });
    b.addEventListener('pointermove', (e) => {
      if (!aim || aim.id !== e.pointerId || aim.sk.target === 'self') return;
      const p = P(e), g = G(); let dx = p.x - aim.cx, dy = p.y - aim.cy; const d = Math.hypot(dx, dy);
      if (d > 14) aim.moved = true; if (!aim.moved) return;
      if (d > AR) { dx *= AR / d; dy *= AR / d; }
      aim.vx = dx / AR; aim.vy = dy / AR; aim.cancel = overCancel(p);
      cancel.classList.toggle('over', aim.cancel);
      if (g && g.hero) { const [x, y] = aimPoint(g, aim.sk, aim.vx, aim.vy); g.aim = aim.cancel ? null : { key: aim.sk.key, x, y }; }
    });
    const up = (e) => {
      if (!aim || aim.id !== e.pointerId) return;
      const a = aim; aim = null; a.b.classList.remove('aim'); cancel.classList.add('hidden'); cancel.classList.remove('over');
      const g = G(); if (!g) return; g.aim = null;
      if (a.cancel) { CF.Audio.sfx('hover'); return; }
      if (a.sk.target === 'self') { g.heroCast(a.sk.key); return; }
      if (a.moved) { const [x, y] = aimPoint(g, a.sk, a.vx, a.vy); g.heroCast(a.sk.key, x, y); return; }
      // 点一下：自动对准最近的敌人；附近没有敌人就朝面向的方向放
      const t = g.bestTarget(g.hero, 650);
      if (t) g.heroCast(a.sk.key, t.x, t.y); else g.heroCast(a.sk.key);
    };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  }

  // ---------- 每帧：摇杆 → 英雄，普攻连发，镜头跟随，技能键状态 ----------
  M.frame = function (g, dt) {
    if (!M.active || !g.hero) return;
    const h = g.hero, K = CF.UI.keys;
    let sx = joy ? joy.x : 0, sy = joy ? joy.y : 0;
    if (!joy && K && K.size) { sx = (K.has('ArrowRight') ? 1 : 0) - (K.has('ArrowLeft') ? 1 : 0); sy = (K.has('ArrowDown') ? 1 : 0) - (K.has('ArrowUp') ? 1 : 0); const l = Math.hypot(sx, sy) || 1; sx /= l; sy /= l; }
    const m = Math.hypot(sx, sy);
    const was = !!g.stick;
    g.stick = !h.dead && !atkHeld && m > 0.18 ? { x: sx / m, y: sy / m } : null;
    if (g.stick && !was && CF.Voice) CF.Voice.event(g.heroDef, 'move');
    if (atkHeld) { atkT -= dt; if (atkT <= 0) { atkT = 0.3; attackNearest(); } }
    if (M.cam === 'follow' && !h.dead) {
      const look = aim && aim.moved ? 110 : 0, tx = h.x + (aim ? aim.vx * look : 0), ty = h.y + (aim ? aim.vy * look : 0);
      const c = g.cam, cx = c.x + g.viewW() / 2, cy = c.y + g.viewH() / 2, k = Math.min(1, dt * 7);
      g.centerOn(cx + (tx - cx) * k, cy + (ty - cy) * k);
    }
    if (++frameN % 5) return;
    root.querySelectorAll('.mb-sk').forEach((b) => {
      const sk = g.heroDef.skills.find((x) => x.key === b.dataset.k), cd = h.dead ? 0 : h.cd[sk.key], cost = CF.Skills.cost(h, sk);
      const full = sk.cd * (g.bonus.cdMul || 1) * CF.Roster.starCd(g.heroId);
      b.querySelector('.cdm').style.setProperty('--cd', (cd > 0 ? (cd / full) * 100 : 0) + '%');
      b.querySelector('.cdt').textContent = cd > 0 ? Math.ceil(cd) : '';
      b.querySelector('.cost').textContent = cost;
      const lock = (sk.key === 'R' && ((g.L.immersive && (g.heroLv || 1) < 6 && !CF.P.trial()) || !CF.Treasure.has(g.heroId)));
      b.classList.toggle('na', h.dead || g.res.comp < cost || lock);
      const up = b.querySelector('.mb-up'), maxLv = sk.key === 'R' ? (g.heroLv >= 10 ? 3 : g.heroLv >= 8 ? 2 : g.heroLv >= 6 ? 1 : 0) : Math.min(4, 1 + Math.floor(((g.heroLv || 1) + 1) / 2));
      up.classList.toggle('hidden', !(g.skillPts > 0 && g.skillLv && g.skillLv[sk.key] < maxLv));
    });
    root.querySelector('.mb-atk').classList.toggle('na', h.dead);
  };
})();
