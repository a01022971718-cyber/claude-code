/* 启动 */
(function () {
  const CF = window.CF;
  CF.Save.load();
  if (!CF.Heroes.list.some((h) => h.id === CF.Save.data.hero) || !CF.Roster.owns(CF.Save.data.hero)) CF.Save.data.hero = 'xs';
  CF.Heroes.applyTheme();
  document.body.classList.toggle('reduce-motion', !!CF.Save.data.settings.reduceMotion);
  CF.P._unlockSnapshot = CF.P.unlockSnapshot();
  CF.P.dailyPlan();
  CF.UI.initUltrabars();
  CF.Lobby.init();
  CF.UI.initComms();
  CF.UI.initRotate();
  CF.UI.bindBattle();
  CF.Quick.bind();
  CF.City.bind();
  CF.UI.initBreak();
  CF.UI.touch = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  window.addEventListener('pointerdown', (e) => { CF.UI.touch = e.pointerType !== 'mouse'; }, true);
  // 浏览器要求用户交互后才能播放声音
  const unlock = () => { CF.Audio.unlock(); const f = document.querySelector('#scr-lobby .menu-foot'); if (f) f.remove(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  CF.Icons.watch(); // 全部 emoji → 像素图标（UI 宪法第 12 章）
  CF.UI.show('lobby');
  CF.P.checkAch();
  document.addEventListener('visibilitychange', () => { if (document.hidden) { CF.Save.save(); const g = CF.Game.current; if (g && !g.over) g.paused = true; } });
  window.CF_DEBUG = CF; // 方便在控制台调试
})();
