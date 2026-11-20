// 回归测试：node tools/regress.cjs [名字片段]
// 先 node build.mjs --dev，然后在无头浏览器里逐个跑 tools/tests/ 下的场景，检查：没有页面报错 + 场景返回值符合预期。
// 场景脚本里可以用 window.__shot(名字) 截图（存到 tools/tests/out/）。
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const OUT = path.join(__dirname, 'tests/out'); fs.mkdirSync(OUT, { recursive: true });
const CASES = [
  { name: '六边形岛·经典主题能正常渲染', file: 'island-classic.js', query: 'debug=1', check: (r) => Array.isArray(r) && r.length === 0 },
  { name: '六边形岛·AI 造岛（模拟回复）：新物种按造物台格式生成并住进岛里', file: 'ai-island.js', query: 'debug=1&style=blocky&q=smooth', check: (r) => r.makes.length === 2 && r.items.length >= 1 && r.biomePlants[0][0]?.startsWith('mk_') },
  { name: '方块岛·点放、划动摆一排、按住拆、选取、蓝图存取放', file: 'blocks-build.js', query: 'mode=blocks', check: (r) => r.placeOne === 1 && r.row >= 8 && r.holdBreak === -1 && r.picked === 1 && r.bp.length === 1 && r.make.length === 1 && r.copied > 100 },
  { name: '造物台·添加、上色、拖手柄改大小、保存', file: 'studio-edit.js', query: 'mode=blocks', check: (r) => r.added >= 1 && r.s1 > r.s0 && r.saved.length === 1 },
  { name: '造物台·转过角度的块沿自身方向改大小', file: 'studio-rotate.js', query: 'mode=blocks', check: (r) => r.s[0] > 4 && Math.abs(Math.abs(r.dp[0]) - Math.abs(r.dp[2])) < 0.3 && Math.abs(r.dp[0]) > 0.5 },
  { name: '造物台·AI 帮我做（模拟回复）与在当前造物上修改', file: 'studio-ai.js', query: 'mode=blocks', check: (r) => r.boxes > 10 && r.sysHasBible && r.editHasBase && r.saved === 1 },
];
(async () => {
  const only = process.argv[2]; let fail = 0;
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const c of CASES) {
    if (only && !c.name.includes(only) && !c.file.includes(only)) continue;
    const page = await browser.newPage({ viewport: { width: 834, height: 375 } }), errors = [];
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.exposeFunction('__shot', async (n) => { await page.screenshot({ path: path.join(OUT, c.file.replace('.js', '') + '-' + n + '.png'), timeout: 240000 }); });
    const t0 = Date.now(); let ret, err = null;
    try {
      await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + '?' + c.query);
      await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 180000 });
      ret = await page.evaluate(`(async () => { ${fs.readFileSync(path.join(__dirname, 'tests', c.file), 'utf8')} })()`);
      if (!c.check(ret)) err = '返回值不符合预期：' + JSON.stringify(ret).slice(0, 300);
    } catch (e) { err = e.message.split('\n')[0]; }
    if (!err && errors.length) err = '页面报错：' + errors.slice(0, 3).join(' | ');
    console.log(`${err ? '✗' : '✓'} ${c.name}（${((Date.now() - t0) / 1000).toFixed(0)}s）${err ? '\n    ' + err : ''}`); if (err) fail++;
    await page.close();
  }
  await browser.close();
  console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
})();
