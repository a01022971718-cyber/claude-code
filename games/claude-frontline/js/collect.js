/* 收藏与道具：发电厂图鉴、法宝锦囊、赐福法宝碎片（v1）
 * - 发电厂遵循《英雄设计宪法》第 14 章：只有像素形象 + 文案介绍，没有战斗能力；形象尺寸是英雄的 0.618 倍（13 × 11 格）。
 * - 第二章掉落「火力发电厂」碎片（参考 1882 年的珍珠街电站），第三章掉落「核能发电厂」碎片（参考 1954 年的奥布宁斯克核电站），各 10 片解锁。
 * - 第六章掉落「法宝锦囊」：打开有 35% 概率得到「赐福法宝碎片」，集齐 10 片可以为一位已拥有的英雄赐福一件法宝。 */
(function () {
  const CF = window.CF;
  const NEED = 10;
  const S = () => { const d = CF.Save.data; if (!d.collect) d.collect = { frags: {}, owned: [], pouch: 0, bless: 0 }; return d.collect; };
  const pen = (ctx, ox, oy, px) => (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(ox + x * px), Math.round(oy + y * px), Math.ceil(w * px), Math.ceil(h * px)); };
  const grid = (R, rows, map, y0 = 0) => rows.forEach((row, j) => { for (let x = 0; x < row.length; x++) { const c = row[x]; if (c !== '.' && map[c]) R(x, y0 + j, 1, 1, map[c]); } });

  const PLANTS = {
    plant_thermal: {
      name: '珍珠街电站', en: 'Pearl Street Station', kind: '火力发电厂', era: '1882 · 美国纽约', chapter: 2,
      pal: { K: '#2a1a14', B: '#a8452e', b: '#7a2e1e', R: '#8a3a26', Y: '#ffd27a', D: '#4a2a1a', G: '#2b2b2b', g: '#4a4a4a' },
      intro: '1882 年 9 月 4 日，爱迪生的公司在纽约曼哈顿的珍珠街启用了这座电站——世界上最早的商用中心发电站之一。它用燃煤锅炉产生蒸汽，带动蒸汽机和绰号「巨无霸（Jumbo）」的直流发电机，通过埋在街道下的铜线，给曼哈顿下城最初的几十位用户送去约 110 伏的直流电。',
      how: '火力发电 = 烧煤 → 把水烧成蒸汽 → 蒸汽推动机器旋转 → 线圈在磁场里旋转、切割磁感线 → 产生电流（法拉第电磁感应）。',
      fact: '它输出的是直流电。后来交流电因为方便用变压器升压、远距离输送，成为电网的主流——这就是历史上著名的「电流之战」。',
      draw(ctx, ox, oy, px, a = {}) {
        const R = pen(ctx, ox, oy, px), P = this.pal, t = a.t || 0, lit = a.beat > 0.5 ? '#fff1b8' : P.Y;
        grid(R, ['..KK....KK...', '..RR....RR...', '..RR....RR...', 'KKRRKKKKRRKKK', 'KBBBBBBBBBBBK', 'KBYBBYBBYBBYK', 'KBbBBbBBbBBbK', 'KBYBBYBBYBBYK', 'KBBBBDDDBBBBK', 'KBBBBDDDBBBBK', 'GGgGGGgGGGgGG'], { K: P.K, B: P.B, b: P.b, R: P.R, Y: lit, D: P.D, G: P.G, g: P.g });
        // 两根烟囱冒出的烟（向上飘散）
        for (let i = 0; i < 3; i++) { const k = (t * 0.8 + i / 3) % 1; ctx.globalAlpha = 0.6 * (1 - k); R(2 + Math.round(Math.sin(t + i) * 0.6), -1 - k * 4, 2, 1, '#c8c0b8'); R(8 + Math.round(Math.cos(t + i) * 0.6), -1 - k * 4, 2, 1, '#c8c0b8'); }
        ctx.globalAlpha = 1;
      },
    },
    plant_nuclear: {
      name: '奥布宁斯克核电站', en: 'Obninsk', kind: '核能发电厂', era: '1954 · 苏联奥布宁斯克', chapter: 3,
      pal: { W: '#e8e2d0', w: '#b8b09c', S: '#c9c4b8', s: '#8f8a80', C: '#4ef0ff', A: '#9ffbff', D: '#5a5448', P: '#3e5a3a', K: '#2a2620' },
      intro: '1954 年 6 月，苏联的奥布宁斯克核电站开始向电网送电，成为世界上第一座并网发电的核电站。它的反应堆叫 AM-1（意为「和平原子」），电功率约 5 兆瓦，一直运行到 2002 年。',
      how: '核能发电 = 铀原子核裂变放出热量 → 把水烧成蒸汽 → 推动汽轮机 → 带动发电机。和火电相比，只是「烧水」的方式不同；一小块铀燃料就能放出相当于大量煤炭的能量。',
      fact: '核电运行时几乎不排放二氧化碳，但必须解决安全运行和核废料处理的问题——这是工程师至今仍在攻克的课题。',
      draw(ctx, ox, oy, px, a = {}) {
        const R = pen(ctx, ox, oy, px), P = this.pal, glow = a.beat > 0.5 ? '#ffffff' : P.A;
        grid(R, ['..........S..', '..........S..', '..........s..', '..........S..', '.KKKKKKKK.S..', '.WCCWWCCW.S..', 'KWWWWWWWWWSWK', 'WwwWWAAWWwwWW', 'WwwWWAAWWwwWW', 'WWWWWDDWWWWWW', 'PPPPPPPPPPPPP'], { S: P.S, s: P.s, K: P.K, W: P.W, w: P.w, C: P.C, A: glow, D: P.D, P: P.P });
        // 反应堆的切连科夫蓝光，随节拍呼吸
        ctx.globalAlpha = 0.25 + 0.25 * (a.beat || 0); R(4, 6, 5, 4, P.C); ctx.globalAlpha = 1;
      },
    },
  };

  const C = (CF.Collect = {
    PLANTS, NEED,
    frags: (id) => S().frags[id] || 0,
    owns: (id) => S().owned.includes(id),
    pouches: () => S().pouch,
    bless: () => S().bless,
    // 发电厂碎片：集齐 10 片解锁图鉴；已解锁后多出的碎片转化为晶片
    addFrag(id, n) {
      const s = S(), P = PLANTS[id];
      if (s.owned.includes(id)) { CF.City.add({ chip: 40 * n }); return `${P.name} 碎片 ×${n}（已收藏，转化为晶片 ${40 * n}）`; }
      s.frags[id] = (s.frags[id] || 0) + n;
      if (s.frags[id] >= NEED) { s.owned.push(id); setTimeout(() => { CF.Audio.sfx('unlock'); CF.toast(`收藏解锁：${P.kind}「${P.name}」——去英雄页的「发电厂图鉴」看看`, 'gold', 3600); }, 600); }
      CF.Save.save();
      return `${P.name} 碎片 ×${n}（${Math.min(NEED, s.frags[id])}/${NEED}）`;
    },
    addPouch(n) { S().pouch += n; CF.Save.save(); },
    addBless(n) { S().bless += n; CF.Save.save(); },
    // 打开法宝锦囊：35% 赐福法宝碎片（其中 30% 为 2 片），否则为补给
    openPouch() {
      const s = S(); if (s.pouch <= 0) return null;
      s.pouch--; let txt;
      if (Math.random() < 0.35) { const n = Math.random() < 0.3 ? 2 : 1; s.bless += n; txt = `赐福法宝碎片 ×${n}（${s.bless}/${NEED}）`; }
      else { const r = CF.pick([{ chip: 300 }, { corp: 200 }, { comp: 80 }]); CF.City.add(r); const k = Object.keys(r)[0]; txt = `${{ chip: '晶片', corp: '语料', comp: '算力' }[k]} ×${r[k]}`; }
      CF.Save.save(); CF.Audio.sfx('unlock');
      return txt;
    },
    // 用 10 片赐福法宝碎片为一位英雄赐福法宝
    redeem(heroId) {
      const s = S(); if (s.bless < NEED || CF.Treasure.has(heroId) || !CF.Roster.ownsReal(heroId)) return false;
      s.bless -= NEED; CF.Save.save(); CF.Treasure.grant(heroId); return true;
    },
  });
  // 发电厂图鉴（英雄页底部）
  C.renderPlants = function (host) {
    const box = CF.h('<div><div class="sec-title">发电厂图鉴 · 能源的历史</div><p class="small muted" style="margin-bottom:10px;line-height:1.7">发电厂只有形象和介绍，不参与战斗；形象是英雄的 0.618 倍。第二章掉落火力发电厂碎片，第三章掉落核能发电厂碎片，各 10 片解锁。</p><div class="plant-grid"></div></div>');
    const grid2 = box.querySelector('.plant-grid');
    Object.entries(PLANTS).forEach(([id, P]) => {
      const own = C.owns(id) || CF.P.trial();
      const el = CF.h(`<div class="plant ${own ? '' : 'locked'}"><canvas width="168" height="120"></canvas><div class="pb"><div class="t-tag">${P.kind} · ${P.era}</div><b>${P.name}</b><span class="small muted">${P.en}</span>${own ? `<p>${P.intro}</p><p class="small"><b>原理：</b>${P.how}</p><p class="small muted">${P.fact}</p>` : `<p class="small">第${['', '一', '二', '三'][P.chapter]}章章节掉落碎片：<b class="t-num">${Math.min(NEED, C.frags(id))}/${NEED}</b></p>`}</div></div>`);
      const cv = el.querySelector('canvas'), x = cv.getContext('2d'); let raf2 = 0;
      const loop = () => { if (!cv.isConnected) return cancelAnimationFrame(raf2); x.clearRect(0, 0, 168, 120); P.draw(x, 32, 28, 8, { t: performance.now() / 1000, beat: CF.PixelFX.beat() }); raf2 = requestAnimationFrame(loop); };
      loop();
      grid2.appendChild(el);
    });
    host.appendChild(box);
  };
})();
