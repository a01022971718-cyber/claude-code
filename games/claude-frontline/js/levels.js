/* 关卡：5 个剧情关（次级关，每关 3 波）+ 遭遇战生成器。章节、小关、组队副本见 js/chapters.js */
(function () {
  const CF = window.CF;

  // 通用波次生成（终局与遭遇战）
  function genWave(n, mul = 1, air = 0.3) {
    const u = [['bug', Math.round((6 + n * 2.2) * mul)], ['noise', Math.round((2 + n * 1.1) * mul)]];
    if (n >= 3) u.push(['titan', Math.floor((n / 3) * mul)]);
    if (n >= 2) u.push(['bat', Math.round(n * air * 3 * mul)]);
    return { units: u.filter((x) => x[1] > 0), tag: n % 5 === 0 ? '精英波次' : '' };
  }

  const LEVELS = [
    {
      id: 'L1', no: '01', name: '第一行代码', learn: 'AI 编程入门',
      brief: '我们的主脑刚刚上线，乱码军团正从右侧数据断崖外涌来。先学会最基础的事：采集资源、建造防御、守住阵地。就像写下第一行代码——简单，但一切从这里开始。',
      tip: '点击金色晶片矿就能建矿机；长按（电脑右键）峡口空地建炮塔。点右下角技能按钮释放英雄技能。',
      w: 2000, h: 1300, core: [300, 650], hero: [420, 650],
      cliffs: [[1100, 0, 120, 430], [1100, 700, 120, 600], [1500, 200, 80, 200], [1500, 900, 80, 250]],
      nodes: [['chip', 540, 470], ['chip', 540, 830], ['chip', 860, 650], ['corp', 380, 960], ['corp', 700, 260]],
      spawns: [[1960, 300], [1960, 1000]],
      first: 50, gap: 40,
      // 难度宪法：前两波只占第 3 波的约 25% / 50%，先让玩家学会操作
      waves: [
        { units: [['bug', 3]] },
        { units: [['bug', 5], ['noise', 1]] },
        { units: [['bug', 9], ['noise', 3], ['titan', 1]], tag: '幻觉巨像' },
      ],
      objectives: [
        { text: '建造 2 座矿机', test: (g) => g.count('miner', true) >= 2 },
        { text: '建造 1 座炮塔', test: (g) => g.count('turret', true) >= 1 },
        { text: '守住全部 3 波进攻', test: (g) => g.wavesCleared() },
      ],
      win: (g) => g.wavesCleared(),
      stars: [['获胜', () => true], ['主脑耐久 ≥ 70%', (g) => g.coreHpPct() >= 0.7], ['6 分钟内获胜', (g) => g.time <= 360]],
      script: [
        [1, 'HERO', '主脑上线。我是 {hero}——今天我们一起写下第一行代码。'],
        [5, 'HERO', '点一下金色的晶片矿，就能在上面建矿机。资源是一切的基础。'],
        [16, '侦察Agent', '右侧断崖外检测到乱码信号。建议在峡口放一座炮塔（按 2）。'],
        [30, 'HERO', '右下角是我的技能。敌人扎堆的时候，给他们来一段！'],
      ],
    },
    {
      id: 'L2', no: '02', name: '守住上下文', learn: '大模型 · 上下文窗口',
      brief: '大模型只能「看到」上下文窗口里的内容。三个上下文节点保存着关键记忆，「遗忘者」会专门吞噬它们。至少守住一个节点，记忆就不会丢失。',
      tip: 'Agent 工坊训练编码 Agent，屏障可以把敌人引离节点。修复站能修复节点。',
      w: 2400, h: 1500, core: [300, 750], hero: [460, 750],
      cliffs: [[1300, 0, 140, 500], [1300, 700, 140, 180], [1300, 1080, 140, 420], [1750, 300, 100, 250], [1750, 950, 100, 250]],
      nodes: [['chip', 520, 560], ['chip', 520, 940], ['chip', 1050, 300], ['corp', 650, 1260], ['corp', 1060, 1200], ['corp', 360, 430]],
      ctx: [[820, 450], [920, 750], [820, 1050]],
      prebuilt: [['turret', 760, 600], ['turret', 760, 900]], // 难度宪法 §4：剧情关的「新机制」第一次出现时，先送一点防御
      spawns: [[2360, 400], [2360, 1100], [2360, 750]],
      first: 60, gap: 55,
      waves: [
        { units: [['bug', 4]] },
        { units: [['bug', 6], ['noise', 2]] },
        { units: [['bug', 10], ['noise', 4], ['bat', 3]], boss: 'forget', bossHp: 0.45, tag: 'Boss · 遗忘者（虚弱）' },
      ],
      objectives: [
        { text: '守住 3 波进攻', test: (g) => g.wavesCleared() },
        { text: '至少 1 个上下文节点存活', test: (g) => g.count('ctx') >= 1, keep: true },
        { text: '击败遗忘者', test: (g) => g.bossKilled('forget') },
      ],
      lose: (g) => g.count('ctx') === 0,
      loseText: '所有上下文节点都被遗忘了。',
      win: (g) => g.wavesCleared(),
      stars: [['获胜', () => true], ['3 个上下文节点全部存活', (g) => g.count('ctx') >= 3], ['主脑耐久 ≥ 60%', (g) => g.coreHpPct() >= 0.6]],
      script: [
        [1, 'HERO', '上下文窗口就是模型的「工作记忆」。守住这三个节点——侦察 Agent 已经在节点旁放了两座炮塔。'],
        [8, '侦察Agent', '情报：第 3 波会出现「遗忘者」，它只盯着上下文节点。'],
      ],
    },
    {
      id: 'L3', no: '03', name: '原型机护送', learn: '具身智能 · 机器人',
      brief: '我们的第一台具身智能原型机要前往右侧的发射台。它只有在友军护送（附近有我方单位）时才会前进。沿途的噪声塔和伏击会威胁它。',
      tip: '把军队放在原型机前方开路。原型机受损可以用修复站或治疗型技能修复。',
      w: 3000, h: 1400, core: [260, 700], hero: [420, 620],
      cliffs: [[620, 0, 180, 440], [620, 960, 180, 440], [1100, 0, 900, 220], [1100, 600, 900, 800], [2300, 0, 220, 650], [2300, 1150, 220, 250]],
      nodes: [['chip', 400, 420], ['chip', 400, 980], ['corp', 200, 420], ['corp', 960, 1150], ['chip', 960, 300], ['corp', 2150, 1250]],
      proto: [430, 760], route: [[900, 700], [1300, 410], [1850, 410], [2200, 900], [2760, 900]],
      towers: [[1500, 300], [1950, 520], [2450, 1050], [2620, 760]],
      spawns: [[2960, 300], [2960, 1300]],
      ambush: [[1650, 470, 2], [2100, 760, 3], [2650, 1100, 4]],
      first: 45, gap: 45,
      waves: [
        { units: [['bug', 4]] },
        { units: [['bug', 6], ['noise', 2]] },
        { units: [['bug', 10], ['noise', 4], ['titan', 1], ['bat', 3]], tag: '最后的拦截' },
      ],
      waveTarget: 'proto',
      objectives: [
        { text: '护送原型机到发射台', test: (g) => g.protoArrived },
        { text: '原型机存活', test: (g) => g.count('proto') > 0, keep: true },
      ],
      lose: (g) => g.count('proto') === 0,
      loseText: '原型机被摧毁了。',
      win: (g) => g.protoArrived,
      stars: [['获胜', () => true], ['原型机耐久 ≥ 50%', (g) => g.protoHpPct() >= 0.5], ['4 分钟内到达', (g) => g.time <= 240]],
      script: [
        [1, 'HERO', '原型机会用激光雷达和 SLAM 规划路线，但它需要我们护送。'],
        [6, '侦察Agent', '前方有噪声塔。让编码 Agent 先清掉它们。'],
      ],
    },
    {
      id: 'L4', no: '04', name: '制空权', learn: '航空航天 · 飞控',
      brief: '乱码军团派出了空军。这一关地面工坊被干扰无法生产，只能依靠无人机空港。第 3 波，「过拟合空母」会带着蝠群来袭——它记住了所有旧战术，却应付不了新变化。',
      tip: '拦截无人机克制空中目标，轰炸无人机清理地面。炮塔也能对空。',
      w: 2400, h: 1500, core: [350, 750], hero: [480, 760],
      cliffs: [[1200, 200, 160, 350], [1200, 950, 160, 350], [1800, 600, 120, 300]],
      nodes: [['chip', 560, 520], ['chip', 560, 980], ['corp', 650, 750], ['chip', 300, 300], ['corp', 300, 1200]],
      prebuilt: [['port', 520, 750]], startUnits: [['interceptor', 600, 700], ['interceptor', 600, 800]],
      spawns: [[2360, 300], [2360, 1200], [1500, 40], [1500, 1460]],
      noGround: true,
      first: 45, gap: 40,
      waves: [
        { units: [['bat', 4]] },
        { units: [['bat', 6], ['noise', 2]] },
        { units: [['bat', 12], ['bug', 6]], boss: 'carrier', bossHp: 0.75, tag: '空军首领' },
      ],
      objectives: [
        { text: '守住 3 波空袭', test: (g) => g.wavesCleared() },
        { text: '击落过拟合空母', test: (g) => g.bossKilled('carrier') },
      ],
      win: (g) => g.wavesCleared() && g.bossKilled('carrier'),
      stars: [['获胜', () => true], ['主脑耐久 ≥ 60%', (g) => g.coreHpPct() >= 0.6], ['无人机损失 ≤ 10', (g) => g.lostAir <= 10]],
      script: [
        [1, 'HERO', '四旋翼靠四个电机的转速差控制姿态——你在 PID 实验里调的就是它。'],
        [10, '侦察Agent', '雷达显示空中目标密集。多造拦截无人机。'],
      ],
    },
    {
      id: 'L5', no: '05', name: '终局决战', learn: '企业家 · 第一性原理',
      brief: '乱码主脑就在右侧。顶住它的 3 波进攻后全力反推；当它的耐久降到一半，「熵之王」会现身。把你学到的一切用上：经济、科技、兵种配合、技能时机。',
      tip: '先稳住经济再推进。「推进主脑」（G）让全军攻击移动到敌方主脑。',
      w: 3000, h: 1800, core: [300, 900], hero: [460, 900],
      cliffs: [[1000, 300, 200, 450], [1000, 1050, 200, 450], [1800, 450, 200, 300], [1800, 1050, 200, 300], [2300, 0, 120, 300], [2300, 1500, 120, 300]],
      nodes: [['chip', 520, 680], ['chip', 520, 1120], ['corp', 600, 900], ['chip', 1500, 900], ['corp', 1500, 300], ['corp', 1500, 1500], ['chip', 300, 300], ['chip', 300, 1500]],
      gcore: [2700, 900], towers: [[2450, 650], [2450, 1150], [2200, 900], [2600, 400], [2600, 1400]],
      spawns: 'gcore', first: 55, gap: 45,
      waves: [
        { units: [['bug', 6], ['noise', 2]] },
        { units: [['bug', 8], ['noise', 4], ['bat', 3]] },
        { units: [['bug', 12], ['noise', 6], ['titan', 2], ['bat', 6]], tag: '总攻' },
      ],
      objectives: [
        { text: '摧毁乱码主脑', test: (g) => g.foeCoreDead() },
        { text: '击败熵之王（主脑半血时出现）', test: (g) => g.bossKilled('entropy') },
      ],
      bossAtHalf: 'entropy',
      win: (g) => g.foeCoreDead() && g.bossKilled('entropy'),
      stars: [['获胜', () => true], ['15 分钟内获胜', (g) => g.time <= 900], ['主脑耐久 ≥ 50%', (g) => g.coreHpPct() >= 0.5]],
      script: [
        [1, 'HERO', '第一性原理：别问「别人怎么打」，问「胜利最少需要什么」。'],
        [12, '侦察Agent', '乱码主脑周围有噪声塔，重构 Agent 和轰炸无人机适合攻坚。'],
      ],
    },
  ];

  const DIFF = {
    easy: { name: '简单', mul: 0.7, hp: 0.75, gap: 52, first: 75 },
    normal: { name: '普通', mul: 1, hp: 1, gap: 42, first: 60 },
    hard: { name: '困难', mul: 1.35, hp: 1.3, gap: 34, first: 50 },
  };
  function skirmish(diff) {
    const d = DIFF[diff], seed = CF.randi(1, 1e6), rnd = CF.rng(seed);
    const W = 2800, H = 1700;
    const cliffs = [];
    for (let i = 0; i < 9; i++) {
      const w = 100 + rnd() * 220, h = 120 + rnd() * 380, x = 750 + rnd() * (W - 1600), y = rnd() * (H - h);
      cliffs.push([Math.round(x), Math.round(y), Math.round(w), Math.round(h)]);
    }
    const nodes = [['chip', 500, 600], ['chip', 500, 1100], ['corp', 620, 850], ['chip', 300, 260], ['corp', 300, 1440]];
    for (let i = 0; i < 4; i++) nodes.push([i % 2 ? 'corp' : 'chip', Math.round(1100 + rnd() * 900), Math.round(200 + rnd() * 1300)]);
    return {
      id: 'SK_' + diff, no: 'SK', name: '遭遇战 · ' + d.name, learn: '综合运用', skirmish: diff,
      brief: `摧毁乱码主脑即可获胜。敌军会越来越强（难度：${d.name}）。`, tip: '经济、防守、反击。',
      w: W, h: H, core: [300, 850], hero: [460, 850], cliffs, nodes,
      gcore: [W - 280, 850], towers: [[W - 520, 600], [W - 520, 1100]].concat(diff === 'hard' ? [[W - 760, 850]] : []),
      spawns: 'gcore', first: d.first, gap: d.gap, endless: true, mul: d.mul, hpMul: d.hp,
      objectives: [{ text: '摧毁乱码主脑', test: (g) => g.foeCoreDead() }],
      win: (g) => g.foeCoreDead(),
      stars: [['获胜', () => true], ['12 分钟内获胜', (g) => g.time <= 720], ['主脑耐久 ≥ 60%', (g) => g.coreHpPct() >= 0.6]],
      script: [[1, 'HERO', '遭遇战开始。祝好运，指挥官。']],
    };
  }

  CF.Levels = { LEVELS, DIFF, skirmish, genWave, get: (id) => LEVELS.find((l) => l.id === id) };
})();
