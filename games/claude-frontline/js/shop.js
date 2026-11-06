/* 商城（v1）：用主城仓库里的晶片购买。不涉及真实货币。
 * - 英雄碎片：每天轮换 3 位英雄（v6 起已拥有的英雄也会出现，碎片用来升星），每位每天限购 3 片（稀缺性）；主角造乐不出售。
 * - 法宝：法宝锦囊（每天 1 个）；打开锦囊、用 10 片赐福法宝碎片为英雄赐福法宝。
 * - 补给：体力药剂（每天 2 瓶）。 */
(function () {
  const CF = window.CF;
  const $ = CF.$;
  const PRICE = { frag: 150, pouch: 800, stamina: 300 };
  const LIMIT = { frag: 3, pouch: 1, stamina: 2 };
  const today = () => new Date().toISOString().slice(0, 10);
  const data = () => { const d = CF.Save.data; if (!d.shop || d.shop.date !== today()) d.shop = { date: today(), bought: {} }; return d.shop; };
  const chips = () => Math.floor(CF.City.storage().chip);
  const pay = (n) => { const st = CF.City.storage(); if (st.chip < n) { CF.Audio.sfx('error'); CF.toast(`晶片不足（需要 ${n}）——去征程或电路工坊攒一些`, 'bad'); return false; } st.chip -= n; CF.Save.save(); return true; };
  const left = (key, lim) => lim - (data().bought[key] || 0);
  const take = (key) => { const b = data().bought; b[key] = (b[key] || 0) + 1; CF.Save.save(); };
  // 今日轮换的英雄（按日期固定）
  const offers = () => {
    // 优先轮换还没拥有的英雄；不足 3 位时用已拥有、未满 5 星的英雄补上（升星用）
    const R = CF.Roster, base = CF.Heroes.list.filter((h) => !h.protagonist);
    const a = base.filter((h) => h.id !== R.STARTER && !R.ownsReal(h.id)), b = base.filter((h) => R.ownsReal(h.id) && R.star(h.id) < R.MAX_STAR);
    const pool = a.length >= 3 ? a : a.concat(b);
    // 按日期做确定性洗牌，保证每天 3 位互不重复（旧写法在 6 人池时会重复）
    const day = Math.floor(Date.now() / 864e5), hash = (id) => { let x = day * 2654435761; for (const ch of id) x = ((x ^ ch.charCodeAt(0)) * 16777619) >>> 0; return x; };
    return pool.slice().sort((p, q) => hash(p.id) - hash(q.id)).slice(0, 3);
  };
  const Shop = (CF.Shop = { PRICE, LIMIT });
  let tab = 'hero', skinHero = null;
  const TABS = [['hero', '英雄碎片'], ['fb', '法宝'], ['sup', '补给'], ['skin', '皮肤']];
  const INFO = {
    hero: () => `每天轮换 3 位英雄，每位每天限购 ${LIMIT.frag} 片。没拥有的英雄集齐 ${CF.Roster.FRAG_NEED} 片解锁；已拥有的英雄用碎片升星（4→5 星需要 500 片）。主角「造乐」只能通过特殊渠道获得，不在商城出售。`,
    fb: () => '法宝锦囊每天限购 1 个，打开有 35% 概率得到赐福法宝碎片（概率公示，见物品宪法）；集齐 10 片可以为一位英雄赐福法宝。',
    sup: () => '体力药剂每天限购 2 瓶。更推荐的办法：去学院学习——连续学 25 分钟得 5 分钟无限体力，累计学 40 分钟得 10 分钟。',
    skin: () => '每位英雄有：经典（免费）、四套炫彩——墨韵 600 晶片、星夜 1200 晶片、霓虹 2000 晶片、鎏金（英雄升到 3 星自动解锁）——以及最多 6 套你在像素工坊里画的「我的外观」。炫彩只换颜色，颜色都落在造月 256 色里；动作、乐器、技能和经典完全一样，不加属性。皮肤买一次永久拥有，只用游戏里赚到的晶片，不需要充值。穿上后大厅、战场、图鉴、英语田园都会换。',
  };
  // v9.1（UI 宪法第 27 章）：左侧竖条导航（竖屏是一排页签），大段说明收进 ⓘ，右上角是晶片余额
  Shop.render = function () {
    const body = $('#shopBody'), name = TABS.find((t) => t[0] === tab)[1];
    (Shop._stg || []).forEach((x) => x.destroy()); Shop._stg = [];
    body.innerHTML = `<div class="rail-page"><nav class="rail" role="tablist" aria-label="商城分类">${TABS.map(([k, n]) => `<button role="tab" data-t="${k}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${n}</button>`).join('')}</nav>
      <div class="rail-main"><div class="codex-head"><b class="codex-t">${name}</b><button class="btn sm ghost" id="shopInfo">ⓘ 规则</button><span class="shop-wallet"><span class="c-chip">◆ <b class="t-num">${chips().toLocaleString()}</b></span><small>晶片 · 不需要充值</small></span></div><div id="shopTab"></div></div></div>`;
    body.querySelectorAll('.rail [data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; CF.Audio.sfx('click'); Shop.render(); }));
    $('#shopInfo').onclick = () => { CF.Audio.sfx('click'); CF.modal.open({ title: `ⓘ ${name} · 规则`, body: `<p class="t-body" style="line-height:1.9">${INFO[tab]()}</p>`, foot: [{ text: '知道了', cls: 'primary' }] }); };
    const host = $('#shopTab');
    if (tab === 'hero') {
      const list = offers();
      if (!list.length) host.appendChild(CF.h('<p class="small">可购买的英雄都已满 5 星。</p>'));
      const g = CF.h('<div class="shop-grid shop-heroes"></div>');
      list.forEach((h) => {
        const key = 'frag_' + h.id, n = left(key, LIMIT.frag), bg = h.pal.bg;
        const el = CF.h(`<div class="shop-item shop-hero" style="--g:${h.pal.glow};--b0:${bg[0]};--b1:${bg[1]};--b2:${bg[2]}"><canvas></canvas><div class="shop-hi"><b>${h.name} <small>${h.title}</small></b><span class="small">${CF.Roster.ownsReal(h.id) ? CF.Roster.star(h.id) + '★ · ' : ''}${CF.Roster.ownsReal(h.id) ? '' : '碎片 '}${CF.Roster.fragLine(h.id)} · 今日还可买 ${n} 片</span><button class="btn sm primary" ${n > 0 ? '' : 'disabled'}><span class="c-chip">◆ ${PRICE.frag}</span> 买 1 片</button></div></div>`);
        const st = new CF.PixelFX.Stage(el.querySelector('canvas'), { mode: 'portrait', fx: 0.5, fy: 0.42, cell: 10, hero: h.id, radius: 24, charPx: 5 }); Shop._stg.push(st);
        el.querySelector('button').onclick = () => { if (left(key, LIMIT.frag) <= 0 || !pay(PRICE.frag)) return; take(key); CF.Roster.addFrag(h.id, 1); CF.Audio.sfx('unlock'); CF.toast(`${h.name} 碎片 +1（${CF.Roster.fragLine(h.id)}）`, 'gold'); st.destroy(); Shop.render(); };
        g.appendChild(el);
      });
      host.appendChild(g);
    }
    if (tab === 'skin') Shop.renderSkins(host);
    if (tab === 'fb') {
      const C = CF.Collect, n = left('pouch', LIMIT.pouch);
      host.appendChild(CF.h(`<div class="shop-grid">
        <div class="shop-item"><div class="shop-ic">🧧</div><b>法宝锦囊</b><span class="small muted">打开有 35% 概率得到赐福法宝碎片，其余为补给。第六章也会掉落。持有 <b>${C.pouches()}</b> 个</span><div class="row" style="gap:6px"><button class="btn sm primary" id="buyPouch" ${n > 0 ? '' : 'disabled'}><span class="c-chip">◆ ${PRICE.pouch}</span> 买 1 个（今日 ${n}）</button><button class="btn sm" id="openPouch" ${C.pouches() > 0 ? '' : 'disabled'}>打开</button></div></div>
        <div class="shop-item"><div class="shop-ic">✨</div><b>赐福法宝碎片</b><span class="small muted">集齐 ${C.NEED} 片，可以为一位已拥有、还没有法宝的英雄赐福法宝。当前 <b class="t-num">${C.bless()}/${C.NEED}</b></span><div class="bless-list"></div></div>
      </div>`));
      host.querySelector('#buyPouch').onclick = () => { if (left('pouch', LIMIT.pouch) <= 0 || !pay(PRICE.pouch)) return; take('pouch'); C.addPouch(1); CF.toast('法宝锦囊 +1', 'gold'); Shop.render(); };
      host.querySelector('#openPouch').onclick = () => { const r = C.openPouch(); if (r) CF.modal.open({ title: '打开法宝锦囊', body: `<p style="text-align:center;font-size:18px;line-height:2">🎁 ${r}</p>`, foot: [{ text: '好的', cls: 'primary', onClick: () => { CF.modal.close(); Shop.render(); } }] }); };
      const bl = host.querySelector('.bless-list');
      CF.Roster.ownedList().filter((h) => !CF.Treasure.has(h.id) || CF.P.trial()).forEach((h) => { const b = CF.h(`<button class="btn sm ${C.bless() >= C.NEED ? 'violet' : 'ghost'}" ${C.bless() >= C.NEED ? '' : 'disabled'}>赐福 ${h.name}（${h.instrument}）</button>`); b.onclick = () => { if (C.redeem(h.id)) Shop.render(); }; bl.appendChild(b); });
      if (!bl.children.length) bl.appendChild(CF.h('<span class="small muted">你拥有的英雄都已经有法宝了。</span>'));
    }
    if (tab === 'sup') {
      const n = left('stamina', LIMIT.stamina);
      host.appendChild(CF.h(`<div class="shop-grid"><div class="shop-item"><div class="shop-ic">⚡</div><b>体力药剂</b><span class="small muted">立即恢复 40 点体力（可以超过上限）。更推荐的办法：去学院学习——连续学 25 分钟得 5 分钟无限体力，累计学 40 分钟得 10 分钟。</span><button class="btn sm primary" ${n > 0 ? '' : 'disabled'}><span class="c-chip">◆ ${PRICE.stamina}</span> 买 1 瓶（今日 ${n}）</button></div></div>`));
      host.querySelector('button').onclick = () => { if (left('stamina', LIMIT.stamina) <= 0 || !pay(PRICE.stamina)) return; take('stamina'); CF.Stamina.add(40); CF.toast('体力 +40', 'gold'); Shop.render(); };
    }
  };
  // 皮肤（v9.2 转正，参考王者荣耀的皮肤页：画面占七成，信息和按钮退到右侧和底部；物品宪法第 7 章）
  let skinSel = null;
  const RARN = { common: ['经典', '#c9d4ff'], rare: ['稀有', '#4ef0ff'], epic: ['史诗', '#b48cff'], legend: ['传说', '#ffd257'] };
  Shop.renderSkins = function (host) {
    const R = CF.Roster, SK = CF.Skins, list = CF.Heroes.list, h = CF.Heroes.get(skinHero || CF.Heroes.current().id);
    const skins = SK.list(h.id), eq = SK.equipped(h.id); if (!skinSel || !skins.some((x) => x.id === skinSel)) skinSel = eq;
    const cur = skins.find((x) => x.id === skinSel), own = R.owns(h.id);
    const btn = !own ? `<button class="btn primary skin-buy" disabled>先获得${h.name}</button>` : cur.owned ? (cur.id === eq ? '<button class="btn skin-buy" disabled>✓ 正在穿</button>' : '<button class="btn primary skin-buy" data-act="eq">穿上</button>')
      : cur.price ? `<button class="btn primary skin-buy" data-act="buy"><span class="c-chip">◆ ${cur.price}</span> 购买并穿上</button>` : `<button class="btn skin-buy" disabled>${h.name}升到 ${cur.star} 星解锁</button>`;
    const box = CF.h(`<div class="skin-show"><div class="skin-stage"><canvas></canvas><div class="skin-name"><span class="t-tag" style="color:${RARN[cur.rar][1]}">${RARN[cur.rar][0]} · ${h.en}</span><b>${h.name}<em>·${cur.name}</em></b><small>${cur.desc}</small></div></div>
      <div class="skin-side"><div class="skin-list">${skins.map((x) => `<button class="skin-card ${x.id === skinSel ? 'on' : ''} ${x.owned ? '' : 'lock'}" data-k="${x.id}" style="--r:${RARN[x.rar][1]}"><canvas width="96" height="96"></canvas><span>${x.name}</span><em>${x.id === eq ? '穿着' : x.owned ? '已拥有' : x.price ? '◆ ' + x.price : x.star + ' 星解锁'}</em></button>`).join('')}<button class="skin-card add" data-k="+draw"><span class="skin-plus">＋</span><span>自己画一套</span><em>像素工坊</em></button></div>
        ${btn}${cur.kind === 'img' ? '<button class="btn sm ghost" data-act="del">从衣柜里删掉这套</button>' : ''}</div>
      <div class="skin-heroes">${list.map((x) => `<button class="skin-av ${x.id === h.id ? 'on' : ''} ${R.owns(x.id) ? '' : 'lock'}" data-h="${x.id}" title="${x.name}" style="--b1:${x.pal.bg[1]};--g:${x.pal.glow}"><canvas width="48" height="48"></canvas></button>`).join('')}</div></div>`);
    host.appendChild(box);
    const stg = new CF.PixelFX.Stage(box.querySelector('.skin-stage canvas'), { mode: 'full', fx: 0.5, fy: 0.5, cell: 16, hero: h.id, radius: 30 }); Shop._stg.push(stg);
    stg.o.drawChar = (ctx, fx, fy, px, a) => { const ox = fx - 21 * px * 0.45, oy = fy - 15 * px * 0.38; ctx.fillStyle = 'rgba(10,6,30,0.35)'; ctx.fillRect(ox + px, oy + 10.5 * px, 14 * px, px); h.draw(ctx, ox, oy, px, { bob: a.bob, strum: a.strum > 0.4 ? 1 : 0, blink: a.blink > 0, t: a.t, skin: skinSel }); return true; };
    box.querySelectorAll('.skin-card').forEach((b) => {
      const k = b.dataset.k, g = b.querySelector('canvas'); if (g) { const x = g.getContext('2d'), grd = x.createLinearGradient(0, 0, 0, 96); grd.addColorStop(0, h.pal.bg[1]); grd.addColorStop(1, h.pal.bg[0]); x.fillStyle = grd; x.fillRect(0, 0, 96, 96); x.imageSmoothingEnabled = false; h.draw(x, 14, 30, 3, { t: 0, skin: k }); }
      b.onclick = () => { CF.Audio.sfx('click'); if (k === '+draw') { Shop._stg.forEach((x) => x.destroy()); CF.Labs.open('pixel'); return; } skinSel = k; Shop.render(); };
    });
    box.querySelectorAll('.skin-av').forEach((b) => { const x = b.querySelector('canvas').getContext('2d'), hh = CF.Heroes.get(b.dataset.h); x.fillStyle = hh.pal.bg[1]; x.fillRect(0, 0, 48, 48); hh.draw(x, 5, 16, 1.6, { t: 0 }); b.onclick = () => { CF.Audio.sfx('click'); skinHero = b.dataset.h; skinSel = null; Shop.render(); }; });
    const act = box.querySelector('[data-act]');
    box.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'buy' && SK.buy(h.id, skinSel)) { SK.equip(h.id, skinSel); CF.toast(`${h.name}·${cur.name} 到手，已经穿上`, 'gold'); }
      else if (a === 'eq' && SK.equip(h.id, skinSel)) { CF.Audio.sfx('correct'); CF.toast(`${h.name}换上了「${cur.name}」`, 'gold'); }
      else if (a === 'del') { SK.removeMine(h.id, skinSel); skinSel = null; CF.toast('已从衣柜里删掉'); }
      Shop.render();
    }));
    void act;
  };
})();
