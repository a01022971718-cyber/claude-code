// 从游戏数据生成英雄设定集：node tools/gen-heroes-doc.mjs  →  art/03-heroes.md
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = { window: {}, console, Math, Date, performance: { now: () => 0 }, setTimeout, clearTimeout, setInterval, clearInterval };
sandbox.window.CF = { bus: { on() {}, emit() {} }, Save: { data: { hero: 'xs', settings: {} } } };
sandbox.CF_CONFIG = { bgm: {}, volume: {} };
sandbox.window.CF_CONFIG = sandbox.CF_CONFIG;
vm.createContext(sandbox);
for (const f of ['heroes.js', 'audio.js', 'game.js', 'skills.js']) vm.runInContext(readFileSync(join(root, 'js', f), 'utf8'), sandbox, { filename: f });
const CF = sandbox.window.CF, H = CF.Heroes.list, ST = CF.Skills.STATS, IC = CF.Skills.ICON, BT = CF.Game.BT, UT = CF.Game.UT, STY = CF.Audio.STYLES;
const cost = (c) => Object.entries(c || {}).map(([k, v]) => `${{ chip: '晶片', corp: '语料', comp: '算力' }[k]} ${v}`).join(' · ');

let md = `# X-S 英雄设定集\n\n> 本文件由 \`node tools/gen-heroes-doc.mjs\` 从游戏数据自动生成，请改 \`js/heroes.js\` 后重新生成，不要手改。\n> 灵感取自中美知名 AI 大模型的公开特点，均为原创形象，不代表任何公司。\n\n## 世界观\n\n智能大陆被「乱码潮」侵蚀——噪声、幻觉、遗忘与熵吞噬着一切信号。东西两岸诞生的乐手们发现：**音乐是把噪声变回信号的协议**。九位乐手各守一方，直到造月港的指挥家「造乐」带着发电巡航无人机「伏特」出发，一个一个拜访他们——从星芒工坊的 X-S 开始。九件乐器第一次在同一拍上响起，乱码潮退去了一整片海。她说：下一站，月亮。\n\n**乐器即法宝**：每位英雄的乐器是后期才能获得的「法宝」（见《英雄设计宪法》第 6 章）。没有法宝时形象不带乐器、终极技能不可用；乐器、主题曲与配色设定本身不变。\n\n| 英雄 | 阵营 | 乐器 | 定位 | 灵感来源 |\n|---|---|---|---|---|\n`;
H.forEach((h) => (md += `| ${h.name}（${h.en}） | ${h.side === '原创' ? 'X-S' : h.side === '中' ? '中国' : '美国'} | ${h.instrument} | ${h.role} | ${h.inspire.replace('灵感来源：', '')} |\n`));
H.forEach((h) => {
  const s = ST[h.id], ms = STY[h.music.style], bk = Object.keys(BT).find((k) => BT[k].hero === h.id), uk = Object.keys(UT).find((k) => UT[k].hero === h.id && UT[k].cost);
  const b = BT[bk], u = UT[uk], p = h.pal;
  md += `\n---\n\n## ${h.name} · ${h.title}\n\n**${h.world}** · ${h.side === '原创' ? 'X-S 原创' : h.side === '中' ? '中国' : '美国'} · ${h.instrument} · ${h.role}\n\n> 「${h.quote}」\n\n`;
  if (h.weapons) md += `- **武器**：${h.weapons.join('；')}\n`;
  if (h.companion) md += `- **伴生**：${h.companion.name}——${h.companion.desc}\n`;
  if (h.voice) md += `- **配音**：${{ m: '男', f: '女', n: '中性' }[h.voice.gender]} · ${h.voice.age} 岁 · ${h.voice.tone}\n`;
  md += `- **性格**：${h.personality}\n- **故事**：${h.story}\n- **口头禅**：${Object.values(h.lines).map((l) => `「${l}」`).join(' ')}\n- **灵感来源**：${h.inspire.replace('灵感来源：', '')}\n\n`;
  md += `**基础属性**：耐久 ${s.hp} · 攻击 ${s.dmg} · 射程 ${s.range} · 攻击间隔 ${s.rate}s · 移速 ${s.speed}${s.armor ? ` · 护甲 ${s.armor}` : ''}${s.melee ? ' · 近战' : ''}\n\n`;
  md += `| 键 | 技能 | 效果 | 算力 | 冷却 |\n|---|---|---|---|---|\n| 被动 | ${h.passive.name} | ${h.passive.desc} | — | — |\n`;
  h.skills.forEach((k, i) => (md += `| ${k.key} ${IC[h.id][i]} | ${k.name}${k.treasure ? '（需法宝）' : ''} | ${k.desc} | ${Math.round(k.cost * (h.id === 'abyss' ? 0.7 : 1))} | ${k.cd}s |\n`));
  md += `\n- **专属小兵 · ${u.name}**：${u.desc}（耐久 ${u.hp}，伤害 ${u.atk.dmg}，射程 ${u.atk.range}，${cost(u.cost)}）\n- **专属建筑 · ${b.name}**：${b.desc}（耐久 ${b.hp}，${cost(b.cost)}）\n`;
  md += `- **主题曲**：《${ms.name.split('·')[1].trim()}》 · ${h.music.bpm} BPM · ${h.music.key} · ${h.music.scale} · 记忆点：${h.music.motif}\n`;
  md += `- **配色**：背景 \`${p.bg.join('` `')}\` · 主光 \`${p.glow}\` · 点缀 \`${p.accent}\` · 音符 \`${p.note}\`\n`;
});
writeFileSync(join(root, 'art', '03-heroes.md'), md);
console.log('已生成 art/03-heroes.md');
