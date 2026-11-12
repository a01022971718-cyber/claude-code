// The five experiments. Each one produces real parameters that drive the spirit afterwards.
import {
  $, clamp, ease, mm, rad, deg, clone, ui, stage, S, save, useSpirit, standStill, applyWalker, tripod,
  screens, go, openSheet, toast, slider, bindSlider, MAT, ring, sector, glowDot, SupportViz, record, V, PAL, LEGS, PolyLine,
} from './core.js';
import { UNITS } from './content.js';
import { Walker, evaluate, learn, speedOf, SAFE_MARGIN, SLOPE_DEG, describeGroups, defaultGait, comPoint } from './gait.js';

const LEG_NAME = { LF: '左前', LM: '左中', LR: '左后', RF: '右前', RM: '右中', RR: '右后' };

function shell(n) {
  const u = UNITS[n - 1];
  ui.innerHTML = `
    <header class="top eng-top">
      <button class="back" id="back" aria-label="返回栖地">‹</button>
      <div class="tt"><h2>实验 0${n} · ${u.short || u.name}</h2><p class="sub">${u.code}</p></div>
      <span class="pill" id="pill">进行中</span>
    </header>
    <div class="mid"><p class="goal">${u.goal}</p><p class="toast" id="toast" hidden></p></div>
    <footer class="bottom"><div class="panel" id="panel"></div></footer>`;
  $('#back').onclick = () => go(screens.Home());
}
function tracker() {
  const list = [];
  return { add(o) { stage.rig.add(o); list.push(o); return o; }, clear() { for (const o of list) stage.rig.remove(o); list.length = 0; } };
}
function passUnit(n, rows, apply) {
  const u = UNITS[n - 1], redo = S.stage >= n;
  apply();
  if (S.stage < n) S.stage = n;
  record(n, redo ? `${u.ledger}（再调）` : u.ledger, rows);
  $('#pill').textContent = '通过'; $('#pill').classList.add('ok');
  const el = openSheet(`
    <span class="tagk ok">通过 · 第 ${n} 单元</span>
    <h3>${redo ? '新参数已生效' : u.ledger}</h3>
    <p>${redo ? '这一版参数已经记进工程年轮，精灵从现在起按新参数行动。' : u.pass}</p>
    <table class="mini">${rows.map(r => `<tr class="${r[2] ? 'mine' : ''}"><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>
    <div class="row"><button class="btn y" id="to-home">回到栖地 ▸</button></div>`);
  $('#to-home', el).onclick = () => go(screens.Home({ celebrate: redo ? 0 : n }));
}

// ================================================================ 01 joints (forward kinematics)
screens.Exp1 = () => {
  const O = tracker(), a = { j1: 0, j2: 35, j3: -70 }, TG = [[-18, 22, -86], [25, 48, -75]];
  let sp, idx = 0, hold = 0, done = false, tPos, dot, line, drop, tRing, fRing, d = 9;
  const setTarget = (i) => {
    tPos = sp.fk('RF', rad(TG[i][0]) * sp.legs.RF.side, rad(TG[i][1]), rad(TG[i][2]));
    dot.position.copy(tPos); tRing.position.set(tPos.x, 0.01, tPos.z);
    drop.set([tPos, V(tPos.x, 0, tPos.z)]);
    $('#p-t').textContent = `目标 ${i + 1} / ${TG.length}`;
  };
  return {
    enter() {
      stage.setView('eng'); sp = useSpirit(false); standStill(sp); sp.setLook('eng', null, 'RF');
      stage.engCam({ offset: V(-8.6, 4.5, 8.6), look: V(-1.4, 0.45, 1.4), lift: 0.05 });
      shell(1);
      $('#panel').innerHTML = `<div class="prog"><span id="p-t">目标 1 / 2</span><span id="p-d" class="num">相距 — mm</span></div>`
        + slider('j1', 'J1 前后摆', -40, 40, 1, a.j1, v => v + '°') + slider('j2', 'J2 抬大腿', -10, 70, 1, a.j2, v => v + '°') + slider('j3', 'J3 弯小腿', -140, -30, 1, a.j3, v => v + '°');
      for (const k of ['j1', 'j2', 'j3']) bindSlider(k, v => v + '°', v => { a[k] = v; });
      dot = O.add(glowDot(0xffd21f, 0.55)); tRing = O.add(ring(PAL.yellow, 0.1, 0.15)); fRing = O.add(ring(PAL.cyan, 0.05, 0.08));
      line = new PolyLine(2, MAT.yelDash); O.add(line.line); drop = new PolyLine(2, MAT.yel); O.add(drop.line);
      setTarget(0);
    },
    tick(dt) {
      sp.setAngles('RF', rad(a.j1) * sp.legs.RF.side, rad(a.j2), rad(a.j3));
      const f = sp.footNow('RF'); d = f.distanceTo(tPos);
      line.set([f, tPos]); fRing.position.set(f.x, 0.012, f.z);
      $('#p-d').textContent = `相距 ${mm(d)} mm`; $('#p-d').classList.toggle('near', d < 0.1);
      if (done) return;
      hold = d < 0.1 ? hold + dt : 0;
      if (hold > 0.4) {
        hold = 0; idx++;
        if (idx < TG.length) { setTarget(idx); toast('碰到了。还有一个目标，这次悬在空中，要把腿抬起来。', 'good'); }
        else {
          done = true;
          passUnit(1, [['抬腿时的关节角', `J1 ${a.j1}° · J2 ${a.j2}° · J3 ${a.j3}°`, true], ['足尖误差', `${mm(d)} mm`], ['腿长（大腿 + 小腿）', `${mm(sp.form.L1)} + ${mm(sp.form.L2)} mm`]], () => {});
        }
      }
    },
    exit() { O.clear(); },
  };
};

// ================================================================ 02 inverse kinematics
screens.Exp2 = () => {
  const O = tracker();
  let sp, L, f, rmin, rmax, beacons, far, target, cur, down = false, ok = true, done = false, finger, miss, passT = 0;
  return {
    enter() {
      stage.setView('eng'); sp = useSpirit(false); standStill(sp); sp.setLook('eng', null, 'RF');
      stage.engCam({ offset: V(-7.6, 10.4, 9.6), look: V(-1.7, 0, 1.9), lift: 0.04 });
      shell(2);
      L = sp.legs.RF; f = sp.form;
      const dy = sp.height + L.M.y;
      rmax = f.coxa + Math.sqrt((f.L1 + f.L2 - 0.01) ** 2 - dy * dy); rmin = 0.8;
      const P = (r, da) => V(L.M.x + r * Math.cos(L.baseYaw + da), 0, L.M.z - r * Math.sin(L.baseYaw + da));
      const sec = O.add(sector(PAL.cyan, rmin, rmax, L.baseYaw - f.yawLimit, 2 * f.yawLimit, 0.1)); sec.position.set(L.M.x, 0.006, L.M.z);
      const arc = new PolyLine(26, MAT.cyan); O.add(arc.line);
      arc.set(Array.from({ length: 26 }, (_, i) => { const p = P(rmax, -f.yawLimit + 2 * f.yawLimit * i / 25); p.y = 0.01; return p; }));
      beacons = [P(1.35, -0.5), P(1.78, 0.12), P(1.2, 0.62)].map(p => {
        const dot = O.add(glowDot(0xffd21f, 0.5)); dot.position.set(p.x, 0.06, p.z);
        const rg = O.add(ring(PAL.yellow, 0.12, 0.17)); rg.position.set(p.x, 0.012, p.z);
        return { p, hit: false, dot, rg };
      });
      const fp = P(rmax + 0.6, -0.12);
      far = { p: fp, found: false, dot: O.add(glowDot(0xff2e4d, 0.55)), rg: O.add(ring(PAL.red, 0.12, 0.17)) };
      far.dot.position.set(fp.x, 0.06, fp.z); far.rg.position.set(fp.x, 0.012, fp.z);
      finger = O.add(ring(0xffffff, 0.16, 0.2, 0.7)); finger.visible = false;
      miss = new PolyLine(2, MAT.redDash); O.add(miss.line); miss.line.visible = false;
      target = sp.neutral('RF'); cur = target.clone();
      $('#panel').innerHTML = `<div class="readouts"><div><b id="r1">0°</b><span>J1 前后摆</span></div><div><b id="r2">0°</b><span>J2 抬大腿</span></div><div><b id="r3">0°</b><span>J3 弯小腿</span></div></div>
        <p class="status" id="st">信标 0 / 3 · 红色信标还没试</p><p class="hintline">这三个角度不是你调的，是它根据你手指的位置算出来的。</p>`;
    },
    pointer(type, e) {
      if (type === 'down') down = true;
      if (type === 'up') { down = false; finger.visible = false; return; }
      if (!down) return;
      const g = stage.groundPoint(e.clientX, e.clientY);
      if (g) { target = V(g.x, 0, g.z); finger.visible = true; finger.position.set(g.x, 0.014, g.z); }
    },
    tick(dt) {
      cur.lerp(target, 1 - Math.exp(-dt * 14));
      ok = sp.setFoot('RF', cur);
      const foot = sp.footNow('RF'), lg = sp.legs.RF;
      $('#r1').textContent = Math.round(deg(lg.j1) * lg.side) + '°'; $('#r2').textContent = Math.round(deg(lg.j2)) + '°'; $('#r3').textContent = Math.round(deg(lg.j3)) + '°';
      miss.line.visible = !ok && down; if (!ok) miss.set([V(foot.x, 0.02, foot.z), V(target.x, 0.02, target.z)]);
      if (done) { passT += dt; return; }
      for (const b of beacons) if (!b.hit && ok && foot.distanceTo(b.p) < 0.16) {
        b.hit = true; b.dot.material.color.set(0x5cf2ff); b.rg.material.color.set(0x5cf2ff);
        toast('碰到了。看下面的三个角度：每到一个新位置，它都重新算了一遍。', 'good');
      }
      if (!far.found && !ok && down && target.distanceTo(far.p) < 0.5) {
        far.found = true;
        const over = Math.hypot(far.p.x - L.M.x, far.p.z - L.M.z) - rmax;
        toast(`够不到。腿已经伸直了，红色信标在工作空间外面 ${mm(over)} mm。`, 'bad');
      }
      const n = beacons.filter(b => b.hit).length;
      $('#st').textContent = `信标 ${n} / 3 · 红色信标${far.found ? '：够不到，在工作空间外' : '还没试'}`;
      if (n === 3 && far.found) {
        done = true;
        setTimeout(() => passUnit(2, [['工作空间半径', `${mm(rmin)}–${mm(rmax)} mm`], ['J1 摆动范围', `±${Math.round(deg(f.yawLimit))}°`], ['每步解算', '6 条腿 × 3 个关节角']], () => {}), 900);
      }
    },
    exit() { O.clear(); },
  };
};

// ================================================================ shared: gait phase editor
function gaitEditor(g, onChange) {
  const rows = LEGS.map(k => `<div class="grow"><span>${LEG_NAME[k]}</span><div class="track" data-k="${k}"><div class="bar" style="left:${g.phases[k] * 100}%"></div></div></div>`).join('');
  const html = `<div class="gait" id="gait">${rows}<div class="gait-ph"><i id="ph"></i></div></div>`;
  const bind = () => {
    for (const tr of document.querySelectorAll('#gait .track')) {
      const bar = tr.firstElementChild, k = tr.dataset.k;
      let grab = null;
      const at = (e) => {
        const r = tr.getBoundingClientRect();
        const p = clamp(Math.round(((e.clientX - r.left) / r.width - grab) / 0.25) * 0.25, 0, 0.5);
        if (p !== g.phases[k]) { g.phases[k] = p; bar.style.left = p * 100 + '%'; onChange(); }
      };
      tr.addEventListener('pointerdown', (e) => {
        if (tr.closest('.locked')) return;
        const r = bar.getBoundingClientRect(), tw = tr.getBoundingClientRect().width;
        grab = (e.clientX >= r.left && e.clientX <= r.right) ? (e.clientX - r.left) / tw : 0.25;
        tr.setPointerCapture(e.pointerId); bar.classList.add('drag'); at(e);
      });
      tr.addEventListener('pointermove', (e) => { if (grab !== null) at(e); });
      const end = () => { grab = null; bar.classList.remove('drag'); };
      tr.addEventListener('pointerup', end); tr.addEventListener('pointercancel', end);
    }
  };
  return { html, bind };
}
function tipFrom(w, m, slopeDeg) {
  if (m.n < 3) return { px: 0.16, rz: 0.1, drop: w.g.bodyH - 0.3, back: 0 };
  const c = comPoint(w.form, w.g, slopeDeg);
  let cx = 0, cz = 0; for (const p of m.hull) { cx += p.x / m.hull.length; cz += p.z / m.hull.length; }
  const dx = c.x - cx, dz = c.z - cz, n = Math.hypot(dx, dz) || 1;
  return { px: 0.6 * dz / n, rz: -0.6 * dx / n, drop: 0.28, back: slopeDeg ? 1.2 : 0 };
}

// ================================================================ 03 gait
screens.Exp3 = () => {
  const O = tracker(), GOAL = 10;
  const g = clone(S.gait || defaultGait()); g.bodyH = 0.8; g.lean = 0;
  let sp, w, viz, running = false, tip = null, fails = 0, done = false;
  const setRun = (on) => { running = on; $('#run').disabled = on; $('#run').textContent = on ? '仿真中…' : '▶ 运行仿真'; $('#gait').classList.toggle('locked', on); };
  const fail = (m) => {
    setRun(false); fails++; tip = { ...tipFrom(w, m, 0), t: 0 };
    let msg = m.n < 3 ? `有一瞬间只有 ${m.n} 条腿着地，撑不住身体。任何时刻至少要留 3 条腿在地上。` : '重心跑到了支撑三角形外面。着地的 3 条腿要把重心围在中间。';
    if (fails >= 4) msg += ' 提示：左前、右中、左后编成一组，另外三条编成一组，两组错开半个周期。';
    else if (fails >= 2) msg += ' 提示：同时抬起的腿，不能都在身体的同一侧。';
    toast(msg, 'bad');
  };
  return {
    enter() {
      stage.setView('eng'); sp = useSpirit(false); standStill(sp); sp.setLook('eng');
      w = new Walker(sp.form); w.setGait(g); w.reset();
      stage.engCam({ offset: V(-11.2, 9.7, 15.5), look: V(0, 0.2, 0.6), lift: 0.12, target: () => V(w.x, 0, w.z) });
      shell(3);
      viz = new SupportViz(); O.add(viz.group);
      for (const z of [0, GOAL]) { const l = new PolyLine(2, MAT.yel); l.set([V(-3.2, 0.01, z), V(3.2, 0.01, z)]); O.add(l.line); }
      const ed = gaitEditor(g, () => {});
      $('#panel').innerHTML = `<div class="prog"><span>色块 = 这条腿抬起的时段</span><span id="mg" class="num">裕度 — mm</span></div>${ed.html}`
        + slider('sl', '步长', 50, 80, 1, mm(g.stepLen), v => v + ' mm') + slider('sh', '抬腿高度', 15, 45, 1, mm(g.stepH), v => v + ' mm')
        + `<div class="row"><button class="btn y wide" id="run">▶ 运行仿真</button></div>`;
      ed.bind();
      bindSlider('sl', v => v + ' mm', v => { g.stepLen = v / 100; }); bindSlider('sh', v => v + ' mm', v => { g.stepH = v / 100; });
      $('#run').onclick = () => { w.reset(); w.setGait(g); tip = null; toast(''); setRun(true); };
    },
    tick(dt) {
      if (tip) { tip.t += dt; const k = ease(tip.t / 0.8); applyWalker(sp, w, { pitch: tip.px * k, roll: tip.rz * k, drop: tip.drop * k }); return; }
      if (running) {
        w.update(dt * 1.3, { v: 1 });
        const m = w.margin(0);
        $('#mg').textContent = `裕度 ${m.n < 3 ? '—' : mm(m.m)} mm · 已走 ${mm(Math.max(0, w.z)) / 10 | 0} cm`;
        $('#ph').style.left = w.phase * 100 + '%';
        if (w.t > 0.04 && (m.n < 3 || m.m < 0.03)) fail(m);
        else if (w.z >= GOAL && !done) {
          done = true; setRun(false);
          const ev = evaluate(sp.form, g, 0);
          passUnit(3, [['步态', `${describeGroups(g)}（相位由你排定）`, true], ['步长', `${mm(g.stepLen)} mm`, true], ['抬腿高度', `${mm(g.stepH)} mm`, true],
            ['平地速度', `${mm(speedOf(g))} mm/s`], ['平地最小裕度', `${mm(ev.minMargin)} mm`]], () => { S.gait = clone(g); });
        }
      }
      applyWalker(sp, w); viz.update(w, 0);
    },
    exit() { O.clear(); },
  };
};

// ================================================================ 04 stability on the slope
function drawMargin(cv, curve) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const lo = -0.15, hi = 0.6, Y = (v) => H - 6 - (clamp(v, lo, hi) - lo) / (hi - lo) * (H - 12), X = (i) => 4 + i / (curve.length - 1) * (W - 8);
  x.fillStyle = 'rgba(255,46,77,.14)'; x.fillRect(0, Y(SAFE_MARGIN), W, H - Y(SAFE_MARGIN));
  x.strokeStyle = '#ff2e4d'; x.setLineDash([5, 4]); x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, Y(SAFE_MARGIN)); x.lineTo(W, Y(SAFE_MARGIN)); x.stroke(); x.setLineDash([]);
  const pts = curve.concat([curve[0]]);
  const safe = Math.min(...curve) >= SAFE_MARGIN;
  x.strokeStyle = safe ? '#5cf2ff' : '#ffd21f'; x.lineWidth = 2.2; x.lineJoin = 'round'; x.beginPath();
  pts.forEach((v, i) => { const px = 4 + i / (pts.length - 1) * (W - 8); i ? x.lineTo(px, Y(v)) : x.moveTo(px, Y(v)); }); x.stroke();
  x.fillStyle = '#ff5c74'; x.font = '500 10px "JetBrains Mono", monospace'; x.fillText('安全线 20 mm', 6, Y(SAFE_MARGIN) - 4);
  x.fillStyle = '#9fb6c9'; x.fillText('一个步态周期内的稳定裕度', 6, 12);
}
screens.Exp4 = () => {
  const O = tracker(), GOAL = 7;
  const g = clone(S.gait || tripod()); g.bodyH = 0.8; g.lean = 0; if (S.slope) Object.assign(g, S.slope);
  let sp, w, viz, running = false, tip = null, done = false, ev;
  const refresh = () => {
    ev = evaluate(sp.form, g, SLOPE_DEG);
    drawMargin($('#chart'), ev.curve);
    const m = $('#mg'); m.textContent = `预计最小裕度 ${mm(ev.minMargin)} mm`; m.classList.toggle('near', ev.minMargin >= SAFE_MARGIN); m.classList.toggle('low', ev.minMargin < SAFE_MARGIN);
  };
  const setRun = (on) => { running = on; $('#run').disabled = on; $('#run').textContent = on ? '爬坡中…' : '▶ 上坡试一次'; };
  return {
    enter() {
      stage.setView('eng'); stage.setSlope(SLOPE_DEG); sp = useSpirit(false); standStill(sp, g.bodyH, g.lean); sp.setLook('eng');
      w = new Walker(sp.form); w.setGait(g); w.reset();
      stage.engCam({ offset: V(-18.4, 9.2, 11.9), look: V(-0.3, 0.5, 0.0), lift: 0.12, target: () => V(w.x, 0, w.z) });
      shell(4); $('#pill').textContent = '坡度 18°';
      viz = new SupportViz(); O.add(viz.group);
      for (const z of [0, GOAL]) { const l = new PolyLine(2, MAT.yel); l.set([V(-3.2, 0.01, z), V(3.2, 0.01, z)]); O.add(l.line); }
      $('#panel').innerHTML = `<canvas id="chart" class="chart"></canvas><div class="prog"><span>红圈 = 重心的投影</span><span id="mg" class="num"></span></div>`
        + slider('sl', '步长', 20, 80, 1, mm(g.stepLen), v => v + ' mm') + slider('bh', '机身高度', 45, 90, 1, mm(g.bodyH), v => v + ' mm') + slider('ln', '重心前移', 0, 30, 1, mm(g.lean), v => v + ' mm')
        + `<div class="row"><button class="btn y wide" id="run">▶ 上坡试一次</button></div>`;
      const ch = () => { if (!running && !tip) { w.reset(); } refresh(); };
      bindSlider('sl', v => v + ' mm', v => { g.stepLen = v / 100; ch(); }); bindSlider('bh', v => v + ' mm', v => { g.bodyH = v / 100; ch(); }); bindSlider('ln', v => v + ' mm', v => { g.lean = v / 100; ch(); });
      $('#run').onclick = () => { w.reset(); w.setGait(g); tip = null; toast(''); setRun(true); };
      refresh();
    },
    tick(dt) {
      if (tip) { tip.t += dt; const k = ease(tip.t / 0.9); w.z = tip.z0 - tip.back * k; applyWalker(sp, w, { pitch: tip.px * k * 1.5, roll: tip.rz * k, drop: tip.drop * k }); return; }
      if (running) {
        w.update(dt * 1.3, { v: 1 });
        const m = w.margin(SLOPE_DEG);
        if (w.t > 0.04 && m.m < SAFE_MARGIN) {
          setRun(false); tip = { ...tipFrom(w, m, SLOPE_DEG), t: 0, z0: w.z };
          toast(`稳定裕度跌到 ${mm(Math.max(m.m, 0))} mm，低于 20 mm 安全线，它向后翻了。看曲线最低的那一段：那时支撑三角形的后边离重心最近。`, 'bad');
        } else if (w.z >= GOAL && !done) {
          done = true; setRun(false);
          passUnit(4, [['步长', `${mm(g.stepLen)} mm`, true], ['机身高度', `${mm(g.bodyH)} mm`, true], ['重心前移', `${mm(g.lean)} mm`, true],
            ['坡上最小裕度', `${mm(ev.minMargin)} mm（安全线 20 mm）`], ['坡上速度', `${mm(speedOf(g))} mm/s`]], () => { S.slope = { stepLen: g.stepLen, bodyH: g.bodyH, lean: g.lean }; });
        }
      }
      applyWalker(sp, w); viz.update(w, SLOPE_DEG);
    },
    exit() { O.clear(); },
  };
};

// ================================================================ 05 learning to walk
function drawRace(cv, gen, t) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const n = gen.kids.length, lh = H / n, vmax = Math.max(0.5, ...gen.kids.map(k => k.ev.feasible ? k.ev.speed : 0));
  const k = ease(t);
  gen.kids.forEach((c, i) => {
    const y = i * lh + lh / 2, okk = c.ev.feasible;
    x.strokeStyle = 'rgba(92,242,255,.14)'; x.lineWidth = 1; x.beginPath(); x.moveTo(8, y); x.lineTo(W - 8, y); x.stroke();
    const px = 12 + (W - 30) * (okk ? clamp(c.ev.speed / vmax, 0.08, 1) * k : Math.min(k, 0.16));
    const col = !okk ? '#ff2e4d' : i === 0 ? '#ffd21f' : '#5cf2ff';
    x.fillStyle = col; x.globalAlpha = okk ? 1 : 0.85;
    x.beginPath(); x.roundRect(px - 7, y - 2.6, 14, 5.2, 2.6); x.fill();
    x.strokeStyle = col; x.lineWidth = 1.1;
    for (const dx of [-4, 0, 4]) { x.beginPath(); x.moveTo(px + dx, y - 5); x.lineTo(px + dx, y + 5); x.stroke(); }
    if (!okk && k > 0.3) { x.font = '700 9px sans-serif'; x.fillText('摔了', px + 11, y + 3); }
    x.globalAlpha = 1;
  });
}
screens.Exp5 = () => {
  const O = tracker();
  const hand = clone(S.gait || tripod()); hand.bodyH = 0.8; hand.lean = 0; if (S.slope) Object.assign(hand, S.slope);
  const wt = S.learned ? clone(S.learned.w) : { speed: 100, stable: 0, energy: 0, clear: 0 };
  let sp, w, viz, it = null, gen = null, raceT = 0, best = null, mode = 'setup', handEv;
  const NAMES = { speed: '走得快', stable: '站得稳', energy: '省电', clear: '抬得起腿' };
  const setup = () => {
    mode = 'setup'; $('#pill').textContent = '坡度 18°';
    $('#panel').innerHTML = `<div class="prog"><span>奖励权重：你觉得什么重要</span><span class="num">共 16 代</span></div>`
      + Object.keys(NAMES).map(k => slider('w-' + k, NAMES[k], 0, 100, 5, wt[k], v => v + '%')).join('')
      + `<div class="row"><button class="btn y wide" id="learn">开始学习</button></div>`;
    for (const k of Object.keys(NAMES)) bindSlider('w-' + k, v => v + '%', v => { wt[k] = v; });
    $('#learn').onclick = start;
  };
  const start = () => {
    if (wt.speed + wt.stable + wt.energy + wt.clear === 0) { toast('四个权重都是 0，它不知道该追求什么。至少调高一个。', 'bad'); return; }
    toast(''); mode = 'learn'; S.runs = (S.runs || 0) + 1; save();
    it = learn(sp.form, hand, { speed: wt.speed / 100, stable: wt.stable / 100, energy: wt.energy / 100, clear: wt.clear / 100 }, { seed: S.runs, gens: 16, pop: 12 });
    $('#panel').innerHTML = `<div class="prog"><span id="gn">第 1 / 16 代</span><span id="gb" class="num"></span></div><canvas id="race" class="race"></canvas><p class="hintline">每一代试 12 种走法。黄色是这一代得分最高的，红色的摔了。上面的线框演示的是目前最好的走法。</p>`;
    next();
  };
  const next = () => {
    const r = it.next();
    if (r.done) return finish();
    gen = r.value; raceT = 0; best = gen.best;
    $('#gn').textContent = `第 ${gen.gen} / ${gen.gens} 代`;
    $('#gb').textContent = `最好：${mm(best.ev.speed)} mm/s · 裕度 ${mm(best.ev.minMargin)} mm`;
  };
  const finish = () => {
    mode = 'done'; gen = null;
    const e = best.ev, okM = e.minMargin >= SAFE_MARGIN, okC = e.clearance >= 0.15;
    const ratio = e.speed / handEv.speed;
    let verdict;
    if (!okM) verdict = `它跑到了 ${mm(e.speed)} mm/s，但坡上裕度只剩 ${mm(e.minMargin)} mm，低于 20 mm 安全线。它没有做错：奖励里没写"稳"，它就不会替你在乎。这就是奖励投机。`;
    else if (!okC) verdict = `它几乎不抬腿了，只抬 ${mm(e.clearance)} mm，等于贴着地蹭，草地上一根草茎就能绊住它。奖励里没写"抬得起腿"，它就把抬腿省掉了。这也是奖励投机。`;
    else verdict = `这套步态可以用：坡上裕度 ${mm(e.minMargin)} mm，抬腿 ${mm(e.clearance)} mm，速度 ${mm(e.speed)} mm/s${ratio > 1.05 ? `，比你手排的快 ${Math.round((ratio - 1) * 100)}%` : ratio < 0.95 ? `，比你手排的慢 ${Math.round((1 - ratio) * 100)}%，换来的是更大的余量` : ''}。`;
    const good = okM && okC;
    const cell = (v, bad) => `<td class="${bad ? 'bad' : ''}">${v}</td>`;
    $('#panel').innerHTML = `<table class="cmp"><tr><th></th><th>你手排的</th><th>它学到的</th></tr>
      <tr><td>速度</td><td>${mm(handEv.speed)} mm/s</td>${cell(mm(e.speed) + ' mm/s')}</tr>
      <tr><td>坡上最小裕度</td><td>${mm(handEv.minMargin)} mm</td>${cell(mm(e.minMargin) + ' mm', !okM)}</tr>
      <tr><td>抬腿余量</td><td>${mm(handEv.clearance)} mm</td>${cell(mm(e.clearance) + ' mm', !okC)}</tr>
      <tr><td>能耗指数</td><td>${handEv.energy.toFixed(1)}</td>${cell(e.energy.toFixed(1))}</tr></table>
      <p class="verdict ${good ? 'good' : 'bad'}">${verdict}</p>
      <div class="row"><button class="btn o" id="again">调整奖励再学</button><button class="btn y" id="adopt" ${good ? '' : 'disabled'}>采用这套步态</button></div>`;
    $('#pill').textContent = good ? '可采用' : '奖励投机';
    $('#again').onclick = () => { w.setGait(hand); setup(); };
    $('#adopt').onclick = () => {
      const g = best.gait;
      passUnit(5, [['奖励权重', Object.keys(NAMES).map(k => `${NAMES[k]} ${wt[k]}%`).join(' · '), true], ['学到的步长 / 抬腿', `${mm(g.stepLen)} mm / ${mm(g.stepH)} mm`], ['学到的机身高度', `${mm(g.bodyH)} mm`],
        ['坡上速度', `${mm(e.speed)} mm/s（手排 ${mm(handEv.speed)} mm/s）`], ['坡上最小裕度', `${mm(e.minMargin)} mm`], ['学习方法', '进化策略 · 16 代 × 12 个']],
        () => { S.learned = { gait: clone(g), w: clone(wt) }; });
    };
  };
  return {
    enter() {
      stage.setView('eng'); stage.setSlope(SLOPE_DEG); sp = useSpirit(false); standStill(sp, hand.bodyH, hand.lean); sp.setLook('eng');
      handEv = evaluate(sp.form, hand, SLOPE_DEG);
      w = new Walker(sp.form); w.setGait(hand); w.reset();
      stage.engCam({ offset: V(-18.4, 9.2, 11.9), look: V(-0.3, 0.5, 0.0), lift: 0.12, target: () => V(w.x, 0, w.z) });
      shell(5);
      viz = new SupportViz(); O.add(viz.group);
      setup();
    },
    tick(dt) {
      w.update(dt, { v: 1 });
      if (w.z > 45) { const dz = 40; w.z -= dz; for (const k of LEGS) { w.feet[k].z -= dz; w.feet[k].lz -= dz; } }
      applyWalker(sp, w); viz.update(w, SLOPE_DEG);
      if (mode === 'learn' && gen) {
        raceT += dt / 0.75;
        const cv = $('#race'); if (cv) drawRace(cv, gen, Math.min(raceT, 1));
        if (raceT >= 1.15) { w.setGait(clone(best.gait)); next(); }
      }
    },
    exit() { O.clear(); },
  };
};
