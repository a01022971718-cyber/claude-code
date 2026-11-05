// 「豆豆的田园厨房」造月之路版：node tools/farm-zy-build.mjs <原版目录> <输出目录>
// 主创要求（v8）：原版给的是「食材和菜谱」（功能、内容、素材），做法按《造月之路》自己的美术宪法——
//   跟随英雄主题换色（UI 宪法第 2.2 章）、像素脉冲舞台和节拍动效（第 0、1 章「节拍即生命」）、
//   四位一体：配色 · 乐器 · 音乐 · 特效来自同一位英雄（第 10 章）、玻璃 HUD 与底部导航（第 6、8 章）、像素图标（第 12 章）。
// 做法：原版文件原样保留，只在页面末尾加三样东西（全部挂在 html.zy 下，随时可以一键关掉恢复原版外观）：
//   zy/zy-farm-skin.css  原版 CSS 按用途换成深色色板后，每条规则加上 html.zy 前缀（tools/farm-skin.mjs 的换色规则）
//   zy/zy-engine.js      造月之路的引擎原文件：core · config · icons · heroes · audio · pixelfx
//   zy/zy.css + zy/zy-farm.js  造月之路的界面组件与接线（源文件在 farm-zy-src/）
import fs from 'node:fs';
import path from 'node:path';
import { skinCss, collectTokens, stats } from './farm-skin.mjs';

const [SRC, DST] = process.argv.slice(2);
if (!SRC || !DST) { console.error('用法：node tools/farm-zy-build.mjs <原版目录> <输出目录>'); process.exit(1); }
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));

// ---------- 1. 原版文件原样复制 ----------
fs.mkdirSync(DST, { recursive: true });
fs.cpSync(SRC, DST, { recursive: true });

// ---------- 2. 深色底：换色 + 加 html.zy 前缀 ----------
function splitSel(s) {   // 按逗号切选择器，括号里的逗号不切
  const out = []; let d = 0, cur = '';
  for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out.map((x) => x.trim()).filter(Boolean);
}
const pfx = (s) => /^(:root|html)\b/.test(s) ? s.replace(/^(:root|html)/, 'html.zy') : 'html.zy ' + s;
function prefixCss(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '', i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i); if (open < 0) break;
    const head = css.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === '{') depth++; else if (css[j] === '}') depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (/^@(media|supports)/.test(head)) out += head + '{' + prefixCss(body) + '}';
    else if (!head.startsWith('@') && head) out += splitSel(head).map(pfx).join(',') + '{' + body + '}';
    // @keyframes、@font-face 不复制（名字是全局的，复制会影响关掉主题后的原版外观）
    i = j;
  }
  return out;
}
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1].replace(/@font-face\{[^}]*\}/g, ''));
styles.forEach(collectTokens);
const skin = styles.map((css) => prefixCss(skinCss(css).replace(/color-scheme:light/g, 'color-scheme:dark'))).join('\n');
fs.mkdirSync(path.join(DST, 'zy'), { recursive: true });
fs.writeFileSync(path.join(DST, 'zy', 'zy-farm-skin.css'), '/* 自动生成（tools/farm-zy-build.mjs）：原版样式换成深色色板，全部挂在 html.zy 下 */\n' + skin);

// ---------- 3. 造月之路引擎（原文件拼接，不改一行） ----------
const ENGINE = ['config.js', 'core.js', 'icons.js', 'heroes.js', 'audio.js', 'pixelfx.js'];
fs.writeFileSync(path.join(DST, 'zy', 'zy-engine.js'), '/* 《造月之路》引擎（自动拼接自 js/' + ENGINE.join('、js/') + '） */\n' +
  ENGINE.map((f) => `/* ===== js/${f} ===== */\n` + fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n'));
for (const f of ['zy.css', 'zy-farm.js']) fs.copyFileSync(path.join(ROOT, 'farm-zy-src', f), path.join(DST, 'zy', f));

// ---------- 4. 接进页面 ----------
// 背景音乐：加一个「英雄主题曲」选项，并设为农场 / 地图 / 玩法的默认曲（四位一体）；原版的三首小曲和上传音乐都还在
const n0 = html.length;
html = html.replace("const bgmOpts = () => [['', '不放'],", "const bgmOpts = () => [['', '不放'], ['zy:hero', '英雄主题曲（跟随主题英雄）'],");
html = html.replace("const BGM_DEF = { farm: 'gen:field', map: 'gen:happy', mod: 'gen:happy' };", "const BGM_DEF = { farm: 'zy:hero', map: 'zy:hero', mod: 'zy:hero' };");
if (!html.includes("['zy:hero', '英雄主题曲") || !html.includes("farm: 'zy:hero'")) throw new Error('背景音乐的接入点没找到（原版代码变了？）');
html = html.replace(/<\/body>/, '<link rel="stylesheet" href="zy/zy-farm-skin.css"><link rel="stylesheet" href="zy/zy.css"><script src="zy/zy-engine.js"></script><script src="zy/zy-farm.js"></script></body>');
if (html.length === n0) throw new Error('没有改动页面');
fs.writeFileSync(path.join(DST, 'index.html'), html);
console.log(`完成：深色底 ${stats.decl} 条声明 / ${stats.colors} 处颜色；引擎 ${ENGINE.length} 个文件；输出 ${DST}`);
