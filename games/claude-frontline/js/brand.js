/* X-S 品牌：标志与字标
 * 寓意：X = 未知（方程里的未知数）与新星（四芒星转 45° 即为 X）；
 *       S = 向上的 S 曲线（Sigmoid 学习曲线 / 火箭爬升轨迹）；
 *       色彩 = 紫夜（未知）→ 破晓橙金（新生）+ 探索青（探索）。规则见 art/01-typography-constitution.md */
(function () {
  const CF = window.CF;
  let uid = 0;
  function emblem() {
    const id = 'xs' + uid++;
    return `<svg class="wm-mark" viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="${id}d" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a45"/><stop offset=".6" stop-color="#ffb14a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
        <linearGradient id="${id}t" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#4ef0ff" stop-opacity="0"/><stop offset=".55" stop-color="#4ef0ff" stop-opacity=".9"/><stop offset="1" stop-color="#e6fdff"/></linearGradient>
      </defs>
      <path d="M5 43 C 19 43, 13 27, 24 24 S 30 7, 43 5" fill="none" stroke="url(#${id}t)" stroke-width="3.2" stroke-linecap="round"/>
      <g class="star"><path d="M24 7 Q26.2 21.8 41 24 Q26.2 26.2 24 41 Q21.8 26.2 7 24 Q21.8 21.8 24 7 Z" transform="rotate(45 24 24)" fill="url(#${id}d)"/>
      <circle cx="24" cy="24" r="3" fill="#fff6e0"/></g>
      <circle cx="43" cy="5" r="2.6" fill="#e6fdff"/>
    </svg>`;
  }
  // 字标：标志 + 拉丁品牌字（破晓渐变）+ 中文（米白），规则「双色、粗重、标志先行」
  function wordmark(cjk = '造月之路', opts = {}) {
    return `<span class="wm ${opts.shadow === false ? '' : 'wm-shadow'}">${emblem()}<span class="wm-latin">X-S</span>${cjk ? `<span class="wm-cjk">${cjk}</span>` : ''}</span>`;
  }
  // 逐字上升动画（「向上」）
  function rise(text, step = 40) {
    return `<span class="t-rise">${[...text].map((ch, i) => `<span style="animation-delay:${i * step}ms">${ch === ' ' ? '&nbsp;' : CF.esc(ch)}</span>`).join('')}</span>`;
  }
  /* 主标题《造月之路》（字体宪法第 13 章 v1.3）：采用主创提供的设计稿——左边是图标，右边是标题字。
   * 图标 = 音符（符头 + 符杆 + 旗）× 月牙 × 代码括号 < > × 一条 S 形的路：「造月之路」。
   * 颜色随主英雄切换（《游戏界面视觉宪法》第 2 章）：图标渐变 = 英雄点缀色 → 主光色（--logo-a → --logo-b），
   * 文字始终米白；挤出厚度用英雄背景色；辉光、火花、图标律动跟着节拍 --beat。 */
  function keyLogo(opts = {}) {
    const L = CF.LOGO;
    if (!L) return wordmark();
    const id = 'kl' + uid++, I = L.icon, T = L.text;
    const st = 1000 / (T.b[3] - T.b[1]), si = 1550 / (I.b[3] - I.b[1]);
    const iw = (I.b[2] - I.b[0]) * si, gap = 170, tx = iw + gap, ty = 815 - 500, W = tx + (T.b[2] - T.b[0]) * st, H = 1550;
    // 路径只写一次（defs），其余用 <use> 引用，避免 SVG 体积膨胀
    const icon = (fill, dy = 0) => `<use href="#${id}I" fill="${fill}" transform="translate(${(-I.b[0] * si).toFixed(1)} ${(-I.b[1] * si + dy).toFixed(1)}) scale(${si.toFixed(4)})"/>`;
    const text = (fill, dy = 0) => `<use href="#${id}T" fill="${fill}" transform="translate(${(tx - T.b[0] * st).toFixed(1)} ${(ty - T.b[1] * st + dy).toFixed(1)}) scale(${st.toFixed(4)})"/>`;
    const D = 11, ext = [];
    ['var(--hero-bg2,#4a2fa0)', 'var(--hero-bg1,#33207a)', 'var(--hero-bg1,#33207a)', 'var(--hero-bg0,#22144c)', 'var(--hero-bg0,#22144c)'].forEach((c, k) => ext.unshift(icon(c, (k + 1) * D) + text(c, (k + 1) * D)));
    const sparks = [[iw * 0.92, -40, 46, 'a', 0], [iw * 0.2, 120, 34, 'b', 1.3], [tx + 900, 40, 30, 'a', 2.1], [tx + 2400, 10, 38, 'b', 0.7], [W - 200, 160, 30, 'a', 1.8], [tx + 3600, 1380, 26, 'b', 2.6]].map(([x, y, z, c, dl]) => `<rect class="kl-px" x="${x.toFixed(0)}" y="${y}" width="${z}" height="${z}" fill="var(--logo-${c},#d4ff1e)" style="animation-delay:${dl}s"/>`).join('');
    const vb = `-120 -120 ${(W + 240).toFixed(0)} ${H + 300}`;
    return `<svg class="kl" viewBox="${vb}" role="img" aria-label="造月之路">
      <defs>
        <path id="${id}I" d="${I.d}" fill-rule="evenodd"/><path id="${id}T" d="${T.d}" fill-rule="evenodd"/>
        <linearGradient id="${id}i" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}"><stop offset=".08" style="stop-color:var(--logo-a,#d4ff1e)"/><stop offset=".88" style="stop-color:var(--logo-b,#00f0ff)"/></linearGradient>
        <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <radialGradient id="${id}g" cx=".5" cy=".5" r=".5"><stop offset="0" style="stop-color:var(--logo-b,#00f0ff)" stop-opacity=".42"/><stop offset="1" style="stop-color:var(--logo-b,#00f0ff)" stop-opacity="0"/></radialGradient>
        <clipPath id="${id}c">${icon('#fff')}</clipPath>
      </defs>
      <ellipse class="kl-glow" cx="${(iw / 2).toFixed(0)}" cy="${H / 2}" rx="${(iw * 1.1).toFixed(0)}" ry="${H * 0.75}" fill="url(#${id}g)"/>
      ${sparks}
      ${ext.join('')}
      <g class="kl-spin">${icon(`url(#${id}i)`)}</g>
      <g clip-path="url(#${id}c)"><rect class="kl-sheen" x="0" y="0" width="${iw.toFixed(0)}" height="260" fill="url(#${id}s)"/></g>
      ${text('#f4f1ea')}
    </svg>`;
  }
  // 单独的游戏图标（安装包图标、加载页）：同一套路径，渐变默认用品牌色（造乐的青柠 → 青）
  function icon(cls) { const I = CF.LOGO.icon, id = 'gi' + uid++; return `<svg class="${cls || 'gicon'}" viewBox="${I.b[0] - 20} ${I.b[1] - 20} ${I.b[2] - I.b[0] + 40} ${I.b[3] - I.b[1] + 40}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset=".08" style="stop-color:var(--logo-a,#d4ff1e)"/><stop offset=".88" style="stop-color:var(--logo-b,#00f0ff)"/></linearGradient></defs><path d="${I.d}" fill-rule="evenodd" fill="url(#${id})"/></svg>`; }
  CF.Brand = { emblem, wordmark, rise, keyLogo, icon };
})();
