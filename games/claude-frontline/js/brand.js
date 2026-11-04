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
  function wordmark(cjk = (window.CF_CONFIG && window.CF_CONFIG.title) || '战益', opts = {}) {
    return `<span class="wm ${opts.shadow === false ? '' : 'wm-shadow'}">${emblem()}<span class="wm-latin">X-S</span>${cjk ? `<span class="wm-cjk">${cjk}</span>` : ''}</span>`;
  }
  // 逐字上升动画（「向上」）
  function rise(text, step = 40) {
    return `<span class="t-rise">${[...text].map((ch, i) => `<span style="animation-delay:${i * step}ms">${ch === ' ' ? '&nbsp;' : CF.esc(ch)}</span>`).join('')}</span>`;
  }
  /* 游戏图标（字体宪法第 13 章 v1.2）：圆环取王者荣耀 / QQ 飞车圆形图标的外形；
   * 内部是游戏里最高频的两个元素——音符与代码——组成一个代码标签 <♪/>：
   * 「<」「/>」（代码，探索青）与音符（米白）彼此靠拢、一起向上，指向冲破圆环的新星（破晓金）。
   * 寓意：共同新生，向上，探索未知。c = 颜色表（挤出层用同一套路径换成深色） */
  function gameIcon(c) {
    c = c || {};
    const ring = c.ring || 'url(#gid)', note = c.note || '#ede6d6', code = c.code || 'url(#gic)', star = c.star || 'url(#gid)';
    return `${c.flat ? '' : '<circle cx="50" cy="13" r="15" fill="url(#gig)"/>'}
      <path d="M70.6 13.1 A44 44 0 1 1 29.4 13.1" fill="none" stroke="${ring}" stroke-width="8" stroke-linecap="round"/>
      <path d="M27 51 L 16.5 60 L 27 69" fill="none" stroke="${code}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <ellipse cx="35" cy="69" rx="9.5" ry="6.8" transform="rotate(-25 35 69)" fill="${note}"/>
      <path d="M42.5 66 C 43.5 52, 46 38, 50 27" fill="none" stroke="${note}" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M46.4 39.5 C 51.5 40.5, 54 44, 53.6 49" fill="none" stroke="${note}" stroke-width="4" stroke-linecap="round"/>
      <path d="M62 73 L 52.5 30" fill="none" stroke="${code}" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M66 51 L 76.5 60 L 66 69" fill="none" stroke="${code}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M50 1 Q51.4 11.6 62 13 Q51.4 14.4 50 25 Q48.6 14.4 38 13 Q48.6 11.6 50 1Z" fill="${star}"/>
      ${c.flat ? '' : '<circle cx="50" cy="13" r="2" fill="#fff"/>'}`;
  }
  const iconDefs = () => `<linearGradient id="gid" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff7a45"/><stop offset=".6" stop-color="#ffb14a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient><linearGradient id="gic" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#29c8e0"/><stop offset="1" stop-color="#c8faff"/></linearGradient><radialGradient id="gig" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d8" stop-opacity=".9"/><stop offset="1" stop-color="#ffb14a" stop-opacity="0"/></radialGradient>`;
  // 单独的游戏图标 SVG（图鉴、加载页、安装包图标）
  function icon(cls) { return `<svg class="${cls || 'gicon'}" viewBox="0 0 100 100" aria-hidden="true"><defs>${iconDefs()}</defs>${gameIcon()}</svg>`; }

  /* 主标题 Key Logo（字体宪法第 13 章）：「X-S ◎ 战益」——游戏图标居中，左右两边携手。
   * 矢量字形 · 像素挤出厚度（硬投影的延伸）· 拉丁顶面受光 · 自下而上扫光 · 地平线 · 破晓辉光 · 上升火花 · 副标飘带。
   * 双色分工（拉丁破晓渐变 / 中文米白）、渐变自下而上、无描边、无倾斜不变。 */
  function keyLogo(opts = {}) {
    const G = CF.GLYPHS;
    const cjk = opts.cjk || (window.CF_CONFIG && window.CF_CONFIG.title) || '战益';
    if (!G) return wordmark(cjk);
    const sub = opts.sub === undefined ? '造物者之路' : opts.sub;
    const id = 'kl' + uid++, sL = 1.2, tyL = 1000 - 880 * sL, tyC = 24, D = 9, DEPTH = 6;
    const lat = [], cj = [];
    let x = 0;
    for (const ch of 'X-S') { lat.push(`<path d="${G[ch].d}" transform="translate(${x.toFixed(1)} ${tyL}) scale(${sL})"/>`); x += G[ch].w * sL + 24; }
    const latEnd = x - 24, IS = 11.5, IW = 100 * IS, ix = latEnd + 210, iy = 560 - 52 * IS, icx = ix + 50 * IS;
    x = ix + IW + 210;
    const cjStart = x;
    for (const ch of cjk) {
      cj.push(G[ch] ? `<path d="${G[ch].d}" transform="translate(${x} ${tyC})"/>` : `<text x="${x}" y="${880 + tyC}" font-size="1000" font-weight="900" font-family="var(--sans)">${CF.esc(ch)}</text>`);
      x += 1060;
    }
    const W = x - 60;
    // 副标题飘带（居中在图标下方，象征把两边连在一起）
    let ribbon = '';
    if (sub) {
      const cs = 0.19, tr = 100, n = [...sub].length, tw = n * 1000 * cs + (n - 1) * tr, pw = tw + 420, rx = icx - pw / 2, ry = 1150, rh = 250, st = 34;
      const poly = [[rx + st * 2, ry], [rx + pw - st * 2, ry], [rx + pw - st * 2, ry + st], [rx + pw - st, ry + st], [rx + pw - st, ry + st * 2], [rx + pw, ry + st * 2], [rx + pw, ry + rh - st * 2], [rx + pw - st, ry + rh - st * 2], [rx + pw - st, ry + rh - st], [rx + pw - st * 2, ry + rh - st], [rx + pw - st * 2, ry + rh], [rx + st * 2, ry + rh], [rx + st * 2, ry + rh - st], [rx + st, ry + rh - st], [rx + st, ry + rh - st * 2], [rx, ry + rh - st * 2], [rx, ry + st * 2], [rx + st, ry + st * 2], [rx + st, ry + st], [rx + st * 2, ry + st]].map((p) => p.join(',')).join(' ');
      let tx = rx + 210;
      const txt = [...sub].map((ch) => { const g = G[ch], o = g ? `<path d="${g.d}" transform="translate(${tx.toFixed(1)} ${ry + 30}) scale(${cs})"/>` : `<text x="${tx}" y="${ry + 30 + 880 * cs}" font-size="${1000 * cs}" font-weight="900">${CF.esc(ch)}</text>`; tx += 1000 * cs + tr; return o; }).join('');
      const dm = (cx) => `<path d="M${cx} ${ry + rh / 2 - 40}l40 40l-40 40l-40-40z" fill="url(#${id}d)"/>`;
      ribbon = `<g class="kl-ribbon"><polygon points="${poly}" transform="translate(0 ${D * 2})" fill="#0b0716"/><polygon points="${poly}" fill="#1c1240"/><rect x="${rx + st * 2}" y="${ry}" width="${pw - st * 4}" height="14" fill="url(#${id}h)"/>${dm(rx + 110)}${dm(rx + pw - 110)}<g fill="#ede6d6">${txt}</g></g>`;
    }
    const sparks = [[icx - 900, 120, 40, '#ffe08a', 0], [icx + 760, 60, 34, '#4ef0ff', 1.1], [icx - 1500, 40, 28, '#ffb14a', 2.3], [icx + 1400, 20, 30, '#ffe08a', 0.6], [W - 120, 200, 36, '#4ef0ff', 1.8], [120, 220, 26, '#ffb14a', 2.9]].map(([sx, sy, sz, c, dl]) => `<rect class="kl-px" x="${sx.toFixed(0)}" y="${sy}" width="${sz}" height="${sz}" fill="${c}" style="animation-delay:${dl}s"/>`).join('');
    const shades = ['#4a2fa0', '#3a2484', '#2e1c6c', '#241656', '#1b1042', '#130b30'];
    const ext = [];
    for (let k = DEPTH; k >= 1; k--) {
      const c = shades[k - 1];
      ext.push(`<use href="#${id}a" transform="translate(0 ${k * D})" fill="${c}"/><g transform="translate(${ix} ${iy + k * D}) scale(${IS})">${gameIcon({ ring: c, note: c, code: c, star: c, flat: true })}</g>`);
    }
    const vb = `-140 -80 ${W + 280} ${sub ? 1520 : 1260}`;
    return `<svg class="kl" viewBox="${vb}" role="img" aria-label="X-S${CF.esc(cjk)}${sub ? ' · ' + CF.esc(sub) : ''}">
      <defs>
        ${iconDefs()}
        <linearGradient id="${id}d" gradientUnits="userSpaceOnUse" x1="0" y1="1010" x2="0" y2="120"><stop offset="0" stop-color="#ff7a45"/><stop offset=".6" stop-color="#ffb14a"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
        <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff7a45"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#ff7a45"/></linearGradient>
        <linearGradient id="${id}z" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4ef0ff" stop-opacity="0"/><stop offset=".25" stop-color="#4ef0ff" stop-opacity=".9"/><stop offset=".75" stop-color="#4ef0ff" stop-opacity=".9"/><stop offset="1" stop-color="#4ef0ff" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6e0" stop-opacity=".55"/><stop offset="1" stop-color="#fff6e0" stop-opacity="0"/></linearGradient>
        <radialGradient id="${id}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb14a" stop-opacity=".45"/><stop offset=".45" stop-color="#ff7a45" stop-opacity=".16"/><stop offset="1" stop-color="#ff7a45" stop-opacity="0"/></radialGradient>
        <g id="${id}l">${lat.join('')}</g>
        <g id="${id}a"><use href="#${id}l"/>${cj.join('')}</g>
        <clipPath id="${id}v"><rect x="-140" y="-80" width="${W + 280}" height="1178"/></clipPath>
        <clipPath id="${id}c">${lat.join('')}</clipPath>
      </defs>
      <ellipse class="kl-glow" cx="${icx}" cy="1098" rx="${W * 0.55}" ry="980" fill="url(#${id}g)" clip-path="url(#${id}v)"/>
      <rect x="-140" y="1092" width="${W + 280}" height="12" fill="url(#${id}z)"/>
      ${sparks}
      ${ext.join('')}
      <g class="kl-icon" transform="translate(${ix} ${iy}) scale(${IS})"><g class="kl-spin">${gameIcon()}</g></g>
      <g fill="url(#${id}d)"><use href="#${id}l"/></g>
      <g clip-path="url(#${id}c)"><rect x="-40" y="${tyL + 166 * sL}" width="${latEnd + 80}" height="190" fill="url(#${id}b)"/><rect class="kl-sheen" x="-100" y="0" width="${latEnd + 200}" height="190" fill="url(#${id}s)"/></g>
      <g fill="#ede6d6">${cj.join('')}</g>
      ${ribbon}
    </svg>`;
  }
  CF.Brand = { emblem, wordmark, rise, keyLogo, icon, gameIcon, iconDefs };
})();
