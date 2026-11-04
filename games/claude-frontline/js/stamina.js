/* 体力系统（v1）
 * - 战斗类玩法消耗体力，学习类内容（学院、实验室、电路工坊）不消耗。
 * - 体力上限 120，每 6 分钟自然恢复 1 点。
 * - 学习换「无限体力」（按主创规则）：
 *   ① 一次连续学习满 25 分钟（期间没有离开学习模式）→ 存入 5 分钟无限体力；每再满 25 分钟再存 5 分钟；
 *   ② 没能连续满 25 分钟的零散学习时间（包括连续学习超出 25 分钟整数倍的部分）全部累计，满 40 分钟 → 存入 10 分钟。
 *   存下的无限体力由玩家自己点「启用」开始计时，避免在不玩的时候白白流失。
 * - 连续 5 分钟没有任何操作时暂停计时（防挂机），回来继续计，不算离开学习模式。 */
(function () {
  const CF = window.CF;
  const MAX = 120, REGEN = 6 * 60 * 1000, SESSION = 25 * 60, POOL = 40 * 60, IDLE = 5 * 60 * 1000;
  const COST = { minor: 6, story: 10, dungeon: 15, immersive: 15, skirmish: 8, quick: 4, raid: 6, other: 6 };
  const LEARN = ['academy', 'labs', 'city'];
  const d = () => { const s = CF.Save.data; if (!s.stamina) s.stamina = { cur: MAX, last: Date.now(), bank: 0, until: 0, sess: 0, pool: 0, total: 0 }; return s.stamina; };
  const trial = () => CF.P && CF.P.trial && CF.P.trial();
  let lastInput = Date.now(), inLearn = false;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => (lastInput = Date.now()), { passive: true, capture: true }));

  const St = (CF.Stamina = {
    MAX, COST,
    regen() { const s = d(), now = Date.now(); if (s.cur >= MAX) { s.last = now; return; } const n = Math.floor((now - s.last) / REGEN); if (n > 0) { s.cur = Math.min(MAX, s.cur + n); s.last += n * REGEN; } },
    cur() { St.regen(); return d().cur; },
    add(n) { const s = d(); St.regen(); s.cur += n; CF.Save.save(); St.paint(); },
    unlimited: () => Date.now() < d().until,
    leftMs: () => Math.max(0, d().until - Date.now()),
    bank: () => d().bank,
    costOf(L) { if (!L) return COST.other; if (L.quick) return COST.quick; if (L.raid) return COST.raid; if (L.dungeon) return COST.dungeon; if (L.immersive) return COST.immersive; if (L.skirmish) return COST.skirmish; if (L.story) return COST.story; if (L.minor) return COST.minor; return COST.other; },
    // 开战前扣体力；不够时弹出说明（去学习换无限体力 / 商城体力药剂）
    spend(L) {
      if (trial() || St.unlimited()) return true;
      const c = St.costOf(L), s = d(); St.regen();
      if (s.cur >= c) { s.cur -= c; if (s.cur < MAX && s.last > Date.now()) s.last = Date.now(); CF.Save.save(); St.paint(); return true; }
      CF.Audio.sfx('error');
      CF.modal.open({ title: '体力不足', body: `<p style="line-height:1.8">这一局需要 <b>${c}</b> 点体力，你现在有 <b>${s.cur}</b> 点（每 6 分钟恢复 1 点）。</p>${St.explain()}`, foot: [{ text: '稍后', cls: 'ghost' }].concat(s.bank > 0 ? [{ text: `启用 ${s.bank} 分钟无限体力`, cls: 'primary', onClick: () => { St.activate(); CF.modal.close(); } }] : [{ text: '去学院学习', cls: 'primary', onClick: () => { CF.modal.close(); CF.UI.show('academy'); } }]) });
      return false;
    },
    activate() { const s = d(); if (s.bank <= 0) return; s.until = Math.max(Date.now(), s.until) + s.bank * 60000; CF.toast(`无限体力已启用：${s.bank} 分钟`, 'gold', 3000); s.bank = 0; CF.Save.save(); St.paint(); },
    explain: () => `<div class="explain">学习类内容（学院、实验室、电路工坊）<b>不消耗体力</b>。<br>· 一次连续学习满 <b>25 分钟</b>（中途不离开学习页面）→ 得 <b>5 分钟</b>无限体力；<br>· 零散学习累计满 <b>40 分钟</b>（例如今天 10 分钟、明天 10 分钟）→ 得 <b>10 分钟</b>无限体力。<br>无限体力会先存起来，你想玩的时候再点「启用」。</div>`,
    // 每秒调用：统计学习时间
    tick(dt) {
      const s = d(), cur = CF.UI && CF.UI.cur, learning = LEARN.includes(cur) && !document.hidden;
      if (!learning) { if (inLearn) St.endSession(); inLearn = false; return; }
      inLearn = true;
      if (Date.now() - lastInput > IDLE) return; // 挂机不计时
      s.sess += dt; s.total += dt;
      if (s.sess >= SESSION) { s.sess -= SESSION; s.bank += 5; CF.Audio.sfx('unlock'); CF.toast('连续学习 25 分钟！获得 5 分钟无限体力（已存入，随时启用）', 'gold', 4000); }
      CF.Save.save();
    },
    endSession() { const s = d(); if (s.sess > 0) { s.pool += s.sess; s.sess = 0; } while (s.pool >= POOL) { s.pool -= POOL; s.bank += 10; CF.toast('零散学习累计 40 分钟！获得 10 分钟无限体力（已存入）', 'gold', 4000); } CF.Save.save(); },
    learnInfo() { const s = d(); return { sess: s.sess, pool: s.pool, bank: s.bank, total: s.total }; },
    // 大厅右上角的体力胶囊 + 学习页的计时条
    paint() {
      const el = CF.$('#lobbyStamina'); if (el) el.innerHTML = St.unlimited() ? `⚡ <b class="t-num">∞</b><span class="small">${CF.fmtTime(St.leftMs() / 1000)}</span>` : `⚡ <b class="t-num">${St.cur()}</b><span class="small">/${MAX}</span>${d().bank ? `<i class="bank">+${d().bank}′</i>` : ''}`;
      const lt = CF.$('#learnTimer'); if (lt) { const s = d(), show = LEARN.includes(CF.UI && CF.UI.cur); lt.classList.toggle('hidden', !show); lt.classList.toggle('top', CF.UI.cur === 'city'); if (show) lt.innerHTML = `<span>学习计时</span><b class="t-num">${CF.fmtTime(s.sess)}</b><span class="small">/ 25:00</span><i style="--p:${(s.sess / SESSION) * 100}%"></i><span class="small">零散累计 ${Math.floor(s.pool / 60)}/40 分</span>${s.bank ? `<span class="small c-chip">已存 ${s.bank} 分钟无限体力</span>` : ''}`; }
    },
    open() {
      const s = d();
      CF.modal.open({ title: '体力', body: `<p style="line-height:1.8">当前体力 <b>${St.cur()}</b> / ${MAX}${St.unlimited() ? `，无限体力剩余 <b>${CF.fmtTime(St.leftMs() / 1000)}</b>` : ''}。每 6 分钟恢复 1 点。</p><p class="small muted" style="line-height:1.8">消耗：小关 ${COST.minor} · 次级关 ${COST.story} · 组队副本 ${COST.dungeon} · 沉浸模式 ${COST.immersive} · 遭遇战 ${COST.skirmish} · 快速模式 ${COST.quick}</p>${St.explain()}<p class="small" style="margin-top:8px">本次连续学习 ${CF.fmtTime(s.sess)} / 25:00 · 零散累计 ${Math.floor(s.pool / 60)} / 40 分钟 · 累计学习 ${Math.floor(s.total / 60)} 分钟</p>`, foot: [{ text: '关闭', cls: 'ghost' }].concat(s.bank > 0 ? [{ text: `启用 ${s.bank} 分钟无限体力`, cls: 'primary', onClick: () => { St.activate(); CF.modal.close(); } }] : [{ text: '去学院', cls: 'primary', onClick: () => { CF.modal.close(); CF.UI.show('academy'); } }]) });
    },
  });
  setInterval(() => { try { St.tick(1); St.paint(); } catch (e) { /* 存档未就绪 */ } }, 1000);
})();
