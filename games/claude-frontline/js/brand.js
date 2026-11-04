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
  /* 主标题 Key Logo（字体宪法第 13 章）：在第 3 章字标的基础上增加——
   * 矢量字形（不依赖系统字体）· 像素挤出厚度（硬投影的延伸）· 拉丁顶面受光 · 自下而上扫过的高光 ·
   * 地平线 · 破晓辉光 · 上升像素火花 · 副标题飘带。双色分工、渐变自下而上、无描边、无倾斜不变。 */
  function keyLogo(opts = {}) {
    const G = CF.GLYPHS;
    const cjk = opts.cjk || (window.CF_CONFIG && window.CF_CONFIG.title) || '战线';
    if (!G) return wordmark(cjk);
    const sub = opts.sub === undefined ? '造物者之路' : opts.sub;
    const id = 'kl' + uid++, sL = 1.2, tyL = 1000 - 880 * sL, tyC = 24, D = 9, DEPTH = 6;
    const face = [], lat = [], cj = [];
    let x = 1080;
    const latStart = x;
    for (const ch of 'X-S') { lat.push(`<path d="${G[ch].d}" transform="translate(${x.toFixed(1)} ${tyL}) scale(${sL})"/>`); x += G[ch].w * sL + 24; }
    const latEnd = x - 24; x = latEnd + 290;
    const cjStart = x;
    for (const ch of cjk) {
      cj.push(G[ch] ? `<path d="${G[ch].d}" transform="translate(${x} ${tyC})"/>` : `<text x="${x}" y="${880 + tyC}" font-size="1000" font-weight="900" font-family="var(--sans)">${CF.esc(ch)}</text>`);
      x += 1060;
    }
    const W = x - 60, ES = 30, EX = 470 - 24 * ES, EY = 580 - 24 * ES; // 标志：X 形新星，可见高度 ≈ 中文字高
    const SD = 'M24 7 Q25.7 22.3 41 24 Q25.7 25.7 24 41 Q22.3 25.7 7 24 Q22.3 22.3 24 7 Z', star = `<path d="${SD}" transform="rotate(45 24 24)"/>`;
    face.push(`<path d="${SD}" transform="translate(${EX} ${EY}) scale(${ES}) rotate(45 24 24)"/>`);
    // 副标题飘带
    let ribbon = '';
    if (sub) {
      const cs = 0.19, tr = 100, tw = [...sub].length * 1000 * cs + ([...sub].length - 1) * tr, pw = tw + 420, rx = (cjStart + W) / 2 - pw / 2, ry = 1150, rh = 250;
      const st = 34; // 像素台阶
      const poly = [[rx + st * 2, ry], [rx + pw - st * 2, ry], [rx + pw - st * 2, ry + st], [rx + pw - st, ry + st], [rx + pw - st, ry + st * 2], [rx + pw, ry + st * 2], [rx + pw, ry + rh - st * 2], [rx + pw - st, ry + rh - st * 2], [rx + pw - st, ry + rh - st], [rx + pw - st * 2, ry + rh - st], [rx + pw - st * 2, ry + rh], [rx + st * 2, ry + rh], [rx + st * 2, ry + rh - st], [rx + st, ry + rh - st], [rx + st, ry + rh - st * 2], [rx, ry + rh - st * 2], [rx, ry + st * 2], [rx + st, ry + st * 2], [rx + st, ry + st], [rx + st * 2, ry + st]].map((p) => p.join(',')).join(' ');
      let tx = rx + 210;
      const txt = [...sub].map((ch) => { const g = G[ch], o = g ? `<path d="${g.d}" transform="translate(${tx.toFixed(1)} ${ry + 30}) scale(${cs})"/>` : `<text x="${tx}" y="${ry + 30 + 880 * cs}" font-size="${1000 * cs}" font-weight="900">${CF.esc(ch)}</text>`; tx += 1000 * cs + tr; return o; }).join('');
      const dm = (cx) => `<path d="M${cx} ${ry + rh / 2 - 40}l40 40l-40 40l-40-40z" fill="url(#${id}d)"/>`;
      ribbon = `<g class="kl-ribbon"><polygon points="${poly}" transform="translate(0 ${D * 2})" fill="#0b0716"/><polygon points="${poly}" fill="#1c1240"/><rect x="${rx + st * 2}" y="${ry}" width="${pw - st * 4}" height="14" fill="url(#${id}h)"/>${dm(rx + 110)}${dm(rx + pw - 110)}<g fill="#ede6d6">${txt}</g></g>`;
    }
    // 上升的像素火花（向上）
    const sparks = [[620, 120, 46, '#ffe08a', 0], [880, 260, 34, '#4ef0ff', 1.1], [1120, 60, 28, '#ffb14a', 2.3], [W * 0.62, 40, 30, '#ffe08a', 0.6], [W * 0.84, 90, 38, '#4ef0ff', 1.8], [W - 80, 220, 26, '#ffb14a', 2.9]].map(([sx, sy, sz, c, dl]) => `<rect class="kl-px" x="${sx.toFixed(0)}" y="${sy}" width="${sz}" height="${sz}" fill="${c}" style="animation-delay:${dl}s"/>`).join('');
    const ext = [];
    for (let k = DEPTH; k >= 1; k--) ext.push(`<use href="#${id}a" transform="translate(0 ${k * D})" fill="${['#4a2fa0', '#3a2484', '#2e1c6c', '#241656', '#1b1042', '#130b30'][k - 1]}"/>`);
    const vb = `-140 -60 ${W + 280} ${sub ? 1500 : 1240}`;
    return `<svg class="kl" viewBox="${vb}" role="img" aria-label="X-S${CF.esc(cjk)}${sub ? ' · ' + CF.esc(sub) : ''}">
      <defs>
        <linearGradient id="${id}d" gradientUnits="userSpaceOnUse" x1="0" y1="1010" x2="0" y2="120"><stop offset="0" stop-color="#ff7a45"/><stop offset=".6" stop-color="#ffb14a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
        <linearGradient id="${id}e" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a45"/><stop offset=".6" stop-color="#ffb14a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
        <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff7a45"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#ff7a45"/></linearGradient>
        <linearGradient id="${id}z" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4ef0ff" stop-opacity="0"/><stop offset=".25" stop-color="#4ef0ff" stop-opacity=".9"/><stop offset=".75" stop-color="#4ef0ff" stop-opacity=".9"/><stop offset="1" stop-color="#4ef0ff" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}t" gradientUnits="userSpaceOnUse" x1="0" y1="1080" x2="940" y2="80"><stop offset="0" stop-color="#4ef0ff" stop-opacity="0"/><stop offset=".55" stop-color="#4ef0ff" stop-opacity=".9"/><stop offset="1" stop-color="#e6fdff"/></linearGradient>
        <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6e0" stop-opacity=".55"/><stop offset="1" stop-color="#fff6e0" stop-opacity="0"/></linearGradient>
        <radialGradient id="${id}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb14a" stop-opacity=".42"/><stop offset=".45" stop-color="#ff7a45" stop-opacity=".16"/><stop offset="1" stop-color="#ff7a45" stop-opacity="0"/></radialGradient>
        <g id="${id}l">${lat.join('')}</g>
        <g id="${id}a">${face.join('')}<use href="#${id}l"/>${cj.join('')}</g>
        <clipPath id="${id}v"><rect x="-140" y="-60" width="${W + 280}" height="1158"/></clipPath>
        <clipPath id="${id}c">${lat.join('')}${face.join('')}</clipPath>
      </defs>
      <ellipse class="kl-glow" cx="${W / 2}" cy="1098" rx="${W * 0.62}" ry="900" fill="url(#${id}g)" clip-path="url(#${id}v)"/>
      <rect x="-140" y="1092" width="${W + 280}" height="12" fill="url(#${id}z)"/>
      ${sparks}
      <path d="M-90 1080 C 200 1080, 260 680, 470 580 S 720 160, 940 80" fill="none" stroke="url(#${id}t)" stroke-width="58" stroke-linecap="round"/>
      ${ext.join('')}
      <g class="kl-star-wrap" transform="translate(${EX} ${EY}) scale(${ES})"><g class="kl-star" fill="url(#${id}e)">${star}<circle cx="24" cy="24" r="2.2" fill="#fff6e0"/></g></g>
      <circle cx="940" cy="80" r="50" fill="#e6fdff"/>
      <g fill="url(#${id}d)"><use href="#${id}l"/></g>
      <g clip-path="url(#${id}c)"><rect x="${latStart - 40}" y="${tyL + 166 * sL}" width="${latEnd - latStart + 80}" height="190" fill="url(#${id}b)"/><rect class="kl-sheen" x="-100" y="0" width="${latEnd + 200}" height="190" fill="url(#${id}s)"/></g>
      <g fill="#ede6d6">${cj.join('')}</g>
      ${ribbon}
    </svg>`;
  }
  CF.Brand = { emblem, wordmark, rise, keyLogo };
})();
