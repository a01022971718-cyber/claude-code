#!/usr/bin/env python3
"""英雄配音录音生成（v6，《英雄设计宪法》第 13 章增补）

用开源离线语音模型 Kokoro-82M v1.1-zh（Apache-2.0，100 位中文说话人）为每位英雄的每一句台词
生成录音，再用 ffmpeg 做「每人一种音色、每句一种演绎」的后期，输出到 voice/<英雄>/<台词>.mp3。

    python3 tools/gen-voices.py --model <kokoro 模型目录> [--asr <paraformer 模型目录>]

- 选角（说话人编号、语速、音高、音色效果）写在 voice/cast.json；台词来自 voice/lines.json
  （由游戏里的 CF.Heroes 导出，和战斗、大厅里显示的文字一致）。
- 每种台词有自己的演绎方式（LINE_STYLE）：口头禅平稳、攻击短促有力、终极技能拔高并带回声、濒危放慢压低。
- 双子的台词以「——」分成两段，姐姐、妹妹用两位不同的说话人交替说。
- 传入 --asr 时，用离线语音识别把每条录音再听一遍，统计字准确率，写进 voice/report.json。
- 生成后运行 node tools/pack-voices.mjs，把录音打包进 js/voice-data.js（单文件版与安卓包离线可用）。
- 想换成真人配音：把录好的 mp3 按同样的文件名放进 voice/<英雄>/，再运行 pack-voices.mjs 即可。
"""
import argparse, json, os, subprocess, sys, tempfile, unicodedata

import numpy as np
import sherpa_onnx
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, 'voice')

# 台词类型 → 演绎：语速倍率、音高（半音）、增益（dB）、额外效果
LINE_STYLE = {
    'pick':   {'speed': 1.00, 'pitch': 0.0, 'gain': 0.0, 'fx': ''},
    'quote':  {'speed': 1.00, 'pitch': 0.0, 'gain': 0.0, 'fx': ''},
    'attack': {'speed': 1.12, 'pitch': 0.5, 'gain': 1.0, 'fx': 'acompressor=threshold=0.12:ratio=4:attack=4:release=60:makeup=1.5'},
    'skill':  {'speed': 1.04, 'pitch': 1.2, 'gain': 2.5, 'fx': 'aecho=0.8:0.7:70|140:0.2|0.1'},
    'low':    {'speed': 0.9, 'pitch': -0.6, 'gain': -2.5, 'fx': 'lowpass=f=5600'},
    'click1': {'speed': 1.00, 'pitch': 0.3, 'gain': 0.0, 'fx': ''},
    'click2': {'speed': 1.06, 'pitch': 0.6, 'gain': 0.5, 'fx': ''},
}
# 英雄音色效果
HERO_FX = {
    'hall': 'aecho=0.8:0.55:45|95:0.2|0.1,equalizer=f=3500:t=q:w=1:g=1.5',
    'warm': 'equalizer=f=250:t=q:w=1:g=2,equalizer=f=6500:t=q:w=1:g=-2',
    'room': 'aecho=0.8:0.7:30:0.14',
    'punch': 'acompressor=threshold=0.1:ratio=3:attack=5:release=80:makeup=1.5,equalizer=f=1800:t=q:w=1:g=2',
    'deep': 'lowpass=f=3800,aecho=0.8:0.6:110|230:0.28|0.16',
    'cold': 'highpass=f=140,aecho=0.8:0.6:180|360:0.2|0.1',
    'bright': 'equalizer=f=4000:t=q:w=1:g=2',
    'child': 'equalizer=f=3000:t=q:w=1:g=2',
    'none': '',
}


def tts_engine(m):
    cfg = sherpa_onnx.OfflineTtsConfig(
        model=sherpa_onnx.OfflineTtsModelConfig(
            kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
                model=f'{m}/model.int8.onnx', voices=f'{m}/voices.bin', tokens=f'{m}/tokens.txt', data_dir='',
                dict_dir=f'{m}/dict', lexicon=f'{m}/lexicon-us-en.txt,{m}/lexicon-zh.txt'),
            num_threads=4, provider='cpu'),
        rule_fsts=f'{m}/phone-zh.fst,{m}/date-zh.fst,{m}/number-zh.fst', max_num_sentences=1)
    return sherpa_onnx.OfflineTts(cfg)


def trim(x, thr=0.01, pad=0.04, sr=24000):
    idx = np.where(np.abs(x) > thr)[0]
    if not len(idx):
        return x
    a, b = max(0, idx[0] - int(pad * sr)), min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]


def synth(tts, text, sid, speed):
    a = tts.generate(text, sid=sid, speed=speed)
    return trim(np.array(a.samples, dtype=np.float32)), a.sample_rate


PAUSE = {'——': 0.16, '……': 0.34}


def segments(text, split_dash):
    """按「……」切段并插入真实停顿；「——」只在双子的台词里切段（换人说），其余英雄读成逗号"""
    if not split_dash:
        text = text.replace('——', '，')
    out, buf, i = [], '', 0
    while i < len(text):
        two = text[i:i + 2]
        if two in PAUSE:
            out.append((buf, PAUSE[two], two)); buf = ''; i += 2
        else:
            buf += text[i]; i += 1
    out.append((buf, 0, ''))
    return [(t, p, m) for t, p, m in out if t.strip(' ，。！？') or p]


def speak(tts, text, c, speed):
    """一句台词 → 波形。双子按「——」交替两位说话人；其余英雄只是在停顿处断开"""
    parts, sr, k = [], 24000, 0
    for seg, pause, mark in segments(text, bool(c.get('sid2'))):
        if seg.strip(' ，。！？'):
            alt = bool(c.get('sid2')) and k % 2 == 1
            x, sr = synth(tts, seg, c['sid2'] if alt else c['sid'], speed * (1.05 if alt else 1))
            parts.append(x)
        if mark == '——':
            k += 1
        if pause:
            parts.append(np.zeros(int(pause * sr), dtype=np.float32))
    return np.concatenate(parts) if parts else np.zeros(1, dtype=np.float32), sr


def post(wav_in, mp3_out, pitch, fx_list, gain):
    chain = []
    if abs(pitch) > 0.05:
        chain.append(f'rubberband=pitch={2 ** (pitch / 12):.4f}:formant=shifted')
    chain += [f for f in fx_list if f]
    chain += ['loudnorm=I=-16:TP=-1.5:LRA=11', f'volume={gain}dB', 'apad=pad_dur=0.06']
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', wav_in, '-af', ','.join(chain), '-ar', '24000', '-ac', '1',
           '-c:a', 'libmp3lame', '-b:a', '32k', mp3_out]
    subprocess.run(cmd, check=True)


def norm_txt(s):
    return ''.join(ch for ch in s if unicodedata.category(ch)[0] in 'LN')


def cer(ref, hyp):
    r, h = norm_txt(ref), norm_txt(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


TAKES = [1.0, 0.95, 1.05, 0.9]


def per(ref, hyp):
    """拼音错误率：不计同音字（识别模型常把「鼓点」写成「古典」），更接近「发音对不对」"""
    try:
        from pypinyin import lazy_pinyin
    except ImportError:
        return cer(ref, hyp)
    r, h = lazy_pinyin(norm_txt(ref)), lazy_pinyin(norm_txt(hyp))
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--asr')
    ap.add_argument('--only')
    args = ap.parse_args()
    lines = json.load(open(os.path.join(VOICE, 'lines.json'), encoding='utf-8'))
    cast = json.load(open(os.path.join(VOICE, 'cast.json'), encoding='utf-8'))
    tts = tts_engine(args.model)
    manifest, report = {}, {}
    rec = None
    if args.asr:
        rec = sherpa_onnx.OfflineRecognizer.from_paraformer(paraformer=f'{args.asr}/model.int8.onnx', tokens=f'{args.asr}/tokens.txt', num_threads=4)
    with tempfile.TemporaryDirectory() as tmp:
        for h in lines:
            hid = h['id']
            if args.only and hid != args.only:
                continue
            c = cast[hid]
            os.makedirs(os.path.join(VOICE, hid), exist_ok=True)
            items = [(k, v) for k, v in h['lines'].items()] + [(f'click{i + 1}', v) for i, v in enumerate(h['clicks'])]
            seen = set()
            manifest[hid] = {}
            for key, text in items:
                if not text or text in seen:
                    continue
                seen.add(text)
                st = LINE_STYLE[key]
                speed = c['speed'] * st['speed']
                out = os.path.join(VOICE, hid, f'{key}.mp3')
                # 每句录 TAKES 条（语速略有不同），用语音识别「听」成品，留下最清楚的一条——相当于配音导演挑 take
                best = None
                for ti, sm in enumerate(TAKES if rec else TAKES[:1]):
                    x, sr = speak(tts, text, c, speed * sm)
                    wav = os.path.join(tmp, f'{hid}_{key}_{ti}.wav'); mp3 = os.path.join(tmp, f'{hid}_{key}_{ti}.mp3')
                    sf.write(wav, x, sr)
                    post(wav, mp3, c.get('pitch', 0) + st['pitch'], [HERO_FX[c.get('fx', 'none')], st['fx']], st['gain'] + c.get('gain', 0))
                    score, hyp = 0, ''
                    if rec:
                        # 听的是后期之后的成品（变调、回声之后仍要听得清）
                        chk = os.path.join(tmp, f'{hid}_{key}_{ti}_chk.wav')
                        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-ar', '16000', '-ac', '1', chk], check=True)
                        y, ysr = sf.read(chk, dtype='float32')
                        s = rec.create_stream(); s.accept_waveform(ysr, y); rec.decode_stream(s)
                        hyp = s.result.text; score = per(text, hyp) * 2 + cer(text, hyp)
                    if best is None or score < best[0]:
                        best = (score, mp3, hyp, ti, len(x) / sr)
                    if score == 0:
                        break
                os.replace(best[1], out)
                manifest[hid][text] = f'{hid}/{key}.mp3'
                if rec:
                    report.setdefault(hid, {})[text] = {'asr': best[2], 'cer': round(cer(text, best[2]), 3), 'per': round(per(text, best[2]), 3), 'take': best[3] + 1, 'sec': round(best[4], 2)}
                print(hid, key, text, f'{os.path.getsize(out) / 1024:.1f}KB', report.get(hid, {}).get(text, ''), flush=True)
    old = {}
    mp = os.path.join(VOICE, 'manifest.json')
    if args.only and os.path.exists(mp):
        old = json.load(open(mp, encoding='utf-8'))
    old.update(manifest)
    json.dump(old, open(mp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if report:
        rp = os.path.join(VOICE, 'report.json')
        prev = json.load(open(rp, encoding='utf-8')) if args.only and os.path.exists(rp) else {}
        prev.update(report)
        json.dump(prev, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        allc = [v['cer'] for hh in prev.values() for v in hh.values()]
        allp = [v.get('per', v['cer']) for hh in prev.values() for v in hh.values()]
        print('条数', len(allc), 'ASR 平均字错误率', round(sum(allc) / len(allc), 3), '平均拼音错误率', round(sum(allp) / len(allp), 3), '拼音全对', sum(1 for x in allp if x == 0), '最差', max(allp))


if __name__ == '__main__':
    sys.exit(main())
