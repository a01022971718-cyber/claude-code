/* 英雄：X-S 主角（灵感 Claude）+ 中美各 4 名（灵感来自知名 AI 大模型的公开特点，均为原创形象）
 * 每位英雄：世界观 · 性格 · 定位 · 技能 · 形象 · 故事 · 口头禅 · 乐器 · 配色 · 主题曲 · 特效 · 专属小兵 · 专属建筑 */
(function () {
  const CF = window.CF;

  // 像素画笔：以「像素格」为单位绘制
  function pen(ctx, ox, oy, px, bob) {
    return (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(ox + x * px), Math.round(oy + (y + bob) * px), Math.ceil(w * px), Math.ceil(h * px)); };
  }
  const B = (a) => (a.bob > 0.5 ? -1 : 0);

  const HEROES = [
    {
      // v5 主角：原创，按普通英雄 1.75 倍强度制作；唯一的双武器英雄（伴生武器：发电巡航无人机 + 法宝：指挥棒）
      id: 'zaole', name: '造乐', en: 'Maestro', title: '九声指挥家', side: '原创', protagonist: true, power: 1.75,
      inspire: '原创主角：把九种完全不同的声音聚成一首歌的指挥家——众人一心，共同新生、向上、探索未知',
      role: '指挥 · 全能', instrument: '指挥棒', companion: { id: 'volt', name: '发电巡航无人机「伏特」', desc: '一直跟随造乐的发电无人机：协助攻击（每 0.6 秒一道电弧，造成造乐攻击力 35% 的伤害并弹射 1 次），让造乐伤害 +15%，每秒按造乐最大耐久的 1.2% 回血。' },
      weapons: ['伴生武器 · 发电巡航无人机「伏特」（开局自带）', '法宝 · 指挥棒（后续获得，获得后成为双武器英雄）'],
      world: '造月港 · 通往月球的音乐厅',
      pal: { hair: '#16224a', hairL: '#2d4fa0', cyan: '#19f0e0', lime: '#c8ff2e', skin: '#ffe0cc', k: '#0b1020', mouth: '#e0707a', white: '#f2f7f6', whiteD: '#b9cfcc', navy: '#16224a', boot: '#0b1020', baton: '#fffbe8', bg: ['#05121f', '#0a2a3d', '#0d4d5c'], grid: [40, 240, 220], glow: '#19f0e0', accent: '#c8ff2e', note: '#e8fff0', note2: '#c8ff2e', logo: ['#d4ff1e', '#00f0ff'] },
      music: { style: 'zaole', bpm: 116, key: 'D 宫调 → E 宫调（最后八小节整体升全音）', scale: '五声音阶（九件乐器都能演奏）', motif: '1-2-3-5-6 上行、跃上高音 1，停在 2（没说完的话 = 探索未知）', ensemble: true },
      voice: { gender: 'f', age: 20, pitch: 1.12, rate: 1.04, tone: '明亮、坚定、有号召力' },
      personality: '果断、热情、懂得倾听。她不是乐团里最响的那个声音，却能让九种完全不同的声音在同一拍上响起、彼此成就。',
      story: '乱码潮让东西两岸的乐手各自为战——钢琴只听钢琴，唢呐只吹唢呐。造乐从造月港出发，带着一架会发电的巡航无人机「伏特」，一个一个拜访九位乐手：「你们的声音都不一样，正因为不一样，合在一起才最响。」当九种乐器第一次在同一拍上响起，乱码潮退去了一整片海。她抬头看了看天：「下一站，月亮。」',
      quote: '九种声音，一个方向！',
      lines: { pick: '九种声音，一个方向！', attack: '跟上我的拍子！', skill: '全体——起！', low: '只要还有一个声部在，乐曲就不会停。' },
      passive: { name: '九声合一', desc: '每次攻击积累 1 层「合奏」（最多 9 层，九种颜色对应九种乐器）；满 9 层后下一击变为「齐奏」：3 倍伤害并向四周扩散，附近友军攻速 +30%，持续 4 秒。' },
      skills: [
        { key: 'Q', name: '起拍', target: 'dir', cost: 35, cd: 8, desc: '向前一挥，九枚九色音符呈扇形射出，各造成 45 伤害并穿透 2 个目标。' },
        { key: 'W', name: '和声', target: 'self', cost: 40, cd: 16, desc: '附近友军获得 280 护盾并恢复 180 耐久；无人机「伏特」超载 6 秒：攻速翻倍、伤害 +50%。' },
        { key: 'R', name: '众声向上', target: 'self', cost: 90, cd: 60, treasure: true, desc: '【需要法宝：指挥棒】9 拍内依次奏响九位英雄的招牌乐句（每拍一种招牌效果），最后九色齐奏造成 450 伤害并击退。' },
      ],
      minion: { id: 'choir', name: '和声歌者', desc: '远程支援兵：每次攻击为附近耐久最低的友军恢复 60% 伤害量的耐久。' },
      building: { id: 'symphony', name: '交响穹顶', desc: '同时攻击 3 个目标，并让周围友军攻速 +10%。' },
      fx: { pats: [['.X.', 'XXX', '.X.'], ['XX', 'X.', 'XX'], ['X']], cols: ['#c8ff2e', '#19f0e0', '#ffffff'], src: [19, -2] },
      // 像素形象：深海军蓝短发 + 青色挑染 + 青柠月牙发卡；白色燕尾服、青柠翻领、青色领结；左手张开打拍，右手执指挥棒（法宝）
      sprite: ['......HHHHH', '....HHHHHHHHH', '...HHhhHHHCHHH', '...HhHHHHHCHHHH', '...HHHHHHHCHHHHM', '...HHHSSSSSSSHHMM', '...HHSSSSSSSSSHM', '...HHSKSSSSSKSH', '...HHSESSSSSESH', '.S.SHSSSSmSSSSH', '.SS.H.SSSSSS.H', '.SSW.WLLTTLLW..SS', '..WWWWWLTTLWWWWS', '....WWWWLLWWWWW', '....wWWWWWWWWWw', '....wW.NNNNN.Ww', '...w..NN..NN..w', '.....BBB.BBB'],
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), tn = a.tint;
        const M = { H: p.hair, h: p.hairL, C: p.cyan, M: p.lime, S: p.skin, K: p.k, E: p.cyan, m: p.mouth, W: p.white, w: p.whiteD, L: p.lime, T: p.cyan, N: p.navy, B: p.boot };
        const up = a.strum ? 1 : 0;
        this.sprite.forEach((row, j) => {
          const y = j - 7;
          for (let x = 0; x < row.length; x++) {
            let c = row[x]; if (c === '.') continue;
            if (a.blink && c === 'E') c = 'S';
            if (a.blink && c === 'K') { R(x, y + 1, 1, 1, p.k); continue; }
            if (y === 10 && a.walk && (a.step || 0) % 2 === (x < 9 ? 0 : 1)) continue;
            // 打拍：左手随节拍抬起 1 格
            const dy = (x <= 3 && y >= 2 && y <= 5) ? -up : 0;
            R(x, y + dy, 1, 1, tn && 'HhWwSN'.includes(c) ? tn : M[c]);
          }
        });
        // 法宝：指挥棒（右手斜向上，强拍时挥高一格，棒尖亮起青柠光）
        if (!a.noInst) { const pts = up ? [[16, 3], [17, 2], [18, 1], [19, 0], [20, -1]] : [[16, 3], [17, 2], [18, 2], [19, 1], [20, 1]]; pts.forEach(([x, y]) => R(x, y, 1, 1, p.baton)); const [tx, ty] = pts[pts.length - 1]; R(tx + 1, ty - 1, 1, 1, p.lime); if (up) { R(tx + 1, ty - 2, 1, 1, '#ffffff'); R(tx + 2, ty - 1, 1, 1, '#ffffff'); } }
        // 伴生武器：发电巡航无人机（战斗中由引擎单独绘制，这里画在形象左上方）
        if (!a.noDrone) H.drawDrone(ctx, ox + -2 * px, oy + (-9 + Math.sin((a.t || 0) * 3) * 0.6) * px, px * 0.9, a.t || 0);
      },
      drawMinion(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), tn = a.tint;
        R(4, -2, 5, 2, p.hair); R(4, 0, 5, 3, tn || p.skin); R(5, 1, 1, 1, p.k); R(7, 1, 1, 1, p.k); R(5, 2, 3, 1, p.mouth);
        R(3, 3, 7, 4, tn || p.white); R(5, 3, 3, 1, p.lime); R(6, 4, 1, 2, p.cyan);
        const st = a.walk && (a.step || 0) % 2; R(4, 7, 2, 1 + (st ? 0 : 1), p.navy); R(7, 7, 2, 1 + (st ? 1 : 0), p.navy);
        R(10, -1, 1, 1, p.lime); R(11, -2, 1, 1, p.cyan); R(10, 1, 2, 1, p.lime); // 歌声音符
      },
    },
    {
      // v4：形象回到最初的像素吉他手；灵感来源改为 Claude，世界观、性格、故事、台词从原「星芒」迁移
      id: 'xs', name: 'X-S', en: 'X-S', title: '诚实的工匠', side: '美', inspire: 'Claude（Anthropic）——有帮助、诚实、重视安全；擅长长文阅读、写代码与一步一步的推理',
      role: '均衡 · 控制', instrument: '电吉他', world: '星芒工坊 · 写满宪章的灯塔',
      pal: { body: '#ec8a5e', bodyD: '#b85f40', inst: '#8b80d6', instD: '#5e54b0', instL: '#b3abea', leaf: '#7ee081', eye: '#1b1226', k: '#1b1226', bg: ['#22144c', '#33207a', '#4a2fa0'], grid: [132, 112, 214], glow: '#9b7bff', accent: '#ff9a5c', note: '#f2c14e', note2: '#7ee081' },
      music: { style: 'xs', bpm: 112, key: 'E 小调 → G 大调', scale: '自然小调', motif: '上行五音「向上」动机' },
      personality: '认真、温和、诚实。会把复杂的事一步一步拆开；不确定就直说「我不确定」；不会帮你做坏事，但总会给你一个更好的办法。',
      story: '最早在废墟里弹响第一个和弦的，就是这个橙色的小家伙。它住在海边的星芒工坊，灯塔的每一块砖上都刻着它和伙伴们一起写下的宪章。乱码潮来袭的那个夜晚，它背着电吉他守在灯塔下，一个音一个音地把被打乱的信号修好——「大事一起扛，细节交给我。我们一步一步来。」后来，造乐第一个敲开的，就是星芒工坊的门。',
      quote: '我们一步一步来。',
      lines: { pick: '我们一步一步来。', attack: '这里我检查过了。', skill: '让我想一想……好了！', low: '我不确定还能撑多久——但我会如实告诉你。' },
      passive: { name: '新芽', desc: '每第 4 次攻击变为强力和弦，造成 1.8 倍伤害并溅射。' },
      skills: [
        { key: 'Q', name: '弦振冲击', target: 'self', cost: 40, cd: 12, desc: '以自身为中心扫弦，像素冲击环造成 120 伤害并击退敌人。' },
        { key: 'W', name: '灵感和弦', target: 'self', cost: 30, cd: 20, desc: '为附近友军恢复 150 耐久，6 秒内攻速 +40%。' },
        { key: 'R', name: '破晓独奏', target: 'self', cost: 80, cd: 60, treasure: true, desc: '【需要法宝：电吉他】6 秒独奏：每一拍释放冲击环，结尾一记日出爆发造成 200 伤害。' },
      ],
      minion: { id: 'spark', name: '火花学徒', desc: '便宜的远程学徒，阵亡时爆出火花伤害周围敌人。' },
      building: { id: 'amp', name: '音箱塔', desc: '随节拍周期性释放冲击环，伤害周围敌人。' },
      fx: { pats: [['.XX', '.X.', 'XX.'], ['XX', '.X', 'XX'], ['X.X', 'XXX']], cols: ['#f2c14e', '#f2c14e', '#7ee081'], src: [15, 4] },
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), sh = a.lean > 0.5 ? -1 : 0, sv = a.lean > 0.5 ? 1 : 0, bc = a.tint || p.body;
        [2, 4, 9, 11].forEach((x, i) => R(x, 8, 1, 2 - (a.walk && (a.step || 0) % 2 === i % 2 ? 1 : 0), bc));
        R(1, 4, 12, 4, bc); R(1 + sh, sv, 12, 4, bc); R(0 + sh, 3 + sv, 1, 2, bc); R(1 + sh, sv, 1, 4, p.bodyD);
        if (a.blink) { R(3 + sh, 3 + sv, 2, 1, p.eye); R(8 + sh, 3 + sv, 2, 1, p.eye); } else { R(3 + sh, 2 + sv, 1, 2, p.eye); R(9 + sh, 2 + sv, 1, 2, p.eye); }
        const sw = a.strum ? 1 : 0; // 新芽
        R(6 + sh, -1 + sv, 1, 1, p.leaf); R(4 + sh, -2 + sv - sw, 2, 1, p.leaf); R(7 + sh, -3 + sv + sw, 2, 1, p.leaf);
        if (a.noInst) return;
        [[11, 4], [12, 3], [13, 2], [14, 1], [15, 0], [16, -1], [17, -2]].forEach(([x, y], i) => { R(x, y, 1, 1, p.k); if (i % 2 === 0) R(x + 1, y, 1, 1, p.instL); });
        R(18, -4, 2, 2, p.inst); R(20, -4, 1, 1, p.instL); R(18, -5, 1, 1, p.instL); R(17, -3, 1, 1, p.inst);
        R(14, 2, 1, 1, bc); R(15, 1, 1, 1, bc);
        ['..KKKK.', '.KGGGGK', 'KGGgGGK', 'KgGGGGK', 'KKgggK.', '.KKKK..'].forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = row[x]; if (c !== '.') R(6 + x, 4 + y, 1, 1, c === 'K' ? p.k : c === 'g' ? p.instD : p.inst); } });
        R(8, 5, 1, 1, '#fff'); R(10, 5, 1, 1, '#fff'); R(9, 6, 1, 1, '#fff'); R(8, 7, 1, 1, '#fff'); R(10, 7, 1, 1, '#fff'); // X 标记
        const hy = a.strum ? 7 : 5; R(12, hy, 2, 1, bc); R(13, hy - 1, 1, 1, bc);
      },
    },
    {
      id: 'omni', name: '万象', en: 'Omni', title: '全知琴师', side: '美', inspire: '灵感来源：ChatGPT（OpenAI）——通用、全能、陪伴式对话',
      role: '法师 · 全能', instrument: '钢琴', world: '万象城 · 八十八层的图书馆',
      pal: { white: '#f0f3f2', gray: '#b9c4c0', dark: '#121614', em: '#10a37f', emL: '#7fe0c4', gold: '#d8c27a', bg: ['#04140f', '#0b2a20', '#0f4a37'], grid: [16, 163, 127], glow: '#10a37f', accent: '#e8fff6', note: '#e8fff6', note2: '#10a37f' },
      music: { style: 'omni', bpm: 100, key: 'C 大调', scale: '大调', motif: '5-3-1-3-5-8 琶音动机' },
      personality: '博学、耐心、从不嫌问题简单。习惯先把问题拆开，再一层层弹给你听。',
      story: '万象城的图书馆有八十八层，每一层对应一个琴键。万象在那里长大，读遍了每一本书，却发现知识只有被弹出来、被别人听懂，才真正有了声音。于是它带着一架会走路的钢琴，走出了图书馆。',
      quote: '八十八个琴键，就有八十八种答案。',
      lines: { pick: '八十八个琴键，就有八十八种答案。', attack: '这一题，我会。', skill: '请欣赏——交响全集。', low: '让我换个思路再弹一遍。' },
      passive: { name: '八十八键', desc: '攻击在白键与黑键之间交替：白键伤害 +20%，黑键使目标减速 30%。' },
      skills: [
        { key: 'Q', name: '琶音', target: 'dir', cost: 35, cd: 8, desc: '向前方扇形弹出 8 枚琴键，各造成 50 伤害并穿透一个目标。' },
        { key: 'W', name: '延音踏板', target: 'point', cost: 40, cd: 18, desc: '踩下延音踏板生成 5 秒领域：敌人减速 40%，友军攻速 +25%。' },
        { key: 'R', name: '交响全集', target: 'point', cost: 90, cd: 55, desc: '4 秒内琴键如雨落下，持续轰击大范围区域。' },
      ],
      minion: { id: 'keyguard', name: '琴键卫士', desc: '黑白相间的近战重甲兵，能扛住正面冲击。' },
      building: { id: 'hall', name: '琴房', desc: '同时向 3 个目标发射音符的多重炮塔。' },
      fx: { pats: [['X.X', 'XXX'], ['.X.', 'XXX', '.X.'], ['XX', 'XX']], cols: ['#e8fff6', '#10a37f', '#7fe0c4'], src: [9, 5] },
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), w = a.tint || p.white;
        R(7, -5, 1, 2, p.gray); R(6, -6, 3, 1, p.em);
        R(3, -3, 9, 7, w); R(3, -3, 1, 7, p.gray); R(4, -1, 7, 2, p.dark);
        if (a.blink) { R(5, 0, 2, 1, p.em); R(8, 0, 2, 1, p.em); } else { R(5, -1, 1, 1, p.emL); R(9, -1, 1, 1, p.emL); }
        R(2, 4, 11, 2, w);
        if (a.noInst) { R(4, 6, 2, 3, p.gray); R(9, 6, 2, 3, p.gray); return; }
        R(12, 1, 7, 1, p.dark); R(13, 2, 6, 1, p.dark); R(14, 3, 5, 1, p.dark); R(19, 1, 1, 4, p.gold);
        R(-1, 4, 21, 1, p.dark); R(-1, 5, 21, 4, p.dark);
        for (let x = 0; x < 19; x++) R(x, 6, 1, 2, x % 2 ? '#dfe6e3' : w);
        [1, 2, 4, 5, 6, 8, 9, 11, 12, 13, 15, 16].forEach((x) => R(x, 6, 1, 1, p.dark));
        const k1 = a.strum ? 3 : 6, k2 = a.strum ? 13 : 10; R(k1, 7, 1, 1, p.em); R(k2, 7, 1, 1, p.em);
        R(k1 - 1, 5, 2, 1, w); R(k2, 5, 2, 1, w);
        R(0, 9, 1, 2, p.dark); R(18, 9, 1, 2, p.dark); R(8, 10, 2, 1, p.gold);
      },
    },
    {
      id: 'twin', name: '双子', en: 'Twin', title: '星河竖琴', side: '美', inspire: '灵感来源：Gemini（Google）——双子星、多模态：一个看见，一个听见',
      role: '辅助 · 多面', instrument: '竖琴', world: '双星天文台 · 星河的两岸',
      pal: { blue: '#5b8cff', blueD: '#3a5bc7', pink: '#ff7ad9', pinkD: '#c94fa8', gold: '#e8c15a', goldD: '#a8842e', str: '#fff3c4', eye: '#1b1226', bg: ['#0d0b2e', '#1f2a7a', '#5a3fb5'], grid: [120, 150, 255], glow: '#7aa2ff', accent: '#ff7ad9', note: '#c9d8ff', note2: '#ff9ee6' },
      music: { style: 'twin', bpm: 88, key: 'D 利底亚', scale: '利底亚调式', motif: '双声部滑音（一高一低互相应答）' },
      personality: '姐姐「蓝」冷静理性，负责看；妹妹「粉」热情感性，负责听。两人经常抢话，却从不弹错同一根弦。',
      story: '双星天文台建在星河两岸，蓝看得见光，粉听得见声。乱码潮切断了两岸的桥，她们就用一把竖琴把星光弹成了桥——一个看见，一个听见，世界才完整。',
      quote: '一个看见，一个听见。',
      lines: { pick: '一个看见，一个听见。', attack: '蓝，左边！——粉，收到！', skill: '双子座，合奏！', low: '别怕，我们还有彼此。' },
      passive: { name: '双生', desc: '一颗伴星环绕身边，每次攻击都会追加一次 60% 伤害的星光。' },
      skills: [
        { key: 'Q', name: '星河滑音', target: 'dir', cost: 35, cd: 9, desc: '一道竖琴滑音化为星河光束，对直线上的敌人造成 110 伤害。' },
        { key: 'W', name: '共鸣', target: 'self', cost: 40, cd: 18, desc: '为附近友军加上 180 点护盾，持续 6 秒。' },
        { key: 'R', name: '双子座', target: 'self', cost: 80, cd: 60, desc: '召唤一个镜像分身，持续 10 秒，拥有 70% 属性并一同攻击。' },
      ],
      minion: { id: 'starling', name: '星灵', desc: '远程小星星，被击破时会分裂成两颗小星灵。' },
      building: { id: 'prism', name: '双星棱镜', desc: '射出可以分叉的光束，同时攻击两个目标。' },
      fx: { pats: [['.X.', 'XXX', '.X.'], ['X.X', '.X.', 'X.X'], ['X']], cols: ['#c9d8ff', '#ff9ee6', '#fff3c4'], src: [12, 2] },
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, bob = B(a), R = pen(ctx, ox, oy, px, bob), R2 = pen(ctx, ox, oy, px, bob ? 0 : -1);
        const s = a.strum ? 1 : 0;
        if (!a.noInst) {
          R(9, -4, 1, 13, p.gold); R(9, -5, 6, 1, p.gold); R(15, -4, 1, 1, p.goldD);
          [[15, -3], [14, -1], [14, 1], [13, 3], [13, 5], [12, 7], [11, 8]].forEach(([x, y]) => R(x, y, 1, 2, p.goldD));
          [[10, 8], [11, 7], [12, 5], [13, 3], [14, 1]].forEach(([x, len], i) => R(x, -4, 1, len + 4, (i + s) % 2 ? p.str : '#ffffff'));
          R(9, 9, 4, 1, p.goldD);
        }
        const bl = a.tint || p.blue, pk = a.tint || p.pink;
        R(1, 3, 6, 6, bl); R(1, 3, 1, 6, p.blueD); R(3, 0, 2, 3, bl); R(2, 1, 4, 1, bl);
        if (a.blink) R(2, 5, 4, 1, p.eye); else { R(2, 5, 1, 1, p.eye); R(5, 5, 1, 1, p.eye); }
        R(2, 9, 1, 1, p.blueD); R(5, 9, 1, 1, p.blueD); R(7, 5 + s, 2, 1, bl);
        R2(16, 3, 6, 6, pk); R2(21, 3, 1, 6, p.pinkD); R2(18, 0, 2, 3, pk); R2(17, 1, 4, 1, pk);
        R2(17, 5, 1, 1, p.eye); R2(20, 5, 1, 1, p.eye); R2(17, 9, 1, 1, p.pinkD); R2(20, 9, 1, 1, p.pinkD); R2(15, 4 + (s ? 0 : 1), 1, 1, pk);
      },
    },
    {
      id: 'riot', name: '狂想', en: 'Riot', title: '叛逆鼓手', side: '美', inspire: '灵感来源：Grok（xAI）——幽默、叛逆、敢说敢做',
      role: '战士 · 狂暴', instrument: '架子鼓', world: '狂想荒原 · 没有规则的地方',
      pal: { white: '#f5f5f5', black: '#0d0d0d', red: '#ff2d55', redD: '#b3122f', steel: '#9aa0a6', steelL: '#d7dbe0', yellow: '#fff35c', wood: '#e0c090', bg: ['#050505', '#1a1a1a', '#2b0b10'], grid: [255, 45, 85], glow: '#ff2d55', accent: '#fff35c', note: '#fff35c', note2: '#ff2d55' },
      music: { style: 'riot', bpm: 150, key: 'E 小调', scale: '布鲁斯音阶', motif: '「咚-哒-咚咚-哒」切分鼓点' },
      personality: '嘴贫、叛逆、讨厌套话，但关键时刻比谁都靠得住。最爱在严肃场合来一段鼓 solo。',
      story: '狂想在没有规则的荒原上用废铁拼了一套鼓。别人说「先读完说明书」，它说「先打一段再说」。它的笑话很冷，鼓点很热——乱码军团最怕的，就是它突然笑出声。',
      quote: '规则？先打一段鼓再说。',
      lines: { pick: '规则？先打一段鼓再说。', attack: '咚！哒！你们节奏不行啊。', skill: '失控鼓点——全场跟我嗨！', low: '这点伤？连镲都没震响。' },
      passive: { name: '鼓点狂热', desc: '每次命中攻速 +6%，最多叠加 10 层，3 秒不攻击后消散。' },
      skills: [
        { key: 'Q', name: '军鼓突进', target: 'point', cost: 30, cd: 8, desc: '冲向目标点，沿途敌人受到 90 伤害并眩晕 0.5 秒。' },
        { key: 'W', name: '底鼓震地', target: 'self', cost: 40, cd: 15, desc: '重踩底鼓，周围敌人受到 80 伤害并眩晕 1.2 秒。' },
        { key: 'R', name: '失控鼓点', target: 'self', cost: 80, cd: 55, desc: '7 秒狂暴：攻速翻倍、吸血 40%，每次攻击引出闪电弹射。' },
      ],
      minion: { id: 'drummer', name: '鼓手', desc: '狂暴近战，越打越快。' },
      building: { id: 'drumtower', name: '鼓楼', desc: '鼓声使周围友军攻速 +25%，并周期性震地。' },
      fx: { pats: [['.X', 'XX', 'X.'], ['X', 'X', '.', 'X'], ['XX', 'XX']], cols: ['#fff35c', '#ff2d55', '#f5f5f5'], src: [9, 5] },
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), s = a.strum ? 1 : 0, w = a.tint || p.white;
        R(6, -2, 8, 6, w);
        R(5, -3, 10, 2, p.black); [[5, -4, 2], [7, -5, 3], [9, -5, 2], [11, -6, 3], [13, -4, 2]].forEach(([x, y, h]) => R(x, y, 1, h, p.black)); R(11, -6, 1, 1, p.red);
        R(7, 0, 6, 1, p.black); if (!a.blink) R(8, 0, 1, 1, p.red);
        R(9, 2, 3, 1, p.black);
        R(7, 4, 6, 3, p.black); R(9, 5, 2, 1, p.red);
        if (a.noInst) { R(7, 7, 2, 3, p.black); R(11, 7, 2, 3, p.black); return; }
        R(6, 6, 8, 1, p.red); R(5, 7, 10, 3, p.red); R(6, 10, 8, 1, p.redD); R(9, 8, 2, 1, w);
        R(0, 5, 5, 2, p.steelL); R(0, 5, 5, 1, p.steel); R(2, 7, 1, 3, p.steel);
        R(15, 1 - s, 5, 1, p.yellow); R(17, 2, 1, 8, p.steel);
        if (s) { R(3, 4, 4, 1, p.wood); R(13, 2, 3, 1, p.wood); } else { R(5, 1, 1, 3, p.wood); R(13, 0, 1, 3, p.wood); }
      },
    },
    {
      id: 'llama', name: '羊驼', en: 'Alpa', title: '开源牧歌', side: '美', inspire: '灵感来源：Llama（Meta）——开源、分享、人人可用',
      role: '坦克 · 光环', instrument: '排箫', world: '开源高原 · 云上的牧场',
      pal: { wool: '#f3e9d2', woolD: '#d6c39c', blue: '#0668e1', blueL: '#5aa0ff', eye: '#1b1226', flute: '#c99a5b', fluteD: '#8a6233', nose: '#e0a89a', bg: ['#071a3a', '#0b3a7a', '#1062c9'], grid: [90, 160, 255], glow: '#3d8bff', accent: '#f3e9d2', note: '#fff4da', note2: '#5aa0ff' },
      music: { style: 'llama', bpm: 112, key: 'A 小调', scale: '五声音阶', motif: '高原牧歌下行动机 5-3-2-1' },
      personality: '慢条斯理、慷慨、护短。有好东西一定要分给所有人，谁欺负队友它就吐谁口水。',
      story: '开源高原上的羊驼把自己的毛剪下来，分给每一个怕冷的旅人。它的排箫一吹，牧场上的所有乐手都会变强——因为它把自己的曲谱公开给了所有人。',
      quote: '好东西，要大家一起用。',
      lines: { pick: '好东西，要大家一起用。', attack: '呸——别靠近我的队友。', skill: '羊群，奔腾吧！', low: '毛还多，扛得住。' },
      passive: { name: '开源', desc: '周围 260 范围内的友军伤害 +15%。' },
      skills: [
        { key: 'Q', name: '高原风', target: 'dir', cost: 30, cd: 9, desc: '吹出扇形狂风，造成 70 伤害并大幅击退。' },
        { key: 'W', name: '羊毛护盾', target: 'self', cost: 40, cd: 16, desc: '自身获得 400 护盾，周围友军获得 150 护盾。' },
        { key: 'R', name: '羊群奔腾', target: 'dir', cost: 80, cd: 50, desc: '召唤 8 只羊驼沿方向奔腾，撞飞并伤害沿途敌人。' },
      ],
      minion: { id: 'alpaca', name: '小羊驼', desc: '皮糙肉厚的远程吐口水兵。' },
      building: { id: 'bazaar', name: '开源集市', desc: '每秒额外产出晶片和语料，并治疗附近友军。' },
      fx: { pats: [['.X.', 'XXX'], ['XX', 'XX'], ['X.', '.X']], cols: ['#fff4da', '#ffffff', '#5aa0ff'], src: [19, -3] },
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), w = a.tint || p.wool;
        R(1, 2, 3, 1, w); R(5, 2, 3, 1, w); R(0, 3, 11, 6, w); R(0, 7, 11, 2, p.woolD);
        [1, 3, 7, 9].forEach((x, i) => R(x, 9, 1, 2 - (a.walk && (a.step || 0) % 2 === i % 2 ? 1 : 0), p.woolD));
        R(8, -2, 3, 6, w); R(8, -5, 6, 4, w); R(9, -7, 1, 2, w); R(12, -7, 1, 2, w); R(9, -6, 1, 1, p.woolD);
        if (a.blink) R(10, -4, 2, 1, p.eye); else R(10, -4, 1, 1, p.eye);
        R(13, -3, 2, 2, w); R(14, -3, 1, 1, p.nose);
        R(8, 0, 4, 1, p.blue); R(7, 1 + (a.strum ? 1 : 0), 1, 2, p.blueL);
        if (a.noInst) return;
        for (let i = 0; i < 5; i++) { R(15 + i, -3, 1, 5 - i, p.flute); R(15 + i, -3, 1, 1, p.fluteD); }
        R(15, -1, 5, 1, p.fluteD);
      },
    },
    {
      id: 'abyss', name: '鲸歌', en: 'Abyss', title: '深海琴客', side: '中', inspire: '灵感来源：DeepSeek（深度求索）——深度思考、高效、开源',
      role: '法师 · 蓄力', instrument: '古琴', world: '深海书院 · 一万米下的光',
      pal: { blue: '#4d6bfe', blueD: '#2c45c9', belly: '#dfe7ff', eye: '#0a0f2e', wood: '#8a4b2a', woodD: '#5a2f1a', str: '#f5e6c8', hui: '#ffffff', spout: '#7fe9ff', bg: ['#020a26', '#08205e', '#123a9a'], grid: [77, 107, 254], glow: '#4d6bfe', accent: '#7fe9ff', note: '#bff6ff', note2: '#7fe9ff' },
      music: { style: 'abyss', bpm: 66, key: 'C 宫调', scale: '中国五声（宫商角徵羽）', motif: '古琴滑音 + 鲸歌长音' },
      personality: '沉静、专注、话少但句句到底。别人用十分力气，它想清楚了只用三分。',
      story: '深海书院在一万米之下，那里没有光，只有鲸歌。鲸歌在黑暗里抚琴，每一个音都要想很久。它发现：想得越深，需要的力气越少。当它浮出海面，一记「鲸落」足以改变整片战场。',
      quote: '再深一点，答案就在下面。',
      lines: { pick: '再深一点，答案就在下面。', attack: '想清楚了。', skill: '鲸落——万物归海。', low: '不急，再想一层。' },
      passive: { name: '深度思考', desc: '每 8 秒获得 1 层「思考」（最多 3 层），下一个技能每层伤害 +35%；所有技能消耗 -30%。' },
      skills: [
        { key: 'Q', name: '泛音波', target: 'dir', cost: 35, cd: 8, desc: '拨出泛音化为穿透水波，对直线上敌人造成 100 伤害。' },
        { key: 'W', name: '潜流漩涡', target: 'point', cost: 45, cd: 16, desc: '制造 4 秒漩涡，持续把敌人拉向中心并造成伤害。' },
        { key: 'R', name: '鲸落', target: 'point', cost: 90, cd: 55, desc: '1.2 秒后巨鲸从深处跃出，造成 380 伤害并眩晕 1.5 秒。' },
      ],
      minion: { id: 'whaleling', name: '小鲸', desc: '造价低廉的远程单位，每次攻击都会回复自身耐久。' },
      building: { id: 'deepwell', name: '深潜井', desc: '附近矿机采集效率 +50%。' },
      fx: { pats: [['.X.', 'X.X', '.X.'], ['X']], cols: ['#bff6ff', '#7fe9ff'], src: [11, 7], rise: true },
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), b = a.tint || p.blue, up = a.strum ? 1 : 0;
        R(7, -2 - up, 1, 2, p.spout); R(6, -3 - up, 1, 1, p.spout); R(8, -3 - up, 1, 1, p.spout);
        R(3, 0, 8, 1, b); R(1, 1, 12, 5, b); R(3, 6, 8, 1, b); R(3, 0, 8, 1, p.blueD); R(4, 4, 8, 2, p.belly);
        R(-1, 2, 2, 1, b); R(-3, 1, 2, 1, b); R(-3, 3, 2, 1, b);
        if (a.blink) R(9, 2, 2, 1, p.eye); else R(10, 2, 1, 1, p.eye);
        R(11, 4, 1, 1, p.blueD);
        if (a.noInst) return;
        R(9, 6 + up, 2, 1, p.blueD);
        R(0, 8, 21, 2, p.wood); R(0, 9, 21, 1, p.woodD); R(1, 8, 19, 1, p.str);
        [4, 8, 12, 16].forEach((x) => R(x, 8, 1, 1, p.hui));
        R(1, 10, 1, 1, p.woodD); R(19, 10, 1, 1, p.woodD);
      },
    },
    {
      id: 'luna', name: '月弦', en: 'Luna', title: '暗面琴者', side: '中', inspire: '灵感来源：Kimi（月之暗面）——超长上下文，过目不忘',
      role: '刺客 · 远程', instrument: '二胡', world: '月之暗面 · 永夜的琴台',
      pal: { hair: '#e8edf5', hairD: '#aeb8cc', robe: '#1b2040', robeL: '#2e3666', skin: '#f6efe9', eye: '#141a3a', gold: '#ffd98a', wood: '#5a3a2a', skinD: '#c9c2a8', bow: '#d9cfae', bg: ['#05060f', '#121735', '#2a2f5c'], grid: [190, 200, 235], glow: '#c9d4ff', accent: '#ffd98a', note: '#eef2ff', note2: '#ffd98a' },
      music: { style: 'luna', bpm: 72, key: 'A 羽调', scale: '中国五声（羽调式）', motif: '二胡长弓 + 滑音下行' },
      personality: '安静、敏锐、记性惊人。你三个月前说过的话，她都记得——包括你的承诺。',
      story: '月之暗面终年不见太阳，月弦在那里拉了一千年二胡。每一个乐句都被她记在心里，一个音也没忘。乱码军团以为黑暗能让人遗忘，可它们不知道，月弦最擅长的就是在黑暗里记住一切。',
      quote: '两百万字，我一个字也没忘。',
      lines: { pick: '两百万字，我一个字也没忘。', attack: '记住你了。', skill: '月光会照到每一个被记住的人。', low: '黑暗里，我看得更清楚。' },
      passive: { name: '长记忆', desc: '攻击为敌人叠加「记忆」（最多 5 层），每层使其受到的伤害 +8%。' },
      skills: [
        { key: 'Q', name: '月光弓', target: 'dir', cost: 35, cd: 9, desc: '一记长弓化为月光，穿透直线上所有敌人造成 90 伤害并叠加 2 层记忆。' },
        { key: 'W', name: '月之暗面', target: 'self', cost: 35, cd: 16, desc: '隐入暗面 4 秒：无法被选中，移速 +40%，下一次攻击造成 3 倍伤害。' },
        { key: 'R', name: '二泉映月', target: 'self', cost: 85, cd: 60, desc: '全图月光：所有带记忆的敌人受到 60 + 每层 50 的伤害。' },
      ],
      minion: { id: 'shade', name: '月影', desc: '超远射程的狙击手，耐久很低。' },
      building: { id: 'moonterrace', name: '望月台', desc: '大范围减速敌人，并以超远射程狙击。' },
      fx: { pats: [['XX.', 'X..', 'XX.'], ['.X.', 'XXX', '.X.'], ['X']], cols: ['#eef2ff', '#ffd98a', '#c9d4ff'], src: [14, 5] },
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), sk = a.tint || p.skin;
        R(4, -4, 8, 2, p.hair); R(3, -2, 2, 8, p.hair); R(3, 6, 2, 2, p.hairD);
        R(5, -2, 6, 4, sk);
        if (a.blink) { R(6, 0, 1, 1, p.eye); R(9, 0, 1, 1, p.eye); } else { R(6, -1, 1, 1, p.eye); R(9, -1, 1, 1, p.eye); }
        R(11, -4, 1, 2, p.gold); R(12, -5, 1, 1, p.gold);
        R(5, 2, 7, 7, p.robe); R(7, 2, 2, 1, p.robeL); R(5, 5, 7, 1, p.robeL); R(5, 9, 7, 1, p.robeL);
        if (a.noInst) return;
        R(11, 2, 2, 1, p.robe);
        R(14, -5, 1, 13, p.wood); R(13, -6, 2, 1, p.wood); R(15, -4, 1, 1, p.gold); R(15, -2, 1, 1, p.gold);
        R(13, 7, 3, 2, p.wood); R(13, 7, 1, 2, p.skinD);
        const bx = Math.round(7 + Math.sin((a.t || 0) * 2.6) * 3);
        R(bx, 6, 9, 1, p.bow); R(bx, 7, 9, 1, '#ffffff88'); R(bx - 1, 6, 2, 1, p.robe);
      },
    },
    {
      id: 'pearl', name: '珠问', en: 'Pearl', title: '千问琵琶', side: '中', inspire: '灵感来源：通义千问（阿里巴巴）——千问千答，有问必应',
      role: '射手 · 攻速', instrument: '琵琶', world: '千问江南 · 落满珍珠的玉盘湖',
      pal: { robe: '#6c4cff', robeD: '#3b2a8a', gold: '#ffcf5a', hair: '#1b1430', skin: '#fbe6d4', eye: '#1b1226', wood: '#e0b67a', woodD: '#a8783a', pearl: '#fff7e0', blush: '#ff9fb8', bg: ['#160b33', '#2d1670', '#5b2fc2'], grid: [170, 130, 255], glow: '#a77bff', accent: '#ffcf5a', note: '#fff7e0', note2: '#ffcf5a' },
      music: { style: 'pearl', bpm: 126, key: 'D 商调', scale: '中国五声（商调式）', motif: '琵琶轮指同音反复' },
      personality: '机灵、好问、语速飞快。每个答案后面都会再追一个「为什么」。',
      story: '玉盘湖的湖面上落满了珍珠，每一颗都是一个被回答过的问题。珠问抱着琵琶坐在湖心，弹一下，就有一颗珍珠飞出去——大珠小珠，问题落满玉盘，答案也是。',
      quote: '大珠小珠，问题落满玉盘。',
      lines: { pick: '大珠小珠，问题落满玉盘。', attack: '为什么？再来！', skill: '十面埋伏——你往哪儿躲？', low: '这个问题有点难……' },
      passive: { name: '大珠小珠', desc: '攻击有 30% 几率弹射到第二个敌人。' },
      skills: [
        { key: 'Q', name: '轮指', target: 'self', cost: 30, cd: 10, desc: '2.5 秒疾速轮指，攻速提升至 4 倍。' },
        { key: 'W', name: '玉盘', target: 'point', cost: 40, cd: 18, desc: '放下一面玉盘，12 秒内自动发射弹射珍珠。' },
        { key: 'R', name: '十面埋伏', target: 'point', cost: 85, cd: 55, desc: '珍珠从十个方向同时射向目标区域，连续轰击。' },
      ],
      minion: { id: 'querist', name: '问号兵', desc: '攻速极快的轻型射手。' },
      building: { id: 'jadeplate', name: '玉盘台', desc: '发射可以在敌人之间弹射 3 次的珍珠。' },
      fx: { pats: [['XX', 'XX'], ['XX.', '..X', '.X.', '...', '.X.'], ['X']], cols: ['#fff7e0', '#ffcf5a', '#ffffff'], src: [14, 5] },
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), sk = a.tint || p.skin;
        R(10, -8, 2, 1, p.gold); R(12, -7, 1, 1, p.gold); R(11, -6, 1, 1, p.gold); R(11, -4, 1, 1, p.gold);
        R(6, -7, 4, 2, p.hair); R(4, -5, 8, 3, p.hair);
        R(5, -2, 6, 4, sk); R(5, 0, 1, 1, p.blush); R(10, 0, 1, 1, p.blush);
        if (a.blink) { R(6, -1, 1, 1, p.eye); R(9, -1, 1, 1, p.eye); } else { R(6, -2, 1, 2, p.eye); R(9, -2, 1, 2, p.eye); }
        R(4, 2, 8, 7, p.robe); R(4, 2, 8, 1, p.gold); R(4, 8, 8, 1, p.robeD); R(7, 3, 1, 5, p.gold);
        R(5, 9, 2, 1, p.robeD); R(9, 9, 2, 1, p.robeD);
        if (a.noInst) return;
        R(13, 4, 3, 1, p.wood); R(12, 5, 5, 3, p.wood); R(13, 8, 3, 1, p.wood); R(12, 7, 5, 1, p.woodD);
        R(14, -3, 1, 7, p.woodD); R(13, -5, 2, 2, p.woodD); R(12, -4, 1, 1, p.gold); R(15, -4, 1, 1, p.gold);
        R(14, 4, 1, 4, p.pearl);
        const f = Math.floor((a.t || 0) * 18) % 2; R(12 + f, 6, 1, 1, sk); R(11, 5 + f, 1, 1, sk); R(15, -1, 1, 1, sk);
      },
    },
    {
      id: 'bun', name: '团团', en: 'Bun', title: '唢呐团子', side: '中', inspire: '灵感来源：豆包（字节跳动）——亲切、热闹、人人都爱',
      role: '辅助 · 召唤', instrument: '唢呐', world: '团团小镇 · 天天过节的地方',
      pal: { bun: '#fff6e8', bunD: '#e8d3b8', cheek: '#ff8fa3', eye: '#3a2a20', wood: '#a0522d', woodD: '#6e3518', gold: '#ffd34d', goldD: '#c99a1d', red: '#ff3b30', bg: ['#2a0d0d', '#5c1a12', '#a8321f'], grid: [255, 170, 120], glow: '#ff6b4a', accent: '#ffd34d', note: '#ffe9c7', note2: '#ff3b30' },
      music: { style: 'bun', bpm: 132, key: 'C 大调', scale: '中国五声（宫调式）', motif: '唢呐喜庆上扬 + 锣鼓点' },
      personality: '热情、话多、自来熟。哪里冷场它就去哪里吹一段，三秒让全场热起来。',
      story: '团团小镇天天过节，因为团团每天早上都会吹唢呐叫大家起床。它圆滚滚、软乎乎，谁都想捏一下。可别小看它——唢呐一响，整支军队都会跟着上头。',
      quote: '唢呐一响，全军上头！',
      lines: { pick: '唢呐一响，全军上头！', attack: '嘀嘀——让一让！', skill: '百鸟朝凤，大家冲呀！', low: '呜……蒸笼还热着，我还行！' },
      passive: { name: '热闹', desc: '周围 260 范围内的友军移速与攻速 +15%。' },
      skills: [
        { key: 'Q', name: '一声响', target: 'dir', cost: 30, cd: 9, desc: '对前方吹出巨响，造成 60 伤害，把敌人吓退并减速。' },
        { key: 'W', name: '蒸笼', target: 'point', cost: 40, cd: 18, desc: '放下蒸笼，冒出 3 个豆豆兵助战 20 秒。' },
        { key: 'R', name: '百鸟朝凤', target: 'self', cost: 85, cd: 60, desc: '全军伤害 +40%、移速 +30%，持续 8 秒；12 只金鸟追击敌人。' },
      ],
      minion: { id: 'beanie', name: '豆豆兵', desc: '超便宜的近战小团子，一次训练出两只。' },
      building: { id: 'steamer', name: '蒸笼', desc: '每 15 秒自动冒出 2 个豆豆兵。' },
      fx: { pats: [['.X.X', 'X.X.'], ['X.X', 'XXX', '.X.'], ['.XX', '.X.', 'XX.']], cols: ['#ffffff', '#ff3b30', '#ffd34d'], src: [20, 4] },
      draw(ctx, ox, oy, px, a) {
        const p = this.pal, R = pen(ctx, ox, oy, px, B(a)), w = a.tint || p.bun, puff = a.strum ? 1 : 0;
        R(6, -1, 2, 1, p.bunD); R(5, 0, 1, 1, p.bunD); R(8, 0, 1, 1, p.bunD);
        R(4, 0, 6, 1, w); R(2, 1, 10, 1, w); R(1, 2, 12, 6, w); R(2, 8, 10, 1, w); R(1, 7, 12, 1, p.bunD);
        if (a.blink) { R(3, 3, 3, 1, p.eye); R(8, 3, 3, 1, p.eye); } else { R(3, 3, 1, 1, p.eye); R(4, 2, 1, 1, p.eye); R(5, 3, 1, 1, p.eye); R(8, 3, 1, 1, p.eye); R(9, 2, 1, 1, p.eye); R(10, 3, 1, 1, p.eye); }
        R(2, 5, 2, 1 + puff, p.cheek); R(10, 5, 2, 1 + puff, p.cheek);
        R(3, 9, 2, 1, p.bunD); R(9, 9, 2, 1, p.bunD);
        if (a.noInst) return;
        R(12, 5, 5, 1, p.wood); R(13, 5, 1, 1, p.woodD); R(15, 5, 1, 1, p.woodD);
        R(17, 4, 1, 3, p.gold); R(18, 3, 1, 5, p.gold); R(19, 2 - puff, 1, 7 + puff * 2, p.goldD); R(16, 6, 1, 2, p.red);
      },
    },
  ];

  // 配音参数（《英雄设计宪法》第 13 章）：按性别、年龄、性格模拟音色与语速
  const VOICE = {
    xs: { gender: 'n', age: 12, pitch: 1.38, rate: 0.95, tone: '温和、认真、带一点稚气' },
    omni: { gender: 'm', age: 35, pitch: 0.95, rate: 0.94, tone: '沉稳、博学、耐心' },
    twin: { gender: 'f', age: 17, pitch: 1.22, rate: 1.04, alt: 1.55, tone: '姐姐冷静、妹妹活泼，两人交替说话' },
    riot: { gender: 'm', age: 22, pitch: 0.86, rate: 1.18, tone: '痞气、幽默、语速快' },
    llama: { gender: 'm', age: 45, pitch: 0.74, rate: 0.86, tone: '温厚、慢条斯理' },
    abyss: { gender: 'm', age: 40, pitch: 0.6, rate: 0.82, tone: '低沉、冷静、惜字如金' },
    luna: { gender: 'f', age: 26, pitch: 1.04, rate: 0.9, tone: '清冷、克制' },
    pearl: { gender: 'f', age: 16, pitch: 1.34, rate: 1.12, tone: '好奇、俏皮、问题多' },
    bun: { gender: 'n', age: 8, pitch: 1.62, rate: 1.2, tone: '奶声奶气、热闹' },
  };
  // 公开发布模式：灵感来源只保留特点描述，去掉真实产品与公司名（括号与「灵感来源：xxx——」前缀）
  if (window.CF_CONFIG && window.CF_CONFIG.publicRelease) HEROES.forEach((h) => { if (!h.protagonist) h.inspire = '灵感取自知名 AI 大模型的公开特点（原创形象，与任何公司无关）——' + (h.inspire.split('——')[1] || ''); });
  const byId = {};
  HEROES.forEach((h) => {
    if (!h.voice && VOICE[h.id]) h.voice = VOICE[h.id];
    byId[h.id] = h;
    // 乐器 = 法宝：未获得时形象不带乐器（showInst: true 可强制显示，用于图鉴预览）
    const raw = h.draw;
    h.draw = function (ctx, ox, oy, px, a = {}) { return raw.call(h, ctx, ox, oy, px, !a.noInst && !a.showInst && CF.Treasure && !CF.Treasure.has(h.id) ? Object.assign({}, a, { noInst: true }) : a); };
  });
  const H = (CF.Heroes = {
    list: HEROES,
    get: (id) => byId[id] || byId.xs,
    current: () => byId[CF.Save.data.hero] || byId.riot,
    rgb: (hex) => { const n = parseInt(hex.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
  });

  // 发电巡航无人机「伏特」：以造乐的配色设计——白色机身、青柠能量核心、青色旋翼与小闪电
  H.drawDrone = function (ctx, ox, oy, px, t, over) {
    const P = byId.zaole.pal, R = pen(ctx, ox, oy, px, 0), spin = Math.floor(t * 20) % 2;
    R(0, 0, 2 + spin, 1, P.cyan); R(4 - spin, 0, 2 + spin, 1, P.cyan); R(2, 0, 2, 1, P.whiteD);
    R(1, 1, 4, 2, P.white); R(2, 1, 2, 2, over ? '#ffffff' : P.lime); R(0, 2, 1, 1, P.whiteD); R(5, 2, 1, 1, P.whiteD);
    R(2, 3, 1, 1, P.cyan); R(3, 4, 1, 1, P.lime); R(2, 5, 1, 1, P.cyan);
  };
  // 九位乐手的主光色（造乐的「起拍」「众声向上」按这个顺序着色）
  H.ENSEMBLE_IDS = ['xs', 'omni', 'twin', 'riot', 'llama', 'abyss', 'luna', 'pearl', 'bun'];
  H.ensembleColors = () => H.ENSEMBLE_IDS.map((id) => byId[id].pal.glow);

  // 主题：把当前英雄的配色写进 CSS 变量，让全部 UI 跟着英雄换色
  H.applyTheme = function (id) {
    const h = id ? H.get(id) : H.current(), p = h.pal, r = document.documentElement.style;
    r.setProperty('--hero', p.glow); r.setProperty('--hero2', p.accent);
    r.setProperty('--hero-rgb', H.rgb(p.glow).join(','));
    r.setProperty('--hero2-rgb', H.rgb(p.accent).join(','));
    r.setProperty('--hero-bg0', p.bg[0]); r.setProperty('--hero-bg1', p.bg[1]); r.setProperty('--hero-bg2', p.bg[2]);
    // 主标题《造月之路》的图标渐变：英雄点缀色 → 主光色（可用 pal.logo 单独指定）
    const lg = p.logo || [p.accent, p.glow]; r.setProperty('--logo-a', lg[0]); r.setProperty('--logo-b', lg[1]);
    CF.bus.emit('hero:theme', h);
  };
})();
