/* 英雄配音（v1，《英雄设计宪法》第 13 章）
 * 用现有台词（选中 / 攻击 / 技能 / 濒危 + 口头禅）。按英雄的性别、年龄、性格设定音高与语速：
 *   ① 安卓安装包：调用系统中文语音合成（XSNative 桥）；
 *   ② 浏览器：Web Speech API 的中文语音；
 *   ③ 都没有时：「像素音」——按字发出的短促合成音（类似复古游戏的对话音），每位英雄音色不同。
 * 多次点击随机切换台词，不会连续重复同一句。标志性动作与表演效果在下一版本加入。 */
(function () {
  const CF = window.CF;
  const last = {};
  const mode = () => (CF.Save.data.settings.voice || 'auto');
  const native = () => window.XSNative && typeof window.XSNative.speak === 'function';
  const synth = () => window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
  const FEMALE = /ting|xiao|hui|yao|mei|female|女|普通话/i, MALE = /kang|yun|zhi|male|男/i;
  let zhVoices = [];
  const loadVoices = () => { try { zhVoices = (window.speechSynthesis.getVoices() || []).filter((v) => /zh|cmn/i.test(v.lang)); } catch (e) { zhVoices = []; } };
  if (synth()) { loadVoices(); try { window.speechSynthesis.onvoiceschanged = loadVoices; } catch (e) { /* 旧浏览器 */ } }

  // 像素音：每个字一记带共振峰的短音，音高轮廓由字本身决定（同一句台词每次听起来一样）
  const TIMBRE = { zaole: 'triangle', xs: 'triangle', omni: 'sine', twin: 'triangle', riot: 'square', llama: 'sine', abyss: 'sine', luna: 'triangle', pearl: 'square', bun: 'triangle' };
  function pixelVoice(h, text, pitchMul = 1) {
    const A = CF.Audio; if (!A.ctx || A.ctx.state !== 'running') return;
    const v = h.voice || {}, base = (v.gender === 'm' ? 150 : v.gender === 'f' ? 250 : 300) * (v.age && v.age < 13 ? 1.25 : v.age > 39 ? 0.85 : 1) * (v.pitch || 1) * pitchMul;
    const step = 0.085 / (v.rate || 1); let t = A.ctx.currentTime + 0.02;
    for (const ch of text) {
      if (/[，。！？、…—\s,.!?「」]/.test(ch)) { t += step * 1.6; continue; }
      const code = ch.charCodeAt(0), semi = ((code * 7) % 9) - 4, f = base * Math.pow(2, semi / 12);
      const o = A.ctx.createOscillator(), g = A.ctx.createGain(), bp = A.ctx.createBiquadFilter();
      o.type = TIMBRE[h.id] || 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.92, t + step * 0.8);
      bp.type = 'bandpass'; bp.frequency.value = 900 + (code % 5) * 260; bp.Q.value = 1.2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + step * 0.85);
      o.connect(bp); bp.connect(g); g.connect(A.sfxBus); o.start(t); o.stop(t + step);
      t += step;
    }
  }
  const V = (CF.Voice = {
    lines: (h) => [h.lines.pick, h.lines.attack, h.lines.skill, h.lines.low, h.quote].filter((x, i, a) => x && a.indexOf(x) === i),
    // 随机一句，不和上一句重复
    pick(h) { const ls = V.lines(h); let s; do { s = ls[Math.floor(Math.random() * ls.length)]; } while (ls.length > 1 && s === last[h.id]); last[h.id] = s; return s; },
    say(h, text) {
      if (!h || !text || mode() === 'off') return;
      const v = h.voice || {};
      // 双子：「——」前后由两姐妹交替说
      const parts = h.id === 'twin' ? text.split('——') : [text];
      if (mode() !== 'pixel' && native()) { try { window.XSNative.speak(text, v.pitch || 1, v.rate || 1); return; } catch (e) { /* 继续兜底 */ } }
      if (mode() !== 'pixel' && synth() && zhVoices.length) {
        try {
          window.speechSynthesis.cancel();
          parts.forEach((p, i) => {
            const u = new SpeechSynthesisUtterance(p); u.lang = 'zh-CN';
            const want = v.gender === 'm' ? MALE : FEMALE, pickV = zhVoices.find((x) => want.test(x.name)) || zhVoices[0];
            if (pickV) u.voice = pickV;
            u.pitch = Math.max(0.1, Math.min(2, (v.pitch || 1) * (i % 2 && v.alt ? v.alt / (v.pitch || 1) : 1))); u.rate = Math.max(0.5, Math.min(1.6, v.rate || 1)); u.volume = CF.Save.data.settings.sfx;
            window.speechSynthesis.speak(u);
          });
          return;
        } catch (e) { /* 兜底为像素音 */ }
      }
      let delay = 0; parts.forEach((p, i) => { setTimeout(() => pixelVoice(h, p, i % 2 && v.alt ? v.alt / (v.pitch || 1) : 1), delay); delay += (p.length * 85) / (v.rate || 1) + 160; });
    },
    line(h) { const s = V.pick(h); V.say(h, s); return s; },
    engine: () => (mode() === 'off' ? '关闭' : mode() === 'pixel' ? '像素音' : native() ? '系统语音（安卓）' : synth() && zhVoices.length ? '浏览器语音' : '像素音（当前设备没有中文语音）'),
  });
})();
