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
    skin: () => '皮肤系统还在制作中，这里先占位：大图展示英雄，右侧是皮肤列表。「我的外观」是你在实验室 · 像素工坊里画的，已经可以用；其余皮肤敬请期待。商城永远只用游戏里赚到的资源，不需要充值。',
  };
  // v9.1（UI 宪法第 27 章）：左侧竖条导航（竖屏是一排页签），大段说明收进 ⓘ，右上角是晶片余额
  Shop.render = function () {
    const body = $('#shopBody'), name = TABS.find((t) => t[0] === tab)[1];
    (Shop._stg || []).forEach((x) => x.destroy()); Shop._stg = [];
    body.innerHTML = `<div class="rail-page"><nav class="rail" role="tablist" aria-label="商城分类">${TABS.map(([k, n]) => `<button role="tab" data-t="${k}" class="${k === tab ? 'on' : ''}" aria-selected="${k === tab}">${n}${k === 'skin' ? '<small>占位</small>' : ''}</button>`).join('')}</nav>
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
  // 皮肤展示（占位，参考王者荣耀的皮肤页：画面占七成，信息和按钮退到右侧和底部）
  Shop.renderSkins = function (host) {
    const R = CF.Roster, own = R.ownedList(), h = CF.Heroes.get(skinHero && own.some((x) => x.id === skinHero) ? skinHero : CF.Heroes.current().id);
    const mine = CF.PixStudio && CF.PixStudio.skinCanvas(h.id);
    const skins = [['经典', 'classic', true], ['我的外观', 'mine', !!mine], ['敬请期待', 'soon', false], ['敬请期待', 'soon', false]];
    const box = CF.h(`<div class="skin-show"><div class="skin-stage"><canvas></canvas><div class="skin-name"><span class="t-tag">${h.en}</span><b>${h.name}</b><small>${h.title}</small></div></div>
      <div class="skin-side"><div class="skin-list">${skins.map(([n, k, ok], i) => `<button class="skin-card ${k} ${i === 0 ? 'on' : ''}" ${ok ? '' : 'disabled'} data-k="${k}"><canvas width="96" height="96"></canvas><span>${n}</span>${k === 'mine' && !ok ? '<em>去像素工坊画一套</em>' : ''}</button>`).join('')}</div>
        <button class="btn primary skin-buy" disabled>皮肤敬请期待</button><button class="btn sm ghost" id="skinDraw">🎨 去像素工坊画「我的外观」</button></div>
      <div class="skin-heroes">${own.map((x) => `<button class="skin-av ${x.id === h.id ? 'on' : ''}" data-h="${x.id}" title="${x.name}" style="--b1:${x.pal.bg[1]};--g:${x.pal.glow}"><canvas width="48" height="48"></canvas></button>`).join('')}</div></div>`);
    host.appendChild(box);
    const stg = new CF.PixelFX.Stage(box.querySelector('.skin-stage canvas'), { mode: 'full', fx: 0.5, fy: 0.5, cell: 16, hero: h.id, radius: 30 }); Shop._stg.push(stg);
    box.querySelectorAll('.skin-card').forEach((b, i) => {
      const g = b.querySelector('canvas').getContext('2d'), k = skins[i][1]; g.imageSmoothingEnabled = false;
      const grd = g.createLinearGradient(0, 0, 0, 96); grd.addColorStop(0, h.pal.bg[1]); grd.addColorStop(1, h.pal.bg[0]); g.fillStyle = grd; g.fillRect(0, 0, 96, 96);
      if (k === 'classic') h.draw(g, 14, 30, 3, { noCustom: true, t: 0 });
      else if (k === 'mine' && mine) g.drawImage(mine, 14 - 12 * 1.5, 30 - 24 * 1.5, 96, 96);
      else { // 剪影占位：英雄轮廓填成半透明白
        const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'); h.draw(x, 14, 30, 3, { noCustom: true, t: 0 }); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff30'; x.fillRect(0, 0, 96, 96); g.drawImage(c, 0, 0);
        g.fillStyle = '#fff9'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('?', 48, 58);
      }
      b.onclick = () => { CF.Audio.sfx('click'); box.querySelectorAll('.skin-card').forEach((x) => x.classList.toggle('on', x === b)); stg.o.drawChar = k === 'classic' ? null : (ctx, fx, fy, px) => { const ox = fx - 21 * px * 0.45, oy = fy - 15 * px * 0.38; h.draw(ctx, ox, oy, px, { t: stg.t }); return true; }; };
    });
    box.querySelectorAll('.skin-av').forEach((b) => { const x = b.querySelector('canvas').getContext('2d'), hh = CF.Heroes.get(b.dataset.h); x.fillStyle = hh.pal.bg[1]; x.fillRect(0, 0, 48, 48); hh.draw(x, 5, 16, 1.6, { t: 0 }); b.onclick = () => { CF.Audio.sfx('click'); skinHero = b.dataset.h; stg.destroy(); Shop.render(); }; });
    box.querySelector('#skinDraw').onclick = () => { CF.Audio.sfx('click'); stg.destroy(); CF.Labs.open('pixel'); };
    // 经典外观固定画官方形象（不受「我的外观」影响）
    stg.o.drawChar = (ctx, fx, fy, px) => { const ox = fx - 21 * px * 0.45, oy = fy - 15 * px * 0.38; h.draw(ctx, ox, oy, px, { noCustom: true, t: stg.t, bob: stg.anim.bob }); return true; };
    box.querySelector('.skin-card.classic').onclick = () => { CF.Audio.sfx('click'); box.querySelectorAll('.skin-card').forEach((x) => x.classList.toggle('on', x.dataset.k === 'classic')); stg.o.drawChar = (ctx, fx, fy, px) => { const ox = fx - 21 * px * 0.45, oy = fy - 15 * px * 0.38; h.draw(ctx, ox, oy, px, { noCustom: true, t: stg.t, bob: stg.anim.bob }); return true; }; };
  };
})();
