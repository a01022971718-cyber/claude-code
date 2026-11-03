/* 启动 */
(function () {
  const CF = window.CF;
  CF.Save.load();
  CF.P._unlockSnapshot = CF.P.unlockSnapshot();
  CF.P.dailyPlan();
  CF.UI.initUltrabars();
  CF.UI.initMenu();
  CF.UI.initComms();
  CF.UI.initRotate();
  CF.UI.bindBattle();
  CF.UI.initBreak();
  CF.UI.touch = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  const fabs = () => { const t = CF.UI.touch; CF.$('#fabBox').classList.toggle('hidden', !t); CF.$('#fabAll').classList.toggle('hidden', !t); };
  fabs();
  window.addEventListener('pointerdown', (e) => { const t = e.pointerType !== 'mouse'; if (t !== CF.UI.touch) { CF.UI.touch = t; fabs(); } }, true);
  // 浏览器要求用户交互后才能播放声音
  const unlock = () => { CF.Audio.unlock(); const f = CF.$('.menu-foot'); if (f) f.textContent = '设置里可以为每个页面更换背景音乐'; };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  CF.UI.show('menu');
  CF.Audio.screen = 'menu';
  CF.P.checkAch();
  document.addEventListener('visibilitychange', () => { if (document.hidden) { CF.Save.save(); const g = CF.Game.current; if (g && !g.over) g.paused = true; } });
  window.CF_DEBUG = CF; // 方便在控制台调试
})();
