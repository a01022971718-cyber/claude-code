#!/usr/bin/env python3
"""英雄配音录音生成 v2（v7，《角色设计宪法》第 13 章及补充）

目标：去掉「机械念稿」感，接近游戏配音（参考王者荣耀、英雄联盟的英雄语录：短、有态度、每类台词情绪不同）。
用开源离线语音模型 Kokoro-82M v1.1-zh（Apache-2.0，100 位中文说话人）出声，再按「配音导演」的方式加工：

1. 选角：每位英雄一位说话人（双子两位交替），见 voice/cast.json。
2. 分句演绎：一句台词按标点切成短语，每个短语单独定语速、音高、音量——
   「！」重读（升调、加重）、「？」上扬、「……」拖长变弱、「——」短停后加强；句与句之间用自然停顿，而不是一口气念完。
3. 情绪模板（按台词类型）：选中自信、移动轻快、攻击短促有冲劲、大招拔高喊出来（压缩 + 轻微饱和 + 回声）、
   击杀冷静带一点得意、濒危发虚发颤（颤音 + 变暗）、复活提气、点击台词自然随意。大招和濒危前面加一口气声。
4. 挑 take：每句录 4 条（整句 / 分句 × 两种语速），用离线语音识别「听」成品：
   先保证听得清（拼音错误率最低），清晰度相同时选音高起伏更大的那条（更有表现力）。结果写进 voice/report.json。

    python3 tools/gen-voices.py --model <kokoro 模型目录> --asr <paraformer 模型目录> [--only 英雄id]
    node tools/pack-voices.mjs            # 打包进 js/voice-data.js

换成真人配音：按 voice/manifest.json 的文件名替换 voice/<英雄>/*.mp3，再运行 pack-voices.mjs。
"""
import argparse, json, os, re, subprocess, sys, tempfile, unicodedata

import numpy as np
import sherpa_onnx
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, 'voice')
SR = 24000

# ---------- 情绪模板：语速倍率、整体音高（半音）、增益（dB）、后期效果、是否加气声 ----------
EMO = {
    'pick':   dict(speed=1.00, pitch=0.3, gain=0.5, fx='equalizer=f=3000:t=q:w=1:g=1.5', breath=False),
    'quote':  dict(speed=1.00, pitch=0.3, gain=0.5, fx='equalizer=f=3000:t=q:w=1:g=1.5', breath=False),
    'move':   dict(speed=1.10, pitch=0.4, gain=0.0, fx='', breath=False),
    'attack': dict(speed=1.12, pitch=0.6, gain=1.5, fx='acompressor=threshold=0.1:ratio=4:attack=3:release=60:makeup=1.6', breath=False),
    'skill':  dict(speed=1.04, pitch=1.4, gain=3.0, fx='acompressor=threshold=0.08:ratio=5:attack=2:release=80:makeup=2,asoftclip=type=tanh:threshold=0.9,aecho=0.8:0.6:60|120:0.18|0.09', breath=True),
    'kill':   dict(speed=0.95, pitch=-0.4, gain=0.5, fx='aecho=0.8:0.7:35:0.12', breath=False),
    'low':    dict(speed=0.88, pitch=-0.7, gain=-2.0, fx='tremolo=f=7:d=0.22,lowpass=f=5200', breath=True),
    'revive': dict(speed=1.06, pitch=0.8, gain=1.5, fx='equalizer=f=3500:t=q:w=1:g=2', breath=False),
    'click1': dict(speed=1.00, pitch=0.2, gain=0.0, fx='', breath=False),
    'click2': dict(speed=1.04, pitch=0.5, gain=0.3, fx='', breath=False),
}
HERO_FX = {
    'hall': 'aecho=0.8:0.55:45|95:0.18|0.09,equalizer=f=3500:t=q:w=1:g=1.5',
    'warm': 'equalizer=f=250:t=q:w=1:g=2,equalizer=f=6500:t=q:w=1:g=-2',
    'room': 'aecho=0.8:0.7:30:0.12',
    'punch': 'acompressor=threshold=0.1:ratio=3:attack=5:release=80:makeup=1.4,equalizer=f=1800:t=q:w=1:g=2',
    'deep': 'lowpass=f=3800,aecho=0.8:0.6:110|230:0.26|0.14',
    'cold': 'highpass=f=140,aecho=0.8:0.6:180|360:0.18|0.09',
    'bright': 'equalizer=f=4000:t=q:w=1:g=2',
    'child': 'equalizer=f=3000:t=q:w=1:g=2',
    'none': '',
}
# 标点 → 短语演绎（音高半音、增益 dB、语速倍率）与之后的停顿（秒）
MARK = {'！': (1.4, 2.0, 1.04, 0.16), '？': (1.0, 0.8, 1.0, 0.18), '。': (0.0, 0.0, 1.0, 0.2), '，': (0.0, 0.0, 1.0, 0.11),
        '、': (0.0, 0.0, 1.05, 0.08), '……': (-0.8, -2.0, 0.88, 0.34), '——': (0.4, 0.8, 1.0, 0.13), '': (0.0, 0.0, 1.0, 0.0)}


def tts_engine(m):
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=f'{m}/model.int8.onnx', voices=f'{m}/voices.bin', tokens=f'{m}/tokens.txt', data_dir='',
                dict_dir=f'{m}/dict', lexicon=f'{m}/lexicon-us-en.txt,{m}/lexicon-zh.txt'),
            num_threads=4, provider='cpu'),
        rule_fsts=f'{m}/phone-zh.fst,{m}/date-zh.fst,{m}/number-zh.fst', max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)


def trim(x, thr=0.01, pad=0.03):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx):
        return x
    return x[max(0, idx[0] - int(pad * SR)):min(len(x), idx[-1] + int(pad * SR))]


def synth(tts, text, sid, speed):
    a = tts.generate(text, sid=sid, speed=speed)
    return trim(np.array(a.samples, dtype=np.float32))


def ff(inp, out, af):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', inp, '-af', af, '-ar', str(SR), '-ac', '1', out], check=True)


def shift(x, st, tmp, tag):
    """给一个短语单独变调（保留共振峰，听起来像同一个人把这几个字说高 / 说低）"""
    if abs(st) < 0.05:
        return x
    a, b = os.path.join(tmp, tag + '_a.wav'), os.path.join(tmp, tag + '_b.wav')
    sf.write(a, x, SR); ff(a, b, f'rubberband=pitch={2 ** (st / 12):.4f}:formant=preserved')
    y, _ = sf.read(b, dtype='float32'); return y


def phrases(text):
    """按标点切成短语：返回 [(短语文字, 结尾标点)]"""
    out, buf, i = [], '', 0
    while i < len(text):
        two, one = text[i:i + 2], text[i]
        if two in ('……', '——'):
            out.append((buf, two)); buf = ''; i += 2; continue
        if one in '！？。，、':
            out.append((buf + one, one)); buf = ''; i += 1; continue
        buf += one; i += 1
    if buf.strip():
        out.append((buf, ''))
    return [(t, m) for t, m in out if norm_txt(t) or m in ('……', '——')]


def breath(kind):
    """一口气声：粉红噪声 → 带通 → 淡入淡出（吸气 0.18 秒）"""
    n = int(0.18 * SR); w = np.random.default_rng(len(kind)).standard_normal(n).astype(np.float32)
    w = np.convolve(w, np.ones(6) / 6, mode='same') - np.convolve(w, np.ones(40) / 40, mode='same')
    env = np.sin(np.linspace(0, np.pi, n)) ** 2
    return (w * env * 0.025).astype(np.float32)


def perform(tts, text, c, emo, speed, mode, tmp, tag):
    """一条 take：mode = 'line' 整句一次说完；'phrase' 分句演绎"""
    twin = bool(c.get('sid2'))
    parts = [breath(tag)] if emo['breath'] else []
    if mode == 'line' and not twin:
        parts.append(synth(tts, text.replace('——', '，').replace('……', '…'), c['sid'], speed))
        return np.concatenate(parts)
    ps, k = phrases(text), 0
    for i, (t, m) in enumerate(ps):
        last = i == len(ps) - 1
        p_st, p_db, p_sp, pause = MARK.get(m, MARK[''])
        if last and emo is EMO['skill']:
            p_st += 0.8; p_db += 1.5                     # 大招最后一个短语是高潮
        if emo is EMO['low'] and i == 0:
            p_db -= 1.0                                  # 濒危：第一句更虚
        if norm_txt(t):
            alt = twin and k % 2 == 1
            seg = t.rstrip('！？。，、') + ('！' if m == '！' else '？' if m == '？' else '。')
            x = synth(tts, seg, c['sid2'] if alt else c['sid'], speed * p_sp * (1.05 if alt else 1))
            x = shift(x, p_st, tmp, f'{tag}_{i}') * (10 ** (p_db / 20))
            parts.append(x.astype(np.float32))
        if m == '——':
            k += 1
        if pause and not last:
            parts.append(np.zeros(int(pause * SR), dtype=np.float32))
    return np.concatenate(parts) if parts else np.zeros(1, dtype=np.float32)


def post(wav_in, mp3_out, pitch, fx_list, gain):
    chain = []
    if abs(pitch) > 0.05:
        chain.append(f'rubberband=pitch={2 ** (pitch / 12):.4f}:formant=shifted')
    chain += [f for f in fx_list if f]
    chain += ['loudnorm=I=-16:TP=-1.5:LRA=11', f'volume={gain}dB', 'apad=pad_dur=0.06']
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_in, '-af', ','.join(chain), '-ar', str(SR), '-ac', '1',
                    '-c:a', 'libmp3lame', '-b:a', '32k', mp3_out], check=True)


def norm_txt(s):
    return ''.join(ch for ch in s if unicodedata.category(ch)[0] in 'LN')


def edit(r, h):
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def cer(ref, hyp):
    return edit(norm_txt(ref), norm_txt(hyp))


def per(ref, hyp):
    """拼音错误率：不计同音字（识别模型常把「鼓点」写成「古典」），更接近「发音对不对」"""
    try:
        from pypinyin import lazy_pinyin
    except ImportError:
        return cer(ref, hyp)
    return edit(lazy_pinyin(norm_txt(ref)), lazy_pinyin(norm_txt(hyp)))


def f0_range(y, sr):
    """音高起伏（半音标准差）：越大越不像平铺直叙"""
    fr, hop, vals = int(sr * 0.04), int(sr * 0.01), []
    for i in range(0, len(y) - fr, hop):
        w = y[i:i + fr] * np.hanning(fr)
        if np.sqrt(np.mean(w ** 2)) < 0.02:
            continue
        ac = np.correlate(w, w, 'full')[fr - 1:]; lo, hi = int(sr / 450), int(sr / 70)
        k = lo + int(np.argmax(ac[lo:hi]))
        if ac[k] > 0.35 * ac[0]:
            vals.append(12 * np.log2(sr / k))
    return float(np.std(vals)) if len(vals) > 5 else 0.0


TAKES = [('phrase', 1.0), ('line', 1.0), ('phrase', 0.94), ('line', 0.95)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--asr')
    ap.add_argument('--only')
    ap.add_argument('--redo', type=float, help='只重录 report.json 里拼音错误率 ≥ 这个值的台词（每句 8 条 take）')
    args = ap.parse_args()
    prev_rep = json.load(open(os.path.join(VOICE, 'report.json'), encoding='utf-8')) if args.redo is not None else {}
    lines = json.load(open(os.path.join(VOICE, 'lines.json'), encoding='utf-8'))
    cast = json.load(open(os.path.join(VOICE, 'cast.json'), encoding='utf-8'))
    tts = tts_engine(args.model)
    rec = sherpa_onnx.OfflineRecognizer.from_paraformer(paraformer=f'{args.asr}/model.int8.onnx', tokens=f'{args.asr}/tokens.txt', num_threads=4) if args.asr else None
    manifest, report = {}, {}
    with tempfile.TemporaryDirectory() as tmp:
        for h in lines:
            hid = h['id']
            if args.only and hid != args.only:
                continue
            c = cast[hid]
            d = os.path.join(VOICE, hid); os.makedirs(d, exist_ok=True)
            if args.redo is None:
                for f in os.listdir(d):
                    if f.endswith('.mp3'):
                        os.remove(os.path.join(d, f))
            items = [(k, v) for k, v in h['lines'].items()] + [(f'click{i + 1}', v) for i, v in enumerate(h['clicks'])]
            seen, manifest[hid] = set(), {}
            for key, text in items:
                if not text or text in seen:
                    continue
                seen.add(text)
                if args.redo is not None:
                    old = prev_rep.get(hid, {}).get(text)
                    if old and old['per'] < args.redo:
                        manifest[hid][text] = f'{hid}/{key}.mp3'; report.setdefault(hid, {})[text] = old; continue
                emo = EMO[key]
                speed = c['speed'] * emo['speed']
                out = os.path.join(d, f'{key}.mp3')
                takes = []
                tk = TAKES + [('phrase', 0.86), ('line', 0.88), ('phrase', 1.08), ('line', 1.1)] if args.redo is not None else TAKES
                for ti, (mode, sm) in enumerate(tk if rec else tk[:1]):
                    tag = f'{hid}_{key}_{ti}'
                    x = perform(tts, text, c, emo, speed * sm, mode, tmp, tag)
                    wav, mp3 = os.path.join(tmp, tag + '.wav'), os.path.join(tmp, tag + '.mp3')
                    sf.write(wav, x, SR)
                    post(wav, mp3, c.get('pitch', 0) + emo['pitch'], [HERO_FX[c.get('fx', 'none')], emo['fx']], emo['gain'] + c.get('gain', 0))
                    chk = os.path.join(tmp, tag + '_chk.wav')
                    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-ar', '16000', '-ac', '1', chk], check=True)
                    y, ysr = sf.read(chk, dtype='float32')
                    hyp = ''
                    if rec:
                        s = rec.create_stream(); s.accept_waveform(ysr, y); rec.decode_stream(s); hyp = s.result.text
                    takes.append(dict(mp3=mp3, hyp=hyp, per=per(text, hyp) if rec else 0, cer=cer(text, hyp) if rec else 0, expr=f0_range(y, ysr), mode=mode, sp=sm, sec=len(y) / ysr))
                # 先比清晰度，清晰度接近（拼音错误率相差 ≤ 0.05）时选音高起伏更大的
                bp = min(t['per'] for t in takes)
                pool = [t for t in takes if t['per'] <= bp + 0.05]
                best = max(pool, key=lambda t: (t['expr'] - 3 * t['cer']))
                os.replace(best['mp3'], out)
                manifest[hid][text] = f'{hid}/{key}.mp3'
                report.setdefault(hid, {})[text] = {'type': key, 'asr': best['hyp'], 'cer': round(best['cer'], 3), 'per': round(best['per'], 3), 'take': f"{best['mode']}×{best['sp']}", 'expr': round(best['expr'], 2), 'sec': round(best['sec'], 2)}
                print(hid, key, text, f'{os.path.getsize(out) / 1024:.1f}KB', report[hid][text], flush=True)
    mp = os.path.join(VOICE, 'manifest.json')
    old = json.load(open(mp, encoding='utf-8')) if (args.only or args.redo is not None) and os.path.exists(mp) else {}
    old.update(manifest); json.dump(old, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if report:
        rp = os.path.join(VOICE, 'report.json')
        prev = json.load(open(rp, encoding='utf-8')) if (args.only or args.redo is not None) and os.path.exists(rp) else {}
        prev.update(report); json.dump(prev, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        allv = [v for hh in prev.values() for v in hh.values()]
        n = len(allv)
        print('条数', n, '字错误率', round(sum(v['cer'] for v in allv) / n, 3), '拼音错误率', round(sum(v['per'] for v in allv) / n, 3),
              '拼音全对', sum(1 for v in allv if v['per'] == 0), '平均音高起伏(半音)', round(sum(v.get('expr', 0) for v in allv) / n, 2))


if __name__ == '__main__':
    sys.exit(main())
