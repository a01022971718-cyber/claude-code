/* 英雄获取与法宝（v1.1）
 * - 开局英雄是狂想；第一章第 3 个小关送万象，第 5 个小关送珠问；
 * - 主角造乐只能通过特殊渠道获得（高等级 VIP、限时活动——后续版本开放），保持稀缺；
 * - 其余英雄：组队副本第 5 波掉落英雄碎片，集齐 10 片解锁；
 * - 法宝 = 英雄的乐器（《英雄设计宪法》第 6 章）：没有法宝时形象不带乐器、R 技能不能用。
 *   开局英雄的法宝在第一章终章获得；造乐的指挥棒随造乐一起获得；其他英雄带着他出战并打完一次组队副本 5 波获得。
 * - 体验模式下全部解锁。详细获取规则在下一版本细化（见 NEXT.md）。
 * - v6 星级（《英雄设计宪法》第 16 章）：获得英雄时 1 星，最高 5 星。已拥有英雄的碎片不再换成晶片，而是存起来升星。
 *   普通英雄升星碎片 50 / 120 / 250 / 500（4→5 星 500 片）；主角造乐 100 / 240 / 500 / 1000（4→5 星 1000 片）。
 *   每升一星：生命、伤害 +6%；3 星起技能冷却 −8%；5 星头像框与名牌变金色。 */
(function () {
  const CF = window.CF;
  const FRAG_NEED = 10, STARTER = 'riot', MAX_STAR = 5;
  const STAR_COST = { hero: [50, 120, 250, 500], protagonist: [100, 240, 500, 1000] };
  const VALID = (id) => CF.Heroes.list.some((h) => h.id === id);
  const data = () => {
    const d = CF.Save.data;
    if (!d.roster) {
      // 旧存档迁移：保留玩家正在用的主英雄，避免进来后英雄消失
      const owned = [STARTER]; if (d.hero && d.hero !== STARTER && VALID(d.hero) && d.campaign && Object.keys(d.campaign).length) owned.push(d.hero);
      d.roster = { owned, frags: {}, treasures: [] };
    }
    // 清理已经删除的英雄（v3 的「星芒」已并入 X-S，v6 起 X-S 重新设计为「灯语」，id 仍为 xs）
    if (d.roster.owned.some((id) => !VALID(id))) { d.roster.owned = d.roster.owned.filter(VALID); if (!d.roster.owned.length) d.roster.owned.push(STARTER); }
    // v6 星级迁移：已经用 10 片解锁的英雄扣掉解锁用掉的碎片，剩下的转入升星
    if (!d.roster.stars) { d.roster.stars = {}; for (const id of d.roster.owned) if ((d.roster.frags[id] || 0) >= FRAG_NEED) d.roster.frags[id] -= FRAG_NEED; }
    return d.roster;
  };
  const trial = () => !!(CF.P && CF.P.trial && CF.P.trial());

  // 获取途径（显示在锁定的英雄卡上）
  const HOW = { riot: '初始英雄', zaole: '主角 · 特殊渠道：高等级 VIP · 限时活动（后续版本开放）', omni: '第一章章节掉落碎片（第 3 个小关首通时集齐）', pearl: '第一章 · 第 5 个小关首通赠送', xs: '第四章章节掉落碎片', abyss: '第五章章节掉落碎片' };
  const R = (CF.Roster = {
    FRAG_NEED, STARTER, MAX_STAR, STAR_COST,
    special: (id) => id === 'zaole',
    owns: (id) => trial() || data().owned.includes(id),
    ownsReal: (id) => data().owned.includes(id),
    ownedList: () => CF.Heroes.list.filter((h) => R.owns(h.id)),
    frags: (id) => data().frags[id] || 0,
    // ---------- 星级 ----------
    star: (id) => (R.owns(id) ? Math.min(MAX_STAR, data().stars[id] || 1) : 0),
    starCost: (id) => { const s = R.star(id) || 1; return s >= MAX_STAR ? 0 : STAR_COST[R.special(id) ? 'protagonist' : 'hero'][s - 1]; },
    starMul: (id) => 1 + 0.06 * ((R.star(id) || 1) - 1),
    starCd: (id) => (R.star(id) >= 3 ? 0.92 : 1),
    starText: (id) => { const n = R.star(id); return '★'.repeat(n) + '☆'.repeat(MAX_STAR - n); },
    canStarUp: (id) => R.ownsReal(id) && R.star(id) < MAX_STAR && R.frags(id) >= R.starCost(id),
    starUp(id) {
      if (!R.canStarUp(id)) return false;
      const r = data(), cost = R.starCost(id), h = CF.Heroes.get(id);
      r.frags[id] -= cost; r.stars[id] = R.star(id) + 1; CF.Save.save();
      const n = r.stars[id];
      CF.Audio.sfx('levelup'); CF.Audio.lick(id);
      CF.modal.open({ title: `${h.name} 升到 ${n} 星`, body: `<div class="grant"><canvas width="220" height="150"></canvas><p class="stars big ${n >= MAX_STAR ? 'gold' : ''}">${R.starText(id)}</p><p class="small">生命、伤害 +${Math.round((R.starMul(id) - 1) * 100)}%${n >= 3 ? ' · 技能冷却 −8%' : ''}${n >= MAX_STAR ? ' · 金色头像框与名牌' : ''}</p><p class="small muted">消耗碎片 ${cost} 片</p></div>`, foot: [{ text: '好的', cls: 'primary' }] });
      const cv = document.querySelector('.modal .grant canvas');
      if (cv) { const x = cv.getContext('2d'); x.fillStyle = h.pal.bg[1]; x.fillRect(0, 0, 220, 150); h.draw(x, 40, 60, 6.5, { t: 0 }); }
      return true;
    },
    // 掉落 / 购买时显示的进度文字
    fragLine(id) { return R.ownsReal(id) ? (R.star(id) >= MAX_STAR ? '已满 5 星' : `升星 ${R.frags(id)}/${R.starCost(id)}`) : `${Math.min(FRAG_NEED, R.frags(id))}/${FRAG_NEED}`; },
    how: (id) => (HOW[id] || '商城每日轮换出售碎片') + (id !== STARTER && id !== 'zaole' && id !== 'pearl' ? `（${Math.min(FRAG_NEED, R.frags(id))}/${FRAG_NEED}）` : ''),
    // 碎片只对普通英雄有效；主角造乐不进入任何掉落池
    grant(id, why) {
      const r = data();
      if (r.owned.includes(id)) return false;
      r.owned.push(id); r.stars[id] = 1; CF.Save.save();
      const h = CF.Heroes.get(id);
      setTimeout(() => {
        CF.Audio.sfx('unlock'); CF.Audio.lick(id);
        CF.modal.open({ title: `获得英雄 · ${h.name}`, body: `<div class="grant"><canvas width="220" height="150"></canvas><p class="t-quote">${CF.esc(h.quote)}</p><p class="small muted">${why || ''}</p><p class="stars">${R.starText(id)}</p><p class="small">${h.title} · ${h.role} · 法宝「${h.instrument}」尚未获得</p></div>`, foot: [{ text: '好的', cls: 'ghost' }, { text: '设为主英雄', cls: 'primary', onClick: () => { CF.modal.close(); CF.Lobby.setHero(id); } }] });
        const cv = document.querySelector('.modal .grant canvas');
        if (cv) { const x = cv.getContext('2d'); x.fillStyle = h.pal.bg[1]; x.fillRect(0, 0, 220, 150); h.draw(x, 40, 60, 6.5, { t: 0 }); }
      }, 400);
      return true;
    },
    // 未拥有：攒满 10 片解锁（解锁用掉 10 片，多出的留给升星）；已拥有：存起来升星；满 5 星后每片换 40 晶片
    addFrag(id, n) {
      const r = data();
      if (r.owned.includes(id) && R.star(id) >= MAX_STAR) { CF.City.add({ chip: 40 * n }); return 0; }
      r.frags[id] = (r.frags[id] || 0) + n; CF.Save.save();
      if (!r.owned.includes(id) && r.frags[id] >= FRAG_NEED) { r.frags[id] -= FRAG_NEED; R.grant(id, `集齐 ${FRAG_NEED} 片英雄碎片`); }
      return n;
    },
  });

  CF.Treasure = {
    has: (id) => trial() || data().treasures.includes(id),
    name: (id) => '法宝 · ' + CF.Heroes.get(id).instrument,
    how: (id) => (id === STARTER ? '通关第一章终章「原型机护送」获得' : id === 'zaole' ? '指挥棒随造乐一起通过特殊渠道获得' : '带该英雄打完一次组队副本 5 波，或用 10 片赐福法宝碎片兑换'),
    grant(id) {
      const r = data();
      if (r.treasures.includes(id)) return false;
      r.treasures.push(id); CF.Save.save();
      const h = CF.Heroes.get(id);
      setTimeout(() => {
        CF.Audio.sfx('unlock'); CF.Audio.preview(h.music.style, 0.7);
        CF.modal.open({ title: `获得法宝 · ${h.instrument}`, body: `<div class="grant"><canvas width="220" height="150"></canvas><p class="t-quote">${CF.esc(h.name)}的${h.instrument}觉醒了</p><p class="small">终极技能「${h.skills[2].name}」已解锁；形象、演奏动画与专属粒子同步出现。</p></div>`, foot: [{ text: '收下', cls: 'primary' }] });
        const cv = document.querySelector('.modal .grant canvas');
        if (cv) { const x = cv.getContext('2d'); x.fillStyle = h.pal.bg[1]; x.fillRect(0, 0, 220, 150); h.draw(x, 40, 60, 6.5, { t: 0, strum: 1 }); }
      }, 500);
      return true;
    },
  };
})();
