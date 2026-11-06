// 「造芯田园」布局线框图（只做评估用的静态示意图，不是实装）。
// 用游戏里现成的像素素材（发电厂守卫、英雄、像素图标）画出 A / B 两种布局，输出到 design/farm-mockups/。
// 用法：node tools/farm-mockups.cjs   （需要 playwright）
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'design', 'farm-mockups');

function PAGE(which) {
const CF = window.CF_DEBUG, I = (n) => CF.Icons.svg(n, 'mi');
document.body.className = ''; document.body.innerHTML = '';
const css = document.createElement('style');
css.textContent = `
  body{margin:0;background:#07060c;font-family:var(--ui,system-ui),sans-serif;color:#ede6d6;overflow:hidden}
  #m{position:fixed;inset:0;overflow:hidden;background:radial-gradient(ellipse at 50% 60%,#0f3a3a,#081a22 55%,#05060c)}
  #fc{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated}
  .g{background:rgba(9,7,20,.68);border:1px solid rgba(255,255,255,.12);border-radius:10px;backdrop-filter:blur(4px)}
  .mi{width:16px;height:16px;display:block;color:#e8f6ff;--ic2:#ffd257}
  .ab{position:absolute;display:flex;gap:5px}
  .ib{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:8.5px;line-height:1;color:#dfe8ff;white-space:nowrap}
  .ib .mi{width:17px;height:17px}
  .ib.c{width:38px;height:38px;border-radius:50%}
  .ib.sq{width:36px;height:36px;border-radius:9px}
  .ib.big{width:58px;height:46px;border-radius:12px;font-size:10px;font-weight:700}
  .ib.big .mi{width:20px;height:20px}
  .dot{position:absolute;right:2px;top:2px;width:7px;height:7px;border-radius:50%;background:#ff3d5a;box-shadow:0 0 4px #ff3d5a}
  .num{position:absolute;right:-3px;bottom:-3px;font-size:8px;background:#ffd257;color:#1a1020;border-radius:6px;padding:0 3px;font-weight:800}
  .prof{display:flex;align-items:center;gap:6px;padding:3px 8px 3px 3px}
  .av{width:34px;height:34px;border-radius:9px;background:#0a2a3d;border:2px solid #19f0e0;position:relative;overflow:hidden}
  .vip{position:absolute;left:-2px;bottom:-2px;font-size:7px;background:linear-gradient(90deg,#ffd257,#ff8a3d);color:#2a1400;font-weight:900;padding:0 3px;border-radius:4px}
  .nm{font-size:11px;font-weight:800}.lv{font-size:9px;color:#9fe8ff}
  .xp{width:84px;height:5px;background:#000a;border-radius:3px;margin-top:2px;overflow:hidden}.xp i{display:block;height:100%;width:58%;background:linear-gradient(90deg,#19f0e0,#c8ff2e)}
  .cur{display:flex;align-items:center;gap:4px;padding:3px 8px;font-size:10.5px;font-family:ui-monospace,monospace}
  .cur b{color:#fff}.cur .p{width:14px;height:14px;border-radius:4px;background:#2a2050;display:grid;place-items:center;font-size:11px;color:#ffd257;margin-left:2px}
  .area{position:absolute;padding:3px 14px;font-size:11px;font-weight:900;letter-spacing:.1em;color:#ffe9a8;background:linear-gradient(90deg,transparent,#3a1d0a,transparent);text-shadow:0 1px 0 #000}
  .ticker{position:absolute;font-size:9.5px;padding:4px 8px;line-height:1.5;color:#cfe;max-width:220px}
  .ticker b{color:#ffd257}.ticker i{font-style:normal;color:#ff7ad9}
  .nav{position:absolute;display:flex;gap:2px;padding:3px}
  .nav .ib{width:44px;height:38px;border-radius:9px}
  .tabs{position:absolute;display:flex;gap:4px}
  .tab{padding:4px 10px;border-radius:8px 8px 0 0;font-size:10.5px;font-weight:800;background:#1a1636;color:#bcb3e6;border:1px solid #ffffff18;border-bottom:none}
  .tab.on{background:linear-gradient(180deg,#19f0e0,#0d8f88);color:#05121f}
  .lbl{position:absolute;left:8px;bottom:8px;font-size:12px;font-weight:900;padding:4px 10px;border-radius:8px;background:#ffd257;color:#1a1020;z-index:9}
  .lbl small{font-weight:600;margin-left:6px}
`;
document.head.appendChild(css);
const m = document.createElement('div'); m.id = 'm'; document.body.appendChild(m);
m.innerHTML = '<canvas id="fc"></canvas>';
const W = innerWidth, H = innerHeight, dpr = 2, cv = document.getElementById('fc');
cv.width = W * dpr; cv.height = H * dpr; const x = cv.getContext('2d'); x.scale(dpr, dpr); x.imageSmoothingEnabled = false;
const add = (html, style) => { const d = document.createElement('div'); d.innerHTML = html; const e = d.firstElementChild; if (style) Object.assign(e.style, style); m.appendChild(e); return e; };
const btn = (ic, t, cls = 'c', extra = '') => '<div class="g ib ' + cls + '">' + I(ic) + '<span>' + t + '</span>' + extra + '</div>';
const DOT = '<span class="dot"></span>';

// ---------- 像素小件 ----------
const px = (X, Y, w, h, c) => { x.fillStyle = c; x.fillRect(Math.round(X), Math.round(Y), Math.ceil(w), Math.ceil(h)); };
function chip(cx, cy, s, stage, t) {
  // 芯片生长 4 阶段：晶圆 → 光刻 → 封装 → 成品（发光）
  const k = s;
  if (stage === 0) { px(cx - 3 * k, cy - 2 * k, 6 * k, 3 * k, '#6f7fb8'); px(cx - 2 * k, cy - 3 * k, 4 * k, k, '#9fb0e8'); return; }
  const body = stage >= 2 ? '#1d1a2e' : '#4a5a9a', pin = stage >= 2 ? '#d8c27a' : '#8aa0d8';
  const w = (stage + 3) * k * 1.4, h = (stage + 2) * k * 1.2;
  for (let i = 0; i < stage + 2; i++) { px(cx - w / 2 - k, cy - h + i * (h / (stage + 2)) + k * 0.3, k, k * 0.6, pin); px(cx + w / 2, cy - h + i * (h / (stage + 2)) + k * 0.3, k, k * 0.6, pin); }
  px(cx - w / 2, cy - h, w, h, body);
  px(cx - w / 2 + k, cy - h + k, w - 2 * k, k * 0.8, stage >= 3 ? '#19f0e0' : '#6a78b8');
  if (stage >= 3) { x.globalAlpha = 0.35 + 0.25 * Math.sin(t); px(cx - w / 2 - 2 * k, cy - h - 2 * k, w + 4 * k, h + 3 * k, '#19f0e0'); x.globalAlpha = 1; px(cx + w / 2, cy - h - 2 * k, k, k, '#fff'); }
}
function bubble(bx, by, kind) {
  // 状态气泡：乱码虫（要除错）/ 断电（要供电）/ 过热（要冷却）/ 可收获
  const c = { bug: '#ff4f9a', power: '#ffd257', heat: '#4ef0ff', ripe: '#6fdc8c' }[kind];
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(bx - 11, by - 22, 22, 18, 5); x.fill();
  px(bx - 2, by - 5, 4, 4, '#ffffff');
  if (kind === 'bug') { px(bx - 5, by - 17, 10, 7, c); px(bx - 7, by - 15, 2, 1, c); px(bx + 5, by - 15, 2, 1, c); px(bx - 3, by - 15, 2, 2, '#fff'); px(bx + 1, by - 15, 2, 2, '#fff'); }
  if (kind === 'power') { x.fillStyle = c; x.beginPath(); x.moveTo(bx + 2, by - 20); x.lineTo(bx - 4, by - 12); x.lineTo(bx, by - 12); x.lineTo(bx - 2, by - 6); x.lineTo(bx + 5, by - 14); x.lineTo(bx + 1, by - 14); x.closePath(); x.fill(); }
  if (kind === 'heat') { px(bx - 1, by - 19, 3, 9, '#ff5d6c'); px(bx - 3, by - 11, 7, 4, '#ff5d6c'); px(bx + 3, by - 18, 4, 1, c); px(bx + 3, by - 15, 4, 1, c); }
  if (kind === 'ripe') { x.fillStyle = c; x.font = 'bold 10px sans-serif'; x.textAlign = 'center'; x.fillText('收', bx, by - 9); x.textAlign = 'left'; }
}
function timer(tx, ty, txt, ok) {
  x.font = 'bold 9px ui-monospace,monospace'; const w = x.measureText(txt).width + 8;
  x.fillStyle = ok ? '#6fdc8c' : 'rgba(9,7,20,.8)'; x.beginPath(); x.roundRect(tx - w / 2, ty - 10, w, 12, 4); x.fill();
  x.fillStyle = ok ? '#0b1a10' : '#e8f6ff'; x.textAlign = 'center'; x.fillText(txt, tx, ty - 1); x.textAlign = 'left';
}
function guard(id, gx, gy, s, label) {
  const P = CF.Collect.PLANTS[id]; P.draw(x, gx, gy, s, { t: 1.3, beat: 0.8 });
  const w = 13 * s, mx = Math.max(38, Math.min(W - 38, gx + w / 2)); x.font = 'bold 9px sans-serif'; x.textAlign = 'center';
  x.fillStyle = 'rgba(9,7,20,.85)'; x.beginPath(); x.roundRect(mx - 36, gy + 11 * s + 3, 72, 26, 5); x.fill();
  x.fillStyle = '#ffe9a8'; x.fillText(label, mx, gy + 11 * s + 13);
  px(mx - 30, gy + 11 * s + 17, 60, 4, '#000'); px(mx - 30, gy + 11 * s + 17, 60, 4, '#19f0e0');
  x.fillStyle = '#9fe8ff'; x.font = '7px ui-monospace,monospace'; x.fillText('电量 1600/1600', mx, gy + 11 * s + 27); x.textAlign = 'left';
}
function pbar(cx2, cy2, p) { px(cx2 - 12, cy2, 24, 3, '#000b'); px(cx2 - 12, cy2, 24 * p, 3, p >= 1 ? '#6fdc8c' : '#19f0e0'); }
function card(cx2, cy2) {
  x.fillStyle = 'rgba(9,7,20,.92)'; x.strokeStyle = '#19f0e0'; x.beginPath(); x.roundRect(cx2 - 52, cy2 - 40, 104, 34, 6); x.fill(); x.stroke();
  x.font = 'bold 9px sans-serif'; x.fillStyle = '#e8f6ff'; x.textAlign = 'center'; x.fillText('逻辑芯片 · 封装中', cx2, cy2 - 27); x.font = 'bold 11px ui-monospace,monospace'; x.fillStyle = '#19f0e0'; x.fillText('05:12 后完成', cx2, cy2 - 13); x.textAlign = 'left';
  px(cx2 - 2, cy2 - 6, 4, 5, 'rgba(9,7,20,.92)');
}
function cart(cx, cy, s) { px(cx, cy, 16 * s, 8 * s, '#7a4a2a'); px(cx, cy - 6 * s, 16 * s, 2 * s, '#ff7ad9'); px(cx + s, cy - 4 * s, 14 * s, 4 * s, '#3a2050'); for (let i = 0; i < 4; i++) px(cx + 2 * s + i * 3.5 * s, cy - 3 * s, 2 * s, 2 * s, ['#19f0e0', '#ffd257', '#ff4f9a', '#6fdc8c'][i]); px(cx + 2 * s, cy + 8 * s, 3 * s, 3 * s, '#222'); px(cx + 11 * s, cy + 8 * s, 3 * s, 3 * s, '#222'); x.font = 'bold 8px sans-serif'; x.fillStyle = '#ffe9a8'; x.fillText('流动商贩', cx, cy - 8 * s); }
function portal(cx, cy, r, t) { for (let i = 0; i < 4; i++) { x.strokeStyle = ['#9b7bff', '#19f0e0', '#ff7ad9', '#ffffff'][i]; x.globalAlpha = 0.85 - i * 0.18; x.lineWidth = 3; x.beginPath(); x.ellipse(cx, cy, Math.max(2, r - i * 3), Math.max(2, r - i * 3) * 1.35, 0, t + i, t + i + 4.6); x.stroke(); } x.globalAlpha = 1; x.lineWidth = 1; x.font = 'bold 8px sans-serif'; x.fillStyle = '#e0d4ff'; x.textAlign = 'center'; x.fillText('传送门 · 其他园区', cx, cy + r * 1.35 + 12); x.textAlign = 'left'; }
function mailbox(mx, my, s) { px(mx, my, 2 * s, 10 * s, '#5a4a3a'); px(mx - 3 * s, my - 6 * s, 8 * s, 6 * s, '#3fd0c9'); px(mx - 3 * s, my - 6 * s, 8 * s, s, '#9ffbff'); px(mx + 5 * s, my - 6 * s, s, 4 * s, '#ff4f9a'); }
function wire(ax, ay, bx, by, t) { x.strokeStyle = '#19f0e0'; x.globalAlpha = 0.55; x.lineWidth = 2; x.setLineDash([4, 4]); x.lineDashOffset = -t * 20; x.beginPath(); x.moveTo(ax, ay); x.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 20, bx, by); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; x.lineWidth = 1; }
const STAGES = [3, 1, 2, 0, 3, 2, 1, 3, 2, 0, 1, 2, 3, 1, 2, 2, 1, 3], TIMES = ['可收获', '12:40', '05:12', '28:00', '可收获', '03:05', '15:22', '可收获', '01:48', '30:00', '18:10', '06:30', '可收获', '20:05', '04:44', '07:59', '16:31', '可收获'];
const BUB = { 1: 'bug', 5: 'power', 9: 'heat', 14: 'bug' };

// ---------- 两套 HUD 骨架（功能完全一致，只是位置不同） ----------
const PROF = '<div class="g prof"><div class="av"><canvas width="68" height="68" id="avc" style="width:34px;height:34px"></canvas><span class="vip">VIP3</span></div><div><div class="nm">造乐 <span class="lv">Lv10</span></div><div class="xp"><i></i></div><div class="lv" style="font-size:8px">579/1000</div></div></div>';
const CURR = (more) => '<div class="g cur"><span style="color:#ffd257">◆</span><b>12,480</b><span class="p">+</span>&nbsp;<span style="color:#9b7bff">▤</span><b>36</b><small style="color:#aaa">图纸</small>&nbsp;<span style="color:#19f0e0">▣</span><b>208</b><small style="color:#aaa">成品</small>' + (more || '') + '</div>';
const EVENTS = [['calendar', '签到'], ['gift', '限时活动'], ['book', '学习周'], ['target', '七日目标'], ['trophy', '赛季'], ['medal', '成就'], ['note', '公告']];
const LEFT = [['chart', '排行榜'], ['brief', '邮件'], ['question', '新手指导'], ['castle', '家园'], ['chat', '聊天']];
const RIGHT = [['sprout', '一键种植'], ['basket', '一键收获'], ['robot', '自动装配', '<span class="num">255</span>'], ['sun', '天降赐福']];
const NAV = [['bolt', '守卫'], ['swords', '挑战'], ['gift', '活动'], ['trophy', '竞技'], ['scale', '任务'], ['users', '好友'], ['guitar', '法宝'], ['star', '英雄'], ['shield', '副本']];
const NAVDOT = { 0: 1, 2: 1, 4: 1, 5: 1 };
const TICKER = '<div class="g ticker"><b>[系统]</b> 第一园区的「逻辑芯片」大丰收 · <i>[园区]</i> 鲸歌：谁有多余的光刻图纸？ · <b>[电站]</b> 核能电站电量充足</div>';
const QUICK = [['pouch', '图纸袋'], ['hammer', '收割'], ['palette', '装扮'], ['up', '扩建']];
const SIDE2 = [['map', '园区地图'], ['shop', '图纸商店'], ['redbook', '任务卷轴']];
const MODTABS = ['田园', '封测线', '芯片铺', '学习'];
function avatar() { const c = document.getElementById('avc'); if (!c) return; const a = c.getContext('2d'); a.imageSmoothingEnabled = false; a.fillStyle = '#0a2a3d'; a.fillRect(0, 0, 68, 68); CF.Heroes.get('zaole').draw(a, 4, 22, 3, { t: 0, noDrone: true }); }

window.drawA = function () {
  // ===== 方案 A：横版村落（参考图一） =====
  const t = 1.2;
  // 背景：服务器楼宇天际线 + 电路地面
  for (let i = 0; i < 14; i++) { const bw = 30 + (i * 37) % 40, bh = 40 + (i * 53) % 70, bx = i * 64 - 10; px(bx, H * 0.44 - bh, bw, bh, '#0c2230'); for (let j = 0; j < 4; j++) px(bx + 6, H * 0.44 - bh + 8 + j * 12, bw - 12, 3, j % 2 ? '#19f0e033' : '#ffd25722'); }
  px(0, H * 0.44, W, H * 0.56, '#0d2b2b'); for (let i = 0; i < 30; i++) px((i * 97) % W, H * 0.46 + (i * 31) % (H * 0.5), 18, 1, '#19f0e026');
  // 三排装配田（透视）
  const rows = 3, cols = 6;
  for (let r = 0; r < rows; r++) {
    const y0 = H * 0.5 + r * 46, sc = 0.82 + r * 0.09, w = 56 * sc, gap = 10 * sc, tw = cols * w + (cols - 1) * gap, x0 = W / 2 - tw / 2 + 8;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c, cx = x0 + c * (w + gap);
      px(cx, y0, w, 26 * sc, '#3a2a5a'); px(cx, y0, w, 4, '#6a5aa0'); px(cx + 3, y0 + 6, w - 6, 16 * sc, '#24183e');
      chip(cx + w / 2, y0 + 18 * sc, 2 * sc, STAGES[i], t + i);
      timer(cx + w / 2, y0 - 12, TIMES[i], TIMES[i] === '可收获');
      if (BUB[i]) bubble(cx + w - 4, y0 - 14, BUB[i]);
    }
  }
  guard('plant_thermal', W * 0.13, H * 0.42, 4, '守卫 · 火力电站');
  guard('plant_nuclear', W * 0.79, H * 0.42, 4, '守卫 · 核能电站');
  wire(W * 0.13 + 26, H * 0.42 + 44, W * 0.28, H * 0.56, t); wire(W * 0.79 + 26, H * 0.42 + 44, W * 0.72, H * 0.56, t);
  cart(W * 0.66, H * 0.36, 2.4); portal(W * 0.36, H * 0.31, 16, t); mailbox(W * 0.27, H * 0.41, 2);
  CF.Heroes.get('xs').draw(x, W * 0.5, H * 0.33, 2.2, { t: 0, walk: true, step: 1 });
  // HUD
  add('<div class="ab" style="left:6px;top:6px">' + PROF + '</div>'); avatar();
  add('<div class="ab" style="left:150px;top:7px">' + EVENTS.map(([i, n], k) => btn(i, n, 'c', k < 3 ? DOT : '')).join('') + '</div>');
  add('<div class="ab" style="right:6px;top:6px">' + CURR('<span class="p">⚙</span>') + '</div>');
  add('<div class="area" style="left:50%;top:52px;transform:translateX(-50%)">星芒港 · 第一园区</div>');
  add('<div class="ab" style="left:6px;top:56px;flex-direction:column">' + LEFT.map(([i, n], k) => btn(i, n, 'sq', k === 1 ? DOT : '')).join('') + '</div>');
  add('<div class="ab" style="right:6px;top:64px;flex-direction:column">' + RIGHT.map(([i, n, e]) => btn(i, n, 'big', e || '')).join('') + '</div>');
  add('<div class="ab" style="left:46px;top:56px;flex-direction:column">' + SIDE2.map(([i, n]) => btn(i, n, 'sq')).join('') + '</div>');
  add('<div class="ab" style="right:6px;bottom:46px">' + btn('star', '收藏', 'sq') + '</div>');
  add('<div class="tabs" style="left:50%;transform:translateX(-50%);bottom:44px">' + MODTABS.map((n, k) => '<span class="tab ' + (k ? '' : 'on') + '">' + n + '</span>').join('') + '</div>');
  add('<div class="g nav" style="left:50%;transform:translateX(-50%);bottom:3px">' + NAV.map(([i, n], k) => btn(i, n, 'sq', NAVDOT[k] ? DOT : '')).join('') + '</div>');
  add(TICKER, { left: '6px', bottom: '88px' });
  add('<div class="ab" style="left:6px;bottom:46px">' + QUICK.map(([i, n]) => btn(i, n, 'sq')).join('') + '</div>');
  add('<div class="lbl" style="left:auto;right:76px;bottom:auto;top:84px">方案 A · 横版村落<small>参考图一 · 田地横排、守卫站两端</small></div>');
};

window.drawB = function (portraitMode) {
  // ===== 方案 B：等距像素田园（参考图二） =====
  const t = 1.2, P = portraitMode;
  const cx = W / 2, cy = P ? H * 0.51 : H * 0.56, a = P ? 26 : 33, N = 4, NE = 6;
  // 电路板地面（菱形）+ 可扩建的外圈（锁）
  const tile = (i, j) => [cx + (i - j) * a, cy + (i + j - NE + 1) * a / 2];
  for (let i = 0; i < NE; i++) for (let j = 0; j < NE; j++) {
    const [tx, ty] = tile(i, j), inner = i >= 1 && i <= N && j >= 1 && j <= N;
    x.fillStyle = inner ? '#1c2f52' : '#0f2a2a'; x.beginPath(); x.moveTo(tx, ty - a / 2); x.lineTo(tx + a, ty); x.lineTo(tx, ty + a / 2); x.lineTo(tx - a, ty); x.closePath(); x.fill();
    x.strokeStyle = inner ? '#4ef0ff55' : '#19f0e022'; x.stroke();
    if (!inner && (i + j) % 3 === 0) { x.fillStyle = '#ffffff40'; x.font = '9px sans-serif'; x.textAlign = 'center'; x.fillText('🔒', tx, ty + 3); x.textAlign = 'left'; }
  }
  let k = 0;
  for (let i = 1; i <= N; i++) for (let j = 1; j <= N; j++) {
    const [tx, ty] = tile(i, j);
    x.fillStyle = '#2e2350'; x.beginPath(); x.moveTo(tx, ty - a / 2 + 4); x.lineTo(tx + a - 6, ty); x.lineTo(tx, ty + a / 2 - 4); x.lineTo(tx - a + 6, ty); x.closePath(); x.fill();
    chip(tx, ty + 3, P ? 1.5 : 1.8, STAGES[k], t + k);
    // B 不在每块田上挂倒计时（等距视角下会挤在一起）：成熟显示「收」，生长中显示进度条，点一块田弹出详情卡
    if (TIMES[k] === '可收获') bubble(tx, ty - 10, 'ripe'); else pbar(tx, ty + 6, [0.3, 0.6, 0.85, 0.1][STAGES[k]] || 0.5);
    if (BUB[k]) bubble(tx + 13, ty - 12, BUB[k]);
    if (k === 6) { x.strokeStyle = '#ffffff'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(tx, ty - a / 2 + 4); x.lineTo(tx + a - 6, ty); x.lineTo(tx, ty + a / 2 - 4); x.lineTo(tx - a + 6, ty); x.closePath(); x.stroke(); x.lineWidth = 1; window._card = [tx, ty - 8]; }
    k++;
  }
  card(window._card[0], window._card[1]);
  const [lx, ly] = tile(0, NE - 1), [rx, ry] = tile(NE - 1, 0), [bx2, by2] = tile(NE - 1, NE - 1), [tx2, ty2] = tile(0, 0);
  const gs = P ? 2.6 : 3.6;
  if (P) { guard('plant_thermal', 4, ly - 11 * gs - 34, gs, '守卫 · 火电'); guard('plant_nuclear', W - 13 * gs - 4, ry - 11 * gs - 34, gs, '守卫 · 核电'); }
  else { guard('plant_thermal', lx - 13 * gs - 6, ly - 11 * gs + 6, gs, '守卫 · 火力电站'); guard('plant_nuclear', rx + 8, ry - 11 * gs + 6, gs, '守卫 · 核能电站'); }
  wire(lx - 6, ly, lx + a, ly, t); wire(rx + 6, ry, rx - a, ry, t);
  if (P) { portal(W * 0.24, cy - 82, 11, t); cart(W * 0.7, cy + 92, 2); mailbox(W * 0.22, cy + 98, 2); CF.Heroes.get('xs').draw(x, cx - 18, cy + 86, 2, { t: 0, walk: true, step: 0 }); }
  else { portal(cx - a * 4.3, cy - a * 1.9, 13, t); cart(cx + a * 3.3, cy + a * 1.9, 2.2); mailbox(cx - a * 3.2, cy + a * 2.3, 2); CF.Heroes.get('xs').draw(x, cx - a * 0.6, cy + a * 2.2, 2.2, { t: 0, walk: true, step: 0 }); }
  // HUD
  add('<div class="ab" style="left:6px;top:6px">' + PROF + '</div>'); avatar();
  add('<div class="ab" style="right:6px;top:6px">' + CURR('<span class="p">⚙</span>') + '</div>');
  if (P) {
    add('<div class="ab" style="left:50%;transform:translateX(-50%);top:54px;gap:4px">' + EVENTS.map(([i, n], k2) => btn(i, n, 'c', k2 < 3 ? DOT : '')).join('') + '</div>');
    add('<div class="area" style="left:50%;top:100px;transform:translateX(-50%)">星芒港 · 第一园区</div>');
    add('<div class="ab" style="left:6px;top:126px;flex-direction:column">' + LEFT.map(([i, n], k2) => btn(i, n, 'sq', k2 === 1 ? DOT : '')).join('') + '</div>');
    add('<div class="ab" style="right:6px;top:126px;flex-direction:column">' + SIDE2.map(([i, n]) => btn(i, n, 'sq')).join('') + btn('star', '收藏', 'sq') + '</div>');
    add(TICKER, { left: '6px', right: '6px', bottom: '178px', maxWidth: 'none' });
    add('<div class="ab" style="left:50%;transform:translateX(-50%);bottom:122px">' + RIGHT.map(([i, n, e]) => btn(i, n, 'big', e || '')).join('') + '</div>');
    add('<div class="ab" style="left:6px;bottom:76px">' + QUICK.map(([i, n]) => btn(i, n, 'sq')).join('') + '</div>');
    add('<div class="tabs" style="right:6px;bottom:48px">' + MODTABS.map((n, k2) => '<span class="tab ' + (k2 ? '' : 'on') + '" style="padding:4px 7px">' + n + '</span>').join('') + '</div>');
    add('<div class="g nav" style="left:3px;right:3px;bottom:4px;justify-content:space-between">' + NAV.map(([i, n], k2) => btn(i, n, 'sq', NAVDOT[k2] ? DOT : '')).join('') + '</div>');
    document.querySelectorAll('.nav .ib').forEach((e) => { e.style.width = '39px'; });
    document.querySelectorAll('.ab .ib.c').forEach((e) => { e.style.width = '34px'; e.style.height = '34px'; e.style.fontSize = '7.5px'; });
    add('<div class="lbl" style="bottom:auto;top:auto;left:50%;transform:translateX(-50%);white-space:nowrap;bottom:226px">方案 B · 竖屏<small>同一套功能，按竖屏重新排</small></div>');
  } else {
    add('<div class="ab" style="left:50%;transform:translateX(-50%);top:7px">' + EVENTS.map(([i, n], k2) => btn(i, n, 'c', k2 < 3 ? DOT : '')).join('') + '</div>');
    add('<div class="area" style="left:50%;top:50px;transform:translateX(-50%)">星芒港 · 第一园区</div>');
    add('<div class="ab" style="left:6px;top:54px;flex-direction:column">' + LEFT.map(([i, n], k2) => btn(i, n, 'sq', k2 === 1 ? DOT : '')).join('') + '</div>');
    add('<div class="ab" style="left:46px;top:54px;flex-direction:column">' + SIDE2.map(([i, n]) => btn(i, n, 'sq')).join('') + '</div>');
    add('<div class="ab" style="right:6px;top:54px;flex-direction:column">' + RIGHT.map(([i, n, e]) => btn(i, n, 'big', e || '')).join('') + '</div>');
    add(TICKER, { left: '6px', bottom: '88px' });
    add('<div class="ab" style="left:6px;bottom:46px">' + QUICK.map(([i, n]) => btn(i, n, 'sq')).join('') + '</div>');
    add('<div class="ab" style="right:6px;bottom:46px">' + btn('star', '收藏', 'sq') + '</div>');
    add('<div class="tabs" style="left:50%;transform:translateX(-50%);bottom:44px">' + MODTABS.map((n, k2) => '<span class="tab ' + (k2 ? '' : 'on') + '">' + n + '</span>').join('') + '</div>');
    add('<div class="g nav" style="left:50%;transform:translateX(-50%);bottom:3px">' + NAV.map(([i, n], k2) => btn(i, n, 'sq', NAVDOT[k2] ? DOT : '')).join('') + '</div>');
    add('<div class="lbl" style="left:auto;right:50px;bottom:92px">方案 B · 等距像素田园<small>参考图二 · 推荐</small></div>');
  }
};
if (which === 'A') window.drawA(); else window.drawB(which === 'P');
}

(async () => {
  const b = await chromium.launch();
  const shots = [['A-landscape', 844, 390, 'A'], ['B-landscape', 844, 390, 'B'], ['B-portrait', 390, 844, 'P']];
  for (const [name, w, h, call] of shots) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.goto('file://' + path.join(ROOT, 'index.html')); await p.waitForTimeout(500);
    await p.evaluate(PAGE, call);
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    await p.close();
    console.log('写出', name);
  }
  await b.close();
})();
