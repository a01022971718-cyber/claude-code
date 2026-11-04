// 把 voice/<英雄>/*.mp3 打包进 js/voice-data.js（base64），单文件版与安卓包都能离线播放。
// 用法：node tools/pack-voices.mjs        （换成真人录音时：按 voice/manifest.json 的文件名替换 mp3，再运行本脚本）
import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const man = JSON.parse(fs.readFileSync(path.join(root, 'voice/manifest.json'), 'utf8'));
const out = {}; let bytes = 0, n = 0;
for (const [hid, lines] of Object.entries(man)) {
  out[hid] = {};
  for (const [text, file] of Object.entries(lines)) {
    const f = path.join(root, 'voice', file);
    if (!fs.existsSync(f)) { console.warn('缺少录音', f); continue; }
    const b = fs.readFileSync(f); bytes += b.length; n++;
    out[hid][text] = b.toString('base64');
  }
}
const head = '/* 英雄配音录音（自动生成，不要手改）：node tools/pack-voices.mjs\n * 来源：voice/manifest.json + voice/<英雄>/*.mp3；生成方法见 tools/gen-voices.py 与 THIRD_PARTY.md。 */\n';
fs.writeFileSync(path.join(root, 'js/voice-data.js'), head + 'window.CF_VOICE_DATA = ' + JSON.stringify(out) + ';\n');
console.log(`打包 ${n} 条录音，${(bytes / 1024).toFixed(0)} KB → js/voice-data.js ${(fs.statSync(path.join(root, 'js/voice-data.js')).size / 1024).toFixed(0)} KB`);
