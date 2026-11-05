// 英语田园换皮工具：把「生而向星」原版 CSS 里的颜色，按用途换成《造月之路》的色板。
// 用法：node tools/farm-skin.mjs <原版 assets 目录> <输出目录 farm/>
// 只改颜色，不改布局、不改功能。原版是「奶油纸面 + 深棕描边」的亮色主题，换成游戏界面视觉宪法第 2 章的
// 「深空黑底 + 紫夜面板 + 米白文字 + 破晓橙主按钮 + 探索青选中」。
// 同一个颜色在不同地方用途不同（深棕既当文字色又当底色），所以按 CSS 属性分三种用途分别映射：
//   文字（color / fill …）  · 底色（background …）  · 线条（border / box-shadow / outline …）
// 同一条规则里如果底色被换成了亮色（按钮、徽章），文字自动换成深色，保证对比度。
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [SRC, DST] = process.argv.slice(2);
// 被 tools/farm-zy-build.mjs 当模块引用时不执行下面的「执行」部分
const MAIN = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (MAIN && (!SRC || !DST)) { console.error('用法：node tools/farm-skin.mjs <src> <dst>'); process.exit(1); }

// ---------- 颜色工具 ----------
const hex2rgb = (h) => {
  h = h.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16), a = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
};
const hsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
};
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const out = (hexStr, a) => {
  if (a >= 0.999) return hexStr;
  const [r, g, b] = hex2rgb(hexStr);
  return `rgba(${r},${g},${b},${+a.toFixed(3)})`;
};

// 原版色板分类
function kind(rgb) {
  const [h, s, l] = hsl(rgb);
  if (l >= 0.97 && s < 0.2) return 'white';
  if (l <= 0.04) return 'black';
  // 奶油、米白、浅色描边（偏黄的浅色和低饱和浅色算「纸」；高饱和的浅蓝、浅红算强调色）
  if (l >= 0.85 || (l >= 0.7 && ((h >= 30 && h < 62 && s < 0.9) || s < 0.45))) return 'light';
  if (s < 0.3) return l < 0.3 ? 'dark' : 'mid';           // 深墨、灰棕
  if (l < 0.36) {                                        // 深色：棕 / 深绿 / 深红 / 深青
    if (h >= 10 && h < 40) return 'dark';
    if (h >= 65 && h < 160) return 'dkgreen';
    if (h >= 160 && h < 200) return 'dkteal';
    if (h < 10 || h >= 330) return 'dkred';
    return 'dkblue';
  }
  if (h >= 15 && h < 38 && l < 0.5) return 'brown';      // 中棕（描边棕、木头）
  if (h >= 38 && h < 66) return l > 0.55 && s < 0.7 ? 'shade' : 'gold';
  if (h >= 66 && h < 160) return 'green';
  if (h >= 160 && h < 200) return 'teal';
  if (h >= 200 && h < 255) return 'blue';
  if (h >= 255 && h < 330) return 'purple';
  if (h >= 15 && h < 38) return 'orange';
  return 'red';
}

// 《造月之路》色板（art/02-game-ui-constitution.md 第 2 章）
const TEXT = { white: '#ffffff', black: '#ede6d6', light: '#ede6d6', dark: '#ede6d6', mid: '#b3abc4', brown: '#ffc48a', shade: '#ffe08a',
  gold: '#ffd257', orange: '#ffb14a', green: '#8af0a6', teal: '#4ef0ff', blue: '#9fd8ff', purple: '#c9b8ff', red: '#ff8a95',
  dkgreen: '#8af0a6', dkteal: '#4ef0ff', dkred: '#ff8a95', dkblue: '#9fd8ff' };
const LINE = { white: '#ffffff', black: '#000000', light: '#ffffff', dark: '#3a3357', mid: '#4a4168', brown: '#5b3aa8', shade: '#6a4fc0',
  gold: '#ffb14a', orange: '#ff9a5c', green: '#6fdc8c', teal: '#4ef0ff', blue: '#4ef0ff', purple: '#9b7bff', red: '#ff5d6c',
  dkgreen: '#2f7a4c', dkteal: '#5b3aa8', dkred: '#a8324a', dkblue: '#3a4aa0' };
function bgOf(rgb, k) {
  const l = hsl(rgb)[2];
  switch (k) {
    case 'white': return '#2a2346';
    case 'light': return l >= 0.9 ? '#272042' : l >= 0.82 ? '#1d1930' : '#181429';   // 原版越亮 → 面板越「抬起」
    case 'shade': return '#130f22';
    case 'dark': return l < 0.18 ? '#0b0a12' : '#120e22';
    case 'mid': return '#1d1930';
    case 'brown': return '#22144c';
    case 'black': return '#000000';
    case 'gold': return '#ffb14a';
    case 'orange': return '#ff9a5c';
    case 'green': return '#6fdc8c';
    case 'teal': return '#3fd0c9';
    case 'blue': return '#4ef0ff';
    case 'purple': return '#9b7bff';
    case 'red': return '#ff5d6c';
    case 'dkgreen': return '#173a2a';
    case 'dkteal': return '#22144c';
    case 'dkred': return '#4a1626';
    case 'dkblue': return '#1b2260';
  }
  return '#1d1930';
}
function mapColor(rgba, role) {
  const [r, g, b, a] = rgba, k = kind([r, g, b]);
  if (role === 'text') return out(TEXT[k], a);
  if (role === 'bg') return out(bgOf([r, g, b], k), a);
  // 线条：暗色阴影按透明度加深（深色底上要更重才看得见），浅色高光减弱
  if (role === 'line') {
    if ((k === 'dark' || k === 'black' || k === 'mid') && a < 0.999) return `rgba(0,0,0,${Math.min(0.85, a * 1.7).toFixed(3)})`;
    if ((k === 'light' || k === 'white') && a < 0.999) return `rgba(255,255,255,${Math.min(0.35, a * 0.4).toFixed(3)})`;
    return out(LINE[k], a);
  }
  return null;
}

// ---------- 属性用途 ----------
function roleOf(prop) {
  prop = prop.toLowerCase();
  if (/^(color|caret-color|-webkit-text-fill-color|text-decoration-color|fill|stroke|accent-color)$/.test(prop)) return 'text';
  if (/^background/.test(prop)) return 'bg';
  if (/^(border|outline|box-shadow|text-shadow|column-rule|-webkit-text-stroke|filter|scrollbar-color)/.test(prop)) return 'line';
  if (prop.startsWith('--')) {                          // 自定义属性：按名字推断
    if (/(shadow|pb|contour|line|border|grain|outline|stroke)/.test(prop)) return 'line';
    if (/(ink|text|fg|font)/.test(prop)) return 'text';
    return 'bg';
  }
  return null;
}

// 原版 :root 里的颜色令牌（用 var(--x) 引用时先解析成真实颜色再按用途映射）
const TOK = {};
function collectTokens(css) {
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*[;}]/g)) if (!(m[1] in TOK)) TOK[m[1]] = m[2];
  for (const m of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*[;}]/g)) if (!(m[1] + ':rgb' in TOK)) TOK[m[1] + ':rgb'] = [+m[2], +m[3], +m[4]];
}

let stats = { decl: 0, colors: 0 };
function mapValue(val, role) {
  // rgba(var(--i-paper), .9)
  val = val.replace(/rgba?\(\s*var\((--[a-zA-Z0-9-]+)\)\s*,\s*([\d.]+)\s*\)/g, (m, v, a) => {
    const t = TOK[v + ':rgb']; if (!t) return m; stats.colors++; return mapColor([...t, +a], role);
  });
  val = val.replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+%?)\s*)?\)/g, (m, r, g, b, a) => {
    let al = a == null ? 1 : a.endsWith('%') ? parseFloat(a) / 100 : +a; stats.colors++; return mapColor([+r, +g, +b, al], role);
  });
  val = val.replace(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b/g, (m) => { stats.colors++; return mapColor(hex2rgb(m), role); });
  // 运行时主题令牌 --e-*（UI4BASE 已改成我们的色板）：原版把「描边棕」也当标题字色、把「纸色」当深色块上的字色，
  // 换成深色主题后这些搭配会看不见，所以按用途改引用：文字里的描边色 → 标题米白；文字里的纸色 / 底色 → 正文色；底色里的墨色 → 深底
  if (role === 'text') {
    val = val.replace(/var\(--e-border\)/g, 'var(--zy-title)')
      .replace(/var\(--e-(panel|panelShade|highlight|input|nav|navShade|resource|labelOutline)\)/g, 'var(--e-ink)');
  } else if (role === 'bg') {
    val = val.replace(/var\(--e-ink\)/g, 'var(--e-panelShade)');
  }
  // 引用原版基础令牌（--paper / --ink …）→ 换成按用途映射后的真实颜色
  val = val.replace(/var\((--[a-zA-Z0-9-]+)\s*(?:,\s*([^()]*))?\)/g, (m, v) => {
    if (v.startsWith('--e-') || v.startsWith('--zy-') || !TOK[v]) return m;
    stats.colors++; return mapColor(hex2rgb(TOK[v]), role);
  });
  return val;
}

// 处理一段 CSS：逐条声明替换颜色；同一规则里底色被换成亮色时，把文字色换成深色
const DARK_INK = '#1a1030';
function skinCss(css) {
  const keep = [];
  css = css.replace(/\/\*[\s\S]*?\*\//g, (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
  css = css.replace(/url\((?:[^()]|\([^()]*\))*\)/g, (m) => { keep.push(m); return `\u0000${keep.length - 1}\u0000`; });
  css = css.replace(/\{([^{}]*)\}/g, (blk, body) => {
    let brightBg = false;
    const decls = body.split(';').map((d) => {
      const i = d.indexOf(':'); if (i < 0) return d;
      const prop = d.slice(0, i).trim(), role = roleOf(prop); if (!role) return d;
      if (/^@|^\s*$/.test(prop)) return d;
      const v0 = d.slice(i + 1), v1 = mapValue(v0, role); stats.decl++;
      if (role === 'bg' && !prop.startsWith('--')) {
        const c = v1.match(/#[0-9a-fA-F]{6}\b/);
        if (c && lum(hex2rgb(c[0])) > 0.35 && !/transparent|gradient/.test(v1)) brightBg = true;
      }
      return d.slice(0, i + 1) + v1;
    });
    if (brightBg) for (let j = 0; j < decls.length; j++) {
      const d = decls[j], i = d.indexOf(':'); if (i < 0) continue;
      if (/^\s*color\s*$/i.test(d.slice(0, i))) decls[j] = d.slice(0, i + 1) + DARK_INK + (/!important/.test(d) ? '!important' : '');
    }
    return '{' + decls.join(';') + '}';
  });
  return css.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
}

export { skinCss, collectTokens, TOK, stats };

// ---------- 执行 ----------
if (MAIN) {
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.css'));
const htmlSrc = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
for (const f of files) collectTokens(fs.readFileSync(path.join(SRC, f), 'utf8'));
for (const m of htmlSrc.matchAll(/<style>([\s\S]*?)<\/style>/g)) collectTokens(m[1].replace(/@font-face\{[^}]*\}/g, ''));

for (const f of files) {
  const s = fs.readFileSync(path.join(SRC, f), 'utf8');
  fs.writeFileSync(path.join(DST, f), '/* 已按《造月之路》游戏界面视觉宪法换色（tools/farm-skin.mjs） */\n' + skinCss(s).replace(/color-scheme:light/g, 'color-scheme:dark'));
}
let html = htmlSrc.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => {
  // 字体（base64 很长、没有颜色）原样保留
  const fonts = []; css = css.replace(/@font-face\{[^}]*\}/g, (x) => { fonts.push(x); return `\u0001${fonts.length - 1}\u0001`; });
  return '<style>' + skinCss(css).replace(/\u0001(\d+)\u0001/g, (x, i) => fonts[+i]) + '</style>';
});
html = html.replace(/color-scheme:light/g, 'color-scheme:dark');
html = html.replace(/<meta name="theme-color" content="[^"]*">/, '<meta name="theme-color" content="#0b0a12">');
// 皮肤层和桥接脚本放在最后，保证覆盖所有图层
html = html.replace(/<\/body>/, '<link rel="stylesheet" href="zaoyue-skin.css"><script src="zaoyue-bridge.js"></script></body>');
fs.writeFileSync(path.join(DST, 'index.html'), html);

// UI 编辑器（v4）的默认配色 → 《造月之路》色板（玩家在「界面编辑」里改过的颜色仍然优先，「恢复默认」回到这一套）
const ZY_UI4 = "UI4BASE={panel:'#1d1930',panelShade:'#110f1b',ink:'#ede6d6',muted:'#b3abc4',border:'#4a3f72',highlight:'#2a2346',button:'#ffb14a',buttonShade:'#ff7a45',buttonInk:'#2a1206',label:'#ffe08a',labelOutline:'#22144c',nav:'#1d1638',navShade:'#0b0a12',selected:'#4ef0ff',badge:'#ff4f9a',badgeInk:'#ffffff',resource:'#110f1b',resourceInk:'#ffe08a',input:'#110f1b',inputBorder:'#5b3aa8',danger:'#ff5d6c',info:'#4ef0ff'}";
const ed = fs.readFileSync(path.join(SRC, 'farm-editor-v4.js'), 'utf8');
if (!/UI4BASE=\{[^}]*\}/.test(ed)) throw new Error('farm-editor-v4.js 里找不到 UI4BASE');
fs.writeFileSync(path.join(DST, 'farm-editor-v4.js'), ed.replace(/UI4BASE=\{[^}]*\}/, ZY_UI4));

// v6 图层又定义了一套默认色（IMM6_COLORS）并覆盖 UI4BASE、写进新存档：换成同一套造月色板。
// 「界面编辑」里的配色方案保留五个（功能不变），全部改成深色版本，和换色后的 CSS 匹配：造月（默认）· 田园 · 海盐 · 莓果 · 奶油
const IMM = fs.readFileSync(path.join(SRC, 'immersive-v6.js'), 'utf8');
const ZY_IMM = "const IMM6_COLORS={...UI4BASE,panel:'#1d1930',panelShade:'#110f1b',ink:'#ede6d6',muted:'#b3abc4',border:'#4a3f72',highlight:'#2a2346',button:'#ffb14a',buttonShade:'#ff7a45',buttonInk:'#2a1206',label:'#ffe08a',labelOutline:'#22144c',nav:'#1d1638',navShade:'#0b0a12',selected:'#4ef0ff',badge:'#ff4f9a',badgeInk:'#ffffff',resource:'#110f1b',resourceInk:'#ffe08a',input:'#110f1b',inputBorder:'#5b3aa8',danger:'#ff5d6c',info:'#4ef0ff'}";
const ZY_PRESETS = "Object.assign(UI4BASE,IMM6_COLORS);for(const k of Object.keys(UI4PRESETS))delete UI4PRESETS[k];Object.assign(UI4PRESETS,{"
  + "造月:UI4BASE,"
  + "田园:{...IMM6_COLORS,panel:'#14261a',panelShade:'#0b1810',border:'#2f6a44',nav:'#14261a',navShade:'#0b1810',selected:'#8af0a6',highlight:'#1d3524',resource:'#0b1810',inputBorder:'#2f7a4c'},"
  + "海盐:{...IMM6_COLORS,panel:'#0d2030',panelShade:'#081521',border:'#2d5a7a',nav:'#0d2030',navShade:'#05101a',selected:'#7fe9ff',highlight:'#15304a',resource:'#081521',inputBorder:'#2d6a9a',button:'#7fe9ff',buttonShade:'#3fb0d0',buttonInk:'#04202c'},"
  + "莓果:{...IMM6_COLORS,panel:'#2a1426',panelShade:'#1a0c18',border:'#6a2f5e',nav:'#2a1426',navShade:'#1a0c18',selected:'#ff7ad9',highlight:'#3a1c34',resource:'#1a0c18',inputBorder:'#8a3a7a'},"
  + "奶油:{...IMM6_COLORS,panel:'#2a2014',panelShade:'#1a140c',border:'#6a5230',nav:'#2a2014',navShade:'#1a140c',selected:'#ffd98a',highlight:'#3a2c1c',resource:'#1a140c',inputBorder:'#8a6a3a'}});";
let imm2 = IMM.replace(/const IMM6_COLORS=\{[^}]*\}/, ZY_IMM);
imm2 = imm2.replace(/Object\.assign\(UI4BASE,IMM6_COLORS\);Object\.assign\(UI4PRESETS\.田园,IMM6_COLORS\);(\s*UI4PRESETS\.[^=]+=\{\.\.\.IMM6_COLORS[^}]*\};)+/, ZY_PRESETS);
if (!imm2.includes('造月:UI4BASE') || !imm2.includes("panel:'#1d1930'")) throw new Error('immersive-v6.js 的默认配色没有替换成功');
fs.writeFileSync(path.join(DST, 'immersive-v6.js'), imm2);

// 主创要求（v8）：「只改 UI，其它的不要动」——功能逻辑一律用原版，这里只改颜色和界面；updates-v7.js 等逻辑文件原样复制
fs.copyFileSync(path.join(SRC, 'updates-v7.js'), path.join(DST, 'updates-v7.js'));
console.log(`换色完成：${files.length} 个 CSS + index.html，${stats.decl} 条声明，${stats.colors} 处颜色`);
}
