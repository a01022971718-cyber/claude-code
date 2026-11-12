// The habitat (home screen), the unit intro cards, evolution, and the engineering ledger.
import {
  $, clamp, lerp, ease, mm, ui, labels, app, stage, S, save, resetAll, dayCount, useSpirit, solidFor, activeGait, gaitFor, applyWalker,
  screens, go, openSheet, closeSheet, flash, label, place, ring, record, V, PAL, LEGS,
} from './core.js';
import { UNITS } from './content.js';
import { Walker } from './gait.js';

const SIT = 0.36, YAW0 = 0.42;
const RING_ICON = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="13" cy="13" r="10.5"/><circle cx="13" cy="13" r="7"/><circle cx="13" cy="13" r="3.4"/></svg>`;

// ---------------------------------------------------------------- concept cards before an experiment
function intro(n) {
  const u = UNITS[n - 1]; let i = 0;
  const show = () => {
    const c = u.cards[i], last = i === u.cards.length - 1;
    const el = openSheet(`
      <span class="tagk">第 ${n} 单元 · ${u.name} · ${i + 1} / ${u.cards.length}</span>
      <h3>${c.h}</h3>${c.p ? `<p>${c.p}</p>` : ''}
      ${c.q ? `<p class="q">${c.q}</p><div class="opts">${c.opts.map((o, j) => `<button data-j="${j}">${o}</button>`).join('')}</div><p class="exp" hidden>${c.exp}</p>` : ''}
      <div class="row"><button class="btn o" id="later">稍后再学</button><button class="btn y" id="nx" ${c.q ? 'disabled' : ''}>${last ? '开始实验 ▸' : '下一步 ▸'}</button></div>`);
    $('#later', el).onclick = closeSheet;
    $('#nx', el).onclick = () => { if (last) go(screens['Exp' + n]()); else { i++; show(); } };
    if (c.q) for (const b of el.querySelectorAll('.opts button')) b.onclick = () => {
      for (const o of el.querySelectorAll('.opts button')) { o.disabled = true; if (+o.dataset.j === c.a) o.classList.add('right'); }
      if (+b.dataset.j !== c.a) b.classList.add('wrong');
      $('.exp', el).hidden = false; $('#nx', el).disabled = false;
    };
  };
  show();
}

// ---------------------------------------------------------------- habitat
screens.Home = (opt = {}) => {
  const rep = opt.replay || null;
  let P, sp, w = null, t = 0, target = null, pause = 1.2, marker = null, markT = 0, note = null, sticker = null;
  let liftT = -1, nextLift = 1.5, standT = -1, down = false, finger = null;
  let cele = opt.celebrate || 0, celeT = 0, shown;
  const cur = {};
  const profile = () => rep ? { stage: rep.stage, evolved: rep.evolved, gait: rep.gait } : { stage: S.stage, evolved: S.evolved, gait: activeGait() };
  const banner = (msg) => { const b = $('#banner'); if (!b) return; b.textContent = msg; b.hidden = false; clearTimeout(banner.t); banner.t = setTimeout(() => { b.hidden = true; }, 7000); };

  function bindSpirit() {
    P = profile(); sp = useSpirit(P.evolved);
    sp.setLook('habitat', solidFor(shown, P.evolved));
    sp.root.position.set(0, 0, 0); sp.root.rotation.y = YAW0;
    sp.setPose({ height: shown < 2 ? SIT : sp.form.H, lean: 0 });
    for (const k of LEGS) { cur[k] = sp.neutral(k); sp.setFoot(k, cur[k]); }
    w = null;
    if (shown >= 3) { w = new Walker(sp.form); w.setGait(gaitFor(sp.form, P.gait)); w.reset(0, 0, YAW0); pause = cele === 3 ? 0.4 : 1.2; }
    if (note) { note.remove(); note = null; }
    if (shown < 2) note = label('青色线框 = 还没学会');
    else if (P.evolved) note = label('视觉传感器 · 下一课');
  }
  function buildUI() {
    const n = S.stage + 1, u = UNITS[n - 1];
    const dots = UNITS.map((_, i) => `<button class="dot ${i < S.stage ? 'on' : ''}" data-u="${i + 1}" ${i < S.stage ? '' : 'disabled'} aria-label="重调第 ${i + 1} 单元"></button>`).join('');
    let card;
    if (rep) card = `<div class="k"><span class="tagk">回放 ${rep.ver}</span></div><h3>${rep.title}</h3><p>这是 ${rep.date} 的它，动作用的是当时保存的参数。</p><div class="row"><button class="btn y" id="back-now">返回现在 ▸</button></div>`;
    else if (S.stage >= 5) card = `<div class="k"><span class="tagk">V1 主线完成</span><span class="dots">${dots}</span></div><h3>它是你一步步教出来的</h3><p>点一下草地，它会走过去。头顶的全息线框是下一课：视觉与避障。点右上的红点，可以回去重调任何一个单元。</p><div class="row"><button class="btn y" id="open-ledger">打开工程年轮 ▸</button></div>`;
    else card = `<div class="k"><span class="tagk">NEXT · 第 ${n} 单元</span><span class="dots">${dots}</span></div><h3>${u.title}</h3><p>${u.desc}</p><div class="row"><button class="btn y" id="start">开始 ▸</button>${S.stage > 0 ? '<span class="redo">点红点可重调已完成的单元</span>' : ''}</div>`;
    ui.innerHTML = `
      <header class="top home-top">
        <div><h1 class="title">星灵栖地</h1><span class="chip">草甸 · 晴 · 第 ${dayCount()} 天</span></div>
        <button class="round" id="btn-ledger" aria-label="打开工程年轮">${RING_ICON}<span>年轮</span></button>
      </header>
      <div class="mid"><p class="banner" id="banner" hidden></p></div>
      <footer class="bottom"><div class="card">${card}</div></footer>`;
    $('#btn-ledger').onclick = () => go(screens.Ledger());
    if ($('#start')) $('#start').onclick = () => intro(S.stage + 1);
    if ($('#open-ledger')) $('#open-ledger').onclick = () => go(screens.Ledger());
    if ($('#back-now')) $('#back-now').onclick = () => go(screens.Home());
    for (const d of ui.querySelectorAll('.dot.on')) d.onclick = () => go(screens['Exp' + d.dataset.u]());
    sticker = label(S.stage >= 4 ? '斜坡 18° · 已通过' : '斜坡 18° · 课题', 'sticker' + (S.stage >= 4 ? ' done' : ''));
  }
  function pickTarget() {
    const r = app.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      const g = stage.groundPoint(r.left + r.width * (0.36 + 0.28 * Math.random()), r.top + r.height * (0.5 + 0.17 * Math.random()));
      if (g && g.z > -6 && g.z < 2 && Math.hypot(g.x - w.x, g.z - w.z) > 1.3) return g;
    }
    return V(0, 0, 0);
  }
  function evolve() {
    const g = activeGait();
    S.evolved = true; S.traits = { stepLen: g.stepLen, bodyH: g.bodyH };
    const sp2 = useSpirit(true), f = sp2.form;
    record(0, '进化：ASTRA-02', [['腿长', `× ${(f.L1 / 0.85).toFixed(2)}（来自你的步长 ${mm(g.stepLen)} mm）`, true], ['机身宽度', `× ${f.hullW.toFixed(2)}（来自你的机身高度 ${mm(g.bodyH)} mm）`, true],
      ['新出现的部件', '头部视觉传感器（全息线框，还没学会）']], { ver: 'v1.0' });
    save();
  }

  return {
    enter() {
      stage.setView('habitat');
      const st = profile().stage;
      shown = (cele === 1 || cele === 2) ? st - 1 : st;
      bindSpirit(); buildUI();
      marker = ring(PAL.yellow, 0.22, 0.3, 0.9); marker.visible = false; stage.rig.add(marker);
      if (cele === 3) banner('它用你排的步态走起来了。点一下草地，它会走过去。');
      if (cele === 4) banner('斜坡通过。它现在按你调过的站姿走路。');
    },
    pointer(type, e) {
      if (type === 'up') { down = false; return; }
      if (type === 'down') down = true;
      if (!down) return;
      const r = app.getBoundingClientRect(), fy = (e.clientY - r.top) / r.height;
      if (fy < stage.horizon + 0.04 || fy > 0.8) return;
      const g = stage.groundPoint(e.clientX, e.clientY);
      if (!g) return;
      finger = g;
      if (shown >= 3 && type === 'down') {
        target = V(g.x, 0, clamp(g.z, -7, 2.5)); pause = 0;
        marker.position.set(target.x, 0.02, target.z); marker.visible = true; markT = 0;
      }
    },
    tick(dt) {
      t += dt;
      // ---- celebration after a unit: the new part gets its color, then the spirit uses it
      if (cele) {
        celeT += dt;
        if ((cele === 1 || cele === 2) && celeT > 0.8) {
          flash(); shown = profile().stage; sp.setLook('habitat', solidFor(shown, P.evolved));
          if (note && shown >= 2) { note.remove(); note = null; }
          if (cele === 1) { nextLift = t + 0.3; banner('右前腿上色了。它第一次自己抬起了腿。'); }
          if (cele === 2) { standT = 0; banner('六条腿都上色了，它站起来了。按住草地，前腿会跟着你的手指。'); }
          cele = 0;
        } else if (cele === 5 && celeT > 1.6) {
          flash(true); evolve(); shown = S.stage; bindSpirit(); buildUI();
          banner('进化完成。腿长和机身比例来自你的步态参数；头顶的全息线框是下一课。');
          cele = 0;
        } else if (cele === 3 || cele === 4) cele = 0;
      }
      const bob = 0.012 * Math.sin(t * 1.7);
      if (shown < 2) {
        // resting on the grass; with one real leg it practises lifting it
        sp.setPose({ height: SIT + bob });
        for (const k of LEGS) sp.setFoot(k, sp.neutral(k));
        if (shown === 1) {
          if (liftT < 0 && t > nextLift) liftT = 0;
          if (liftT >= 0) {
            liftT += dt; const s = clamp(liftT / 2.4, 0, 1), up = Math.sin(Math.PI * s), n = sp.neutral('RF');
            sp.setFoot('RF', V(n.x + 0.2 * up, 0.8 * up, n.z + 0.3 * up + 0.14 * Math.sin(s * 16) * up));
            if (s >= 1) { liftT = -1; nextLift = t + 2.5 + Math.random() * 3; }
          }
        }
      } else if (shown === 2) {
        // standing; the nearest front leg follows the finger through inverse kinematics
        let h = sp.form.H + bob;
        if (standT >= 0) { standT += dt; h = lerp(SIT, sp.form.H, ease(standT / 1.3)); if (standT > 1.3) standT = -1; }
        sp.setPose({ height: h });
        sp.root.updateMatrixWorld(true);
        const loc = down && finger ? sp.root.worldToLocal(finger.clone()) : null;
        const who = loc ? (loc.x < 0 ? 'RF' : 'LF') : null;
        for (const k of LEGS) {
          const tgt = k === who ? V(loc.x, 0.02, loc.z) : sp.neutral(k);
          cur[k].lerp(tgt, 1 - Math.exp(-dt * 12));
          sp.setFoot(k, cur[k]);
        }
      } else {
        // walking with the player's own gait: patrols, or goes where the player taps
        let cmd = { v: 0, w: 0 };
        if (target) {
          const dx = target.x - w.x, dz = target.z - w.z;
          if (Math.hypot(dx, dz) < 0.3) { target = null; pause = 2 + Math.random() * 3; }
          else {
            let err = Math.atan2(dx, dz) - w.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
            cmd = Math.abs(err) > 0.45 ? { v: 0, w: Math.sign(err) * 0.7 } : { v: 1, w: clamp(err * 1.6, -0.6, 0.6) };
          }
        } else if (cele !== 5) { pause -= dt; if (pause <= 0) target = pickTarget(); }
        w.update(dt, cmd);
        applyWalker(sp, w, { bob });
      }
      if (marker.visible) { markT += dt; marker.material.opacity = 0.9 * (1 - markT / 1.6); marker.scale.setScalar(1 + markT * 0.5); if (markT > 1.6) marker.visible = false; }
      // labels pinned to the scene
      if (note) {
        const v = V(0, 0, 0);
        if (shown < 2) sp.legs.RM.tibia.getWorldPosition(v); else { sp.body.updateMatrixWorld(true); v.copy(sp.sensorPos); sp.body.localToWorld(v); }
        const p = stage.project(v);
        note.style.transform = `translate(${Math.round(clamp(p.x - note.offsetWidth - 14, 8, stage.w - note.offsetWidth - 8))}px, ${Math.round(p.y - 46)}px)`;
      }
      if (sticker) sticker.style.transform = `translate(${Math.round(stage.w * 0.94 - sticker.offsetWidth)}px, ${Math.round(stage.h * (stage.horizon + 0.012))}px) rotate(-4deg)`;
    },
    exit() { stage.rig.remove(marker); clearTimeout(banner.t); },
  };
};

// ---------------------------------------------------------------- engineering ledger
screens.Ledger = (sel = null) => {
  let idx;
  const render = () => {
    const L = S.ledger, e = L[idx];
    const strip = L.map((x, i) => `<button class="ver ${i === idx ? 'cur' : ''}" data-i="${i}"><b>${x.ver}</b><span>${x.title}</span></button>`).join('');
    const body = !e ? `<p class="empty">还没有记录。完成第 1 单元后，这里会生成第一页设定稿：三视图由精灵的模型直接画出，规格表里是你亲手调出的参数。</p>` : `
      <nav class="vers" aria-label="版本">${strip}</nav>
      <section class="page">
        <div class="ph"><div><p class="kicker">SHEET ${String(idx + 1).padStart(2, '0')} · ${e.date}</p><h3>${e.evolved ? 'ASTRA-02 · 成长体' : 'ASTRA-01 · 幼体'}</h3><p class="sub2">${e.ver} · ${e.title}${e.unit ? ` · 来自第 ${e.unit} 单元` : ''}</p></div>
          <div class="seal"><span>已上色<small>${e.ver}</small></span></div></div>
        <figure class="view wide"><figcaption>SIDE 侧视</figcaption><canvas data-v="side"></canvas><p class="dim" id="d-side"></p></figure>
        <div class="two">
          <figure class="view"><figcaption>TOP 俯视</figcaption><canvas data-v="top"></canvas></figure>
          <figure class="view"><figcaption>FRONT 正视</figcaption><canvas data-v="front"></canvas><p class="dim" id="d-front"></p></figure>
        </div>
        <table class="spec">${e.rows.map(r => `<tr class="${r[2] ? 'mine' : ''}"><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
        <p class="legend"><i></i>黄色标出的是你亲手调出的参数${e.stage < 2 ? '；浅色线条是还没学会的部件' : ''}</p>
        <button class="btn dark wide" id="replay">▶ 回放这个版本</button>
      </section>`;
    ui.innerHTML = `<section class="ledger" id="ledger">
      <header class="lh"><button class="back dark" id="lback" aria-label="返回栖地">‹</button><div><p class="kicker">ENGINEERING LEDGER</p><h2>工程年轮</h2></div></header>
      ${body}
      <footer class="lf"><button class="link" id="reset">重置进度</button><span id="reset-c" hidden>确定清空全部进度吗？<button class="link red" id="reset-y">清空</button><button class="link" id="reset-n">取消</button></span>
        <p>进度只保存在这台设备的浏览器里。</p></footer>
    </section>`;
    $('#lback').onclick = () => go(screens.Home());
    $('#reset').onclick = () => { $('#reset').hidden = true; $('#reset-c').hidden = false; };
    $('#reset-n').onclick = () => { $('#reset').hidden = false; $('#reset-c').hidden = true; };
    $('#reset-y').onclick = () => { resetAll(); go(screens.Home()); };
    if (!e) return;
    for (const b of ui.querySelectorAll('.ver')) b.onclick = () => { idx = +b.dataset.i; render(); };
    $('#replay').onclick = () => go(screens.Home({ replay: e }));
    const cur = ui.querySelector('.ver.cur'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'center', block: 'nearest' });
    // draw the three views from the live model
    const sp = useSpirit(e.evolved);
    sp.setLook('ink', solidFor(e.stage, e.evolved));
    const g = gaitFor(sp.form, e.gait);
    sp.setPose({ height: e.stage < 2 ? SIT : g.bodyH, lean: 0 });
    for (const k of LEGS) sp.setFoot(k, sp.neutral(k));
    const cvs = {}; for (const c of ui.querySelectorAll('canvas[data-v]')) cvs[c.dataset.v] = c;
    const info = stage.blueprints(sp, cvs);
    $('#d-side').textContent = `全长 ${mm(info.size.z)} mm · 高 ${mm(info.box.max.y)} mm`;
    $('#d-front').textContent = `站姿宽度 ${mm(info.size.x)} mm`;
  };
  return {
    enter() { stage.setView('habitat'); idx = sel === null ? S.ledger.length - 1 : sel; render(); },
    tick() {},
  };
};
