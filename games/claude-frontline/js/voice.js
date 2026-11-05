/* 英雄配音（v2，《英雄设计宪法》第 13 章及 v1.3 增补）
 * v6 起优先播放「录音」：每位英雄的每句台词都有一条录好的 mp3（js/voice-data.js，离线可用），
 *   每人一位不同的说话人，每种台词有不同的演绎（口头禅平稳、攻击短促、终极技能拔高带回声、濒危放慢压低）。
 *   录音由开源离线语音模型生成并经语音识别逐条校验（见 tools/gen-voices.py、voice/report.json）；
 *   换成真人配音只需替换 voice/ 下的 mp3 并运行 node tools/pack-voices.mjs。
 * 没有录音的句子（以后新增的台词）按顺序兜底：
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
  // ---------- 录音播放（Web Audio：走音效总线、说话时音乐自动压低） ----------
  const DATA = () => window.CF_VOICE_DATA || {};
  const buf = {}; let curSrc = null;
  const hasClip = (h, text) => !!(DATA()[h.id] && DATA()[h.id][text]);
  async function decode(h, text) {
    const k = h.id + '|' + text; if (buf[k]) return buf[k];
    const b64 = DATA()[h.id][text], bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    buf[k] = await CF.Audio.ctx.decodeAudioData(u8.buffer);
    return buf[k];
  }
  async function playClip(h, text) {
    const A = CF.Audio; if (!A.ctx) A.unlock(); if (!A.ctx) return false;
    try {
      if (A.ctx.state !== 'running') await A.ctx.resume();
      const b = await decode(h, text);
      if (curSrc) { try { curSrc.stop(); } catch (e) { /* 已结束 */ } }
      const src = A.ctx.createBufferSource(), g = A.ctx.createGain(); src.buffer = b; g.gain.value = 1.15;
      src.connect(g); g.connect(A.sfxBus); src.start(); curSrc = src;
      // 说话时把音乐压到 45%，说完 0.25 秒内恢复
      const m = A.music && A.music.gain, now = A.ctx.currentTime, vol = CF.Save.data.settings.music;
      if (m && typeof vol === 'number') { m.cancelScheduledValues(now); m.setTargetAtTime(vol * 0.45, now, 0.05); m.setTargetAtTime(vol, now + b.duration, 0.12); }
      V.speaking = now + b.duration;
      src.onended = () => { if (curSrc === src) curSrc = null; };
      return true;
    } catch (e) { return false; }
  }
  const V = (CF.Voice = {
    hasClip,
    clips: (h) => Object.keys(DATA()[h.id] || {}).length,
    TYPES: [['pick', '选中'], ['move', '移动'], ['attack', '攻击'], ['skill', '大招'], ['kill', '击杀'], ['low', '濒危'], ['revive', '复活']],
    lines: (h) => ['pick', 'move', 'attack', 'skill', 'kill', 'low', 'revive'].map((k) => h.lines[k]).concat([h.quote], h.clicks || []).filter((x, i, a) => x && a.indexOf(x) === i),
    // 每句台词的类型（用于界面标签）
    typeOf(h, text) { const t = V.TYPES.find(([k]) => h.lines[k] === text); return t ? t[1] : '点击'; },
    // 战斗事件配音（v7，参考 MOBA）：每种事件有冷却，优先级高的不会被低的打断
    event(h, type) {
      const CD = { move: 9, attack: 6, kill: 7, revive: 0, low: 0, skill: 0, ack: 5 }, PRI = { skill: 5, low: 4, revive: 4, kill: 3, attack: 2, ack: 2, move: 1 };
      const now = performance.now() / 1000; V._evT = V._evT || {};
      if (now - (V._evT[type] || -99) < (CD[type] || 0)) return false;
      if (V.speakingPri && V.speaking && CF.Audio.ctx && V.speaking > CF.Audio.ctx.currentTime && V.speakingPri > (PRI[type] || 1)) return false;
      const text = h.lines[type]; if (!text) return false;
      V._evT[type] = now; V.speakingPri = PRI[type] || 1; V.say(h, text); return true;
    },
    // 随机一句，不和上一句重复
    pick(h) { const ls = V.lines(h); let s; do { s = ls[Math.floor(Math.random() * ls.length)]; } while (ls.length > 1 && s === last[h.id]); last[h.id] = s; return s; },
    say(h, text) {
      if (!h || !text || mode() === 'off') return;
      const v = h.voice || {};
      if (mode() === 'auto' && hasClip(h, text)) { playClip(h, text).then((ok) => { if (!ok) V.synth(h, text); }); return; }
      V.synth(h, text);
    },
    // 合成兜底（系统语音 / 浏览器语音 / 像素音）
    synth(h, text) {
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
    // 战斗里点到英雄时的应答（参考魔兽争霸 3 的单位应答）：5 秒冷却，避免刷屏
    ack(h) { const now = performance.now(); if (V._ackT !== undefined && now - V._ackT < 5000) return; V._ackT = now; V.speakingPri = 2; const ls = [h.lines.pick, h.lines.move, h.lines.attack].concat(h.clicks || []); let s; do { s = ls[Math.floor(Math.random() * ls.length)]; } while (ls.length > 1 && s === last[h.id]); last[h.id] = s; V.say(h, s); },
    engine: () => (mode() === 'off' ? '关闭' : mode() === 'pixel' ? '像素音' : mode() === 'auto' && Object.keys(DATA()).length ? '英雄录音' : native() ? '系统语音（安卓）' : synth() && zhVoices.length ? '浏览器语音' : '像素音（当前设备没有中文语音）'),
  });
})();
