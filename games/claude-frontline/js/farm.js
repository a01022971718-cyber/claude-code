/* 英语田园入口（v8，主创要求：把「生而向星」英语农场按造月之路的美术 / UI 宪法改造，保留全部功能）
 * - 田园本体在 farm/：主创的「豆豆的田园厨房」（第 27 版）按造月之路的做法改造（tools/farm-zy-build.mjs --embed，源文件 farm-zy-src/）。
 *   主题英雄跟随游戏里的主英雄（网址 ?hero=英雄id），场景里的主角就是这位英雄；v9.2 起连皮肤一起带过去（?skin=…，见 js/skins.js 的 export）。
 * - 进入方式是整页跳转（不是 iframe）：安卓 WebView 里 file:// 页面嵌 https iframe 的存储可能被分区，田园存档不保证留得住。
 * - 田园里的学习时间按造月之路的规则计时（连续 25 分钟 / 零散 40 分钟换无限体力），回来时用 #farmlearn=秒 带回并结算。
 * - 单文件网页版（dist）不带田园素材（十几 MB），点入口会说明原因。 */
(function () {
  const CF = window.CF;
  const F = (CF.Farm = {});
  const ANDROID = /^file:\/\/\/android_asset\//.test(location.href);
  F.url = function () {
    if (ANDROID) return 'https://appassets.androidplatform.net/farm/index.html';   // MainActivity 拦截这个域名，从 assets/farm/ 读文件
    if (/\/dist\/[^/]*$/.test(location.pathname)) return new URL('../farm/index.html', location.href).href;
    return new URL('farm/index.html', location.href).href;
  };
  async function available() {
    if (ANDROID) return true;
    if (!/^https?:$/.test(location.protocol)) return 'file';
    try { const r = await fetch(new URL('version.json', F.url()), { cache: 'no-store' }); return r.ok; } catch (e) { return false; }
  }
  F.enter = async function () {
    const ok = await available();
    if (!ok) {
      return CF.modal.open({ title: '英语田园', body: '<p style="line-height:1.8">这个版本没有带上英语田园的素材（十几 MB，单文件网页版放不下）。<br>请用<b>安卓安装包</b>，或者把整个 <code>games/claude-frontline</code> 文件夹放到本地网页服务器上打开（例如在文件夹里运行 <code>python3 -m http.server</code>）。</p>', foot: [{ text: '知道了', cls: 'primary' }] });
    }
    if (ok === 'file') {
      // 直接双击打开的本地文件：浏览器不允许田园读取自己的数据文件，部分功能会失效
      return CF.modal.open({ title: '英语田园', body: '<p style="line-height:1.8">你是直接双击打开的本地文件。浏览器不允许这种方式下的田园读取自己的课程数据，部分功能会失效。<br>建议在 <code>games/claude-frontline</code> 文件夹里运行 <code>python3 -m http.server</code>，再用浏览器打开 <code>http://localhost:8000</code>。</p>', foot: [{ text: '取消', cls: 'ghost' }, { text: '仍然打开', cls: 'primary', onClick: () => { CF.modal.close(); go(); } }] });
    }
    go();
  };
  function go() {
    const st = CF.Stamina.learnInfo();
    const hid = CF.Save.data.hero || CF.Heroes.current().id, sk = CF.Skins ? CF.Skins.export(hid) : null;   // v9.2：田园里也穿当前皮肤
    const p = new URLSearchParams({ zy: '1', hero: String(hid), skin: sk ? JSON.stringify(sk) : '', sess: String(Math.floor(st.sess)), pool: String(Math.floor(st.pool)), bank: st.bank > 0 ? '1' : '0', ret: location.href.split('#')[0] });
    const url = F.url() + '?' + p.toString();
    CF.Save.save();
    CF.Audio.sfx('unlock');
    CF.PixelFX.wipe();
    setTimeout(() => {
      if (ANDROID && window.XSNative && typeof XSNative.openFarm === 'function') XSNative.openFarm(url);
      else location.href = url;
    }, 280);
  }
  // 从田园回来：#farmlearn=秒（main.js 启动时调用）
  F.checkReturn = function () {
    const m = location.hash.match(/farmlearn=(\d+)/); if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file:// 下可能不允许 */ }
    const s = CF.Save.data; s.farm = s.farm || { visits: 0, sec: 0 }; s.farm.visits++; s.farm.sec += +m[1];
    CF.Stamina.credit(+m[1], '英语田园');
  };
})();
