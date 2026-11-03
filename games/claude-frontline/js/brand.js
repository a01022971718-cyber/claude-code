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
  function wordmark(cjk = '战线', opts = {}) {
    return `<span class="wm ${opts.shadow === false ? '' : 'wm-shadow'}">${emblem()}<span class="wm-latin">X-S</span>${cjk ? `<span class="wm-cjk">${cjk}</span>` : ''}</span>`;
  }
  // 逐字上升动画（「向上」）
  function rise(text, step = 40) {
    return `<span class="t-rise">${[...text].map((ch, i) => `<span style="animation-delay:${i * step}ms">${ch === ' ' ? '&nbsp;' : CF.esc(ch)}</span>`).join('')}</span>`;
  }
  CF.Brand = { emblem, wordmark, rise };
})();
