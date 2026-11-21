// 开发工具：对高画质画面的每帧更新（view.update）做 CPU 采样，列出最耗时的函数。用法：node build.mjs --dev && node tools/profile.cjs
const path = require('path'); const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + '?hour=10');
  await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 180000 });
  await page.evaluate(async () => { document.getElementById('startBtn')?.click(); await new Promise(r => setTimeout(r, 8000)); });
  console.log('warm', await page.evaluate(() => { const app = window.__game, v = app.view; const t = performance.now(); for (let i = 0; i < 10; i++) v.update(0.016, app.rig.focus, app.rig.dist); return (performance.now() - t) / 10; }));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); await cdp.send('Profiler.start');
  await page.evaluate(() => { const app = window.__game, v = app.view; for (let i = 0; i < 20; i++) v.update(0.016, app.rig.focus, app.rig.dist); });
  console.log('prewarmed', await page.evaluate(() => window.__game.view.prewarmed));
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
  const dt = profile.timeDeltas; const counts = new Map();
  profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
  for (const [id, us] of counts) { const n = byId.get(id), k = `${n.callFrame.functionName || '(anon)'} @${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + us); }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, us]) => `${(us / 1000 / 20).toFixed(2)}ms  ${k}`);
  console.log(top.join('\n'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
