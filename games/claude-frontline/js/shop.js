/* 商城（v1）：用主城仓库里的晶片购买。不涉及真实货币。
 * - 英雄碎片：每天轮换 3 位还没拥有的英雄，每位每天限购 3 片（稀缺性）；主角造乐不出售。
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
    const pool = CF.Heroes.list.filter((h) => !h.protagonist && h.id !== CF.Roster.STARTER && !CF.Roster.ownsReal(h.id));
    const day = Math.floor(Date.now() / 864e5), out = [];
    for (let i = 0; i < Math.min(3, pool.length); i++) out.push(pool[(day * 7 + i * 3) % pool.length]);
    return [...new Set(out)];
  };
  const Shop = (CF.Shop = { PRICE, LIMIT });
  let tab = 'hero';
  Shop.render = function () {
    const body = $('#shopBody');
    body.innerHTML = `<div class="row between wrap" style="margin-bottom:10px"><div class="shop-wallet"><span class="c-chip">◆ <b class="t-num">${chips().toLocaleString()}</b> 晶片</span><span class="small muted">商城只用游戏里赚到的晶片，不需要充值</span></div><div class="tabs" id="shopTabs" style="padding:0"></div></div><div id="shopTab"></div>`;
    const tb = $('#shopTabs');
    [['hero', '英雄碎片'], ['fb', '法宝'], ['sup', '补给']].forEach(([k, n]) => { const b = CF.h(`<button class="tab ${tab === k ? 'on' : ''}">${n}</button>`); b.onclick = () => { tab = k; CF.Audio.sfx('click'); Shop.render(); }; tb.appendChild(b); });
    const host = $('#shopTab');
    if (tab === 'hero') {
      const list = offers();
      host.appendChild(CF.h(`<p class="small muted" style="margin-bottom:8px">每天轮换 3 位你还没拥有的英雄，每位每天限购 ${LIMIT.frag} 片；集齐 ${CF.Roster.FRAG_NEED} 片解锁。主角「造乐」只能通过特殊渠道获得，不在商城出售。</p>`));
      if (!list.length) host.appendChild(CF.h('<p class="small">你已经拥有全部可购买的英雄。</p>'));
      const g = CF.h('<div class="shop-grid"></div>');
      list.forEach((h) => {
        const key = 'frag_' + h.id, n = left(key, LIMIT.frag);
        const el = CF.h(`<div class="shop-item"><canvas width="144" height="112"></canvas><b>${h.name} <small>${h.title}</small></b><span class="small muted">碎片 ${CF.Roster.frags(h.id)}/${CF.Roster.FRAG_NEED} · 今日还可买 ${n} 片</span><button class="btn sm primary" ${n > 0 ? '' : 'disabled'}><span class="c-chip">◆ ${PRICE.frag}</span> 买 1 片</button></div>`);
        const x = el.querySelector('canvas').getContext('2d'); x.fillStyle = h.pal.bg[1]; x.fillRect(0, 0, 144, 112); h.draw(x, 22, 40, 4.2, { t: 0 });
        el.querySelector('button').onclick = () => { if (left(key, LIMIT.frag) <= 0 || !pay(PRICE.frag)) return; take(key); CF.Roster.addFrag(h.id, 1); CF.Audio.sfx('unlock'); CF.toast(`${h.name} 碎片 +1（${Math.min(CF.Roster.FRAG_NEED, CF.Roster.frags(h.id))}/${CF.Roster.FRAG_NEED}）`, 'gold'); Shop.render(); };
        g.appendChild(el);
      });
      host.appendChild(g);
    }
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
})();
