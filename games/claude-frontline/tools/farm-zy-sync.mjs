// 只刷新英语田园里的造月之路层（v9.2）：重新拼 farm/zy/zy-engine.js，并把 farm-zy-src/ 里的 zy.css、zy-farm.js、zy-bridge.js 复制过去。
// 不需要原版田园素材和语音识别库（完整重建仍用 tools/farm-zy-build.mjs）。用法：node tools/farm-zy-sync.mjs
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), DST = path.join(ROOT, 'farm');
if (!fs.existsSync(path.join(DST, 'zy'))) { console.error('farm/zy 不存在：先用 tools/farm-zy-build.mjs 完整构建一次'); process.exit(1); }
const ENGINE = ['config.js', 'core.js', 'icons.js', 'heroes.js', 'audio.js', 'pixelfx.js'];   // 与 farm-zy-build.mjs 保持一致
fs.writeFileSync(path.join(DST, 'zy', 'zy-engine.js'), '/* 《造月之路》引擎（自动拼接自 js/' + ENGINE.join('、js/') + '） */\n' +
  ENGINE.map((f) => `/* ===== js/${f} ===== */\n` + fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n'));
const files = ['zy.css', 'zy-farm.js'].concat(fs.existsSync(path.join(DST, 'zy', 'zy-bridge.js')) ? ['zy-bridge.js'] : []);
for (const f of files) fs.copyFileSync(path.join(ROOT, 'farm-zy-src', f), path.join(DST, 'zy', f));
console.log('已刷新 farm/zy：zy-engine.js、' + files.join('、'));
