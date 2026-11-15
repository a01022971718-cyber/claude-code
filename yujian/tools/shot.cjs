// 游戏截图工具：node tools/shot.cjs <输出.png> [脚本.js] [宽] [高]
// 打开 dist/index.html，可选地在页面里执行一段脚本（可用 window.__game 调试接口），然后截图。
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const [out = 'shot.png', script, w = '1280', h = '640', query = 'debug=1'] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1, hasTouch: false });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.exposeFunction('__shot', async (name) => { await page.screenshot({ path: out.replace(/\.png$/, '-' + name + '.png') }); });
  await page.goto('file://' + path.resolve(__dirname, '../dist/' + (process.env.PAGE || 'index.html')) + (query ? '?' + query : ''));
  await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 60000 });
  if (script && fs.existsSync(script)) {
    const code = fs.readFileSync(script, 'utf8');
    const res = await page.evaluate(`(async () => { ${code} })()`);
    if (res !== undefined) console.log('脚本返回:', JSON.stringify(res));
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: out });
  if (errors.length) console.log('错误:\n' + errors.slice(0, 12).join('\n'));
  else console.log('无报错');
  await browser.close();
  console.log('已输出', out);
})().catch((e) => { console.error(e); process.exit(1); });
