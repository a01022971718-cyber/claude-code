/* 英雄获取与法宝（v1）
 * - 开局只有 X-S；第一章第 3 个小关送万象，第 5 个小关送珠问；
 * - 其余英雄：组队副本第 5 波掉落英雄碎片，集齐 10 片解锁；
 * - 法宝 = 英雄的乐器（《英雄设计宪法》第 6 章）：没有法宝时形象不带乐器、R 技能不能用。
 *   X-S 的电吉他在第一章终章获得；其他英雄带着他出战并打完一次组队副本 5 波获得。
 * - 体验模式下全部解锁。详细获取规则在下一版本细化（见 NEXT.md）。 */
(function () {
  const CF = window.CF;
  const FRAG_NEED = 10;
  const data = () => {
    const d = CF.Save.data;
    if (!d.roster) {
      // 旧存档迁移：保留玩家正在用的主英雄，避免进来后英雄消失
      const owned = ['xs']; if (d.hero && d.hero !== 'xs') owned.push(d.hero);
      d.roster = { owned, frags: {}, treasures: [] };
    }
    return d.roster;
  };
  const trial = () => !!(CF.P && CF.P.trial && CF.P.trial());

  // 获取途径（显示在锁定的英雄卡上）
  const HOW = { xs: '初始英雄', omni: '第一章 · 第 3 个小关首通赠送', pearl: '第一章 · 第 5 个小关首通赠送' };
  const R = (CF.Roster = {
    FRAG_NEED,
    owns: (id) => trial() || data().owned.includes(id),
    ownsReal: (id) => data().owned.includes(id),
    ownedList: () => CF.Heroes.list.filter((h) => R.owns(h.id)),
    frags: (id) => data().frags[id] || 0,
    how: (id) => HOW[id] || `组队副本第 5 波掉落英雄碎片（${R.frags(id)}/${FRAG_NEED}）`,
    grant(id, why) {
      const r = data();
      if (r.owned.includes(id)) return false;
      r.owned.push(id); CF.Save.save();
      const h = CF.Heroes.get(id);
      setTimeout(() => {
        CF.Audio.sfx('unlock'); CF.Audio.lick(id);
        CF.modal.open({ title: `获得英雄 · ${h.name}`, body: `<div class="grant"><canvas width="220" height="150"></canvas><p class="t-quote">${CF.esc(h.quote)}</p><p class="small muted">${why || ''}</p><p class="small">${h.title} · ${h.role} · 法宝「${h.instrument}」尚未获得</p></div>`, foot: [{ text: '好的', cls: 'ghost' }, { text: '设为主英雄', cls: 'primary', onClick: () => { CF.modal.close(); CF.Lobby.setHero(id); } }] });
        const cv = document.querySelector('.modal .grant canvas');
        if (cv) { const x = cv.getContext('2d'); x.fillStyle = h.pal.bg[1]; x.fillRect(0, 0, 220, 150); h.draw(x, 40, 60, 6.5, { t: 0 }); }
      }, 400);
      return true;
    },
    addFrag(id, n) {
      const r = data();
      if (r.owned.includes(id)) return 0;
      r.frags[id] = (r.frags[id] || 0) + n; CF.Save.save();
      if (r.frags[id] >= FRAG_NEED) R.grant(id, `集齐 ${FRAG_NEED} 片英雄碎片`);
      return n;
    },
  });

  CF.Treasure = {
    has: (id) => trial() || data().treasures.includes(id),
    name: (id) => '法宝 · ' + CF.Heroes.get(id).instrument,
    how: (id) => (id === 'xs' ? '通关第一章终章「原型机护送」获得' : '带该英雄出战，打完一次组队副本 5 波获得'),
    grant(id) {
      const r = data();
      if (r.treasures.includes(id)) return false;
      r.treasures.push(id); CF.Save.save();
      const h = CF.Heroes.get(id);
      setTimeout(() => {
        CF.Audio.sfx('unlock'); CF.Audio.preview(h.music.style, 0.7);
        CF.modal.open({ title: `获得法宝 · ${h.instrument}`, body: `<div class="grant"><canvas width="220" height="150"></canvas><p class="t-quote">「${CF.esc(h.name)}」的${h.instrument}觉醒了</p><p class="small">终极技能「${h.skills[2].name}」已解锁；形象、演奏动画与专属粒子同步出现。</p></div>`, foot: [{ text: '收下', cls: 'primary' }] });
        const cv = document.querySelector('.modal .grant canvas');
        if (cv) { const x = cv.getContext('2d'); x.fillStyle = h.pal.bg[1]; x.fillRect(0, 0, 220, 150); h.draw(x, 40, 60, 6.5, { t: 0, strum: 1 }); }
      }, 500);
      return true;
    },
  };
})();
