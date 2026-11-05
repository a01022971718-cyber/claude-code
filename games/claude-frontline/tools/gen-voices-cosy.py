#!/usr/bin/env python3
"""英雄配音 v3（v8）：CosyVoice2 情绪指令配音（《角色设计宪法》第 13 章及补充）

v7 用 Kokoro 合成 + 后期「导演」加工，实测表现力提升有限。v8 主创同意运行 CosyVoice2（Apache-2.0）：
它可以按一句中文「情绪指令」说话（例：「用痞气幽默、语速很快的年轻男鼓手的声音，用尽全力、热血沸腾地大喊出来」），
音色从一段几秒钟的参考录音里学（零样本克隆），所以每位英雄的音色仍然来自 v7 的 Kokoro 选角（voice/cast.json）。

两步：
  1) 生成（需要 CosyVoice 仓库与 CosyVoice2-0.5B 模型，CPU 上约 4–9 倍实时，200 条约 1.5 小时）
     python3 tools/gen-voices-cosy.py gen --cosy <CosyVoice 仓库> --model <CosyVoice2-0.5B 目录> --out <工作目录> [--only 英雄id]
     需要先准备音色参考：<工作目录>/prompts/<英雄id>_a.wav（双子另加 twin_b.wav 给妹妹），
     用 gen-voices.py 的选角各录一段 6–10 秒、语气平稳的样本即可。每句录 2 条 take（语速 1.00 / 1.04）。
  2) 后期（需要 sherpa-onnx 与 Paraformer 中文识别模型，和 gen-voices.py 相同）
     python3 tools/gen-voices-cosy.py post --asr <paraformer 目录> --out <工作目录> [--max-per 0.3]
     每句用离线识别「听」两条 take，先比清晰度（拼音错误率），再比表现力（音高起伏）；
     加英雄音色效果（HERO_FX）和台词类型的后期（大招压缩 + 回声等），响度统一，写成 voice/<英雄>/<类型>.mp3。
     **质量闸门**：最好的一条拼音错误率仍高于 --max-per、且比现有录音差时，保留现有录音（report.json 里 engine 记为 kokoro）。
  3) node tools/pack-voices.mjs   # 打包进 js/voice-data.js
"""
import argparse, importlib.util, json, os, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE = os.path.join(ROOT, 'voice')

# 音色描述（来自《角色设计宪法》第 13 章的选角说明）与台词类型的情绪指令
TONE = {'zaole': '明亮坚定、很有号召力的年轻女指挥家', 'xs': '温和认真、慢半拍的小猫头鹰', 'omni': '沉稳博学、耐心的中年男声',
        'twin': '活泼的少女', 'riot': '痞气幽默、语速很快的年轻男鼓手', 'llama': '温厚、慢条斯理的大叔', 'abyss': '低沉冷静、惜字如金的男声',
        'luna': '清冷克制的年轻女声', 'pearl': '好奇俏皮、问题很多的少女', 'bun': '奶声奶气、热闹的小孩'}
EMO = {'pick': '自信、有精神地登场', 'quote': '自信、有精神地登场', 'move': '轻快干脆地说', 'attack': '短促有力、带点狠劲地说',
       'skill': '用尽全力、热血沸腾地大喊出来', 'kill': '冷静、带一点得意地说', 'low': '虚弱、喘着气、咬牙坚持地说',
       'revive': '重新振作、充满斗志地说', 'click1': '自然随意、像聊天一样说', 'click2': '轻松俏皮地说'}
# CosyVoice 自己已经按指令演绎了情绪，后期只保留「声场」类效果，避免叠加过度
POST_FX = {
    'attack': 'acompressor=threshold=0.1:ratio=3:attack=3:release=60:makeup=1.3',
    'skill': 'acompressor=threshold=0.08:ratio=4:attack=2:release=80:makeup=1.6,aecho=0.8:0.6:60|120:0.16|0.08',
    'kill': 'aecho=0.8:0.7:35:0.1',
    'low': 'lowpass=f=5600',
}
GAIN = {'skill': 2.0, 'attack': 1.0, 'revive': 1.0, 'low': -1.5}


def items_of(h):
    seen = set()
    for key, text in list(h['lines'].items()) + [(f'click{i + 1}', v) for i, v in enumerate(h['clicks'])]:
        if text and text not in seen:
            seen.add(text)
            yield key, text


def gen(a):
    sys.path.insert(0, a.cosy); sys.path.insert(0, os.path.join(a.cosy, 'third_party', 'Matcha-TTS'))
    import torch, torchaudio
    torch.set_num_threads(a.threads)
    from cosyvoice.cli.cosyvoice import AutoModel
    m = AutoModel(model_dir=a.model)
    for h in json.load(open(os.path.join(VOICE, 'lines.json'), encoding='utf-8')):
        hid = h['id']
        if a.only and hid != a.only:
            continue
        os.makedirs(os.path.join(a.out, hid), exist_ok=True)
        for key, text in items_of(h):
            ins = f'用{TONE[hid]}的声音，{EMO[key]}<|endofprompt|>'
            segs = text.split('——') if hid == 'twin' and '——' in text else [text]   # 双子：姐姐 / 妹妹按「——」交替
            for take in range(2):
                out = os.path.join(a.out, hid, f'{key}_{take}.wav')
                if os.path.exists(out):
                    continue
                t0, wavs = time.time(), []
                for si, seg in enumerate(segs):
                    if not seg.strip():
                        continue
                    pr = os.path.join(a.out, 'prompts', f"{hid}_{'b' if (hid == 'twin' and si % 2) else 'a'}.wav")
                    for j in m.inference_instruct2(seg, ins, pr, stream=False, speed=1.0 + 0.04 * take):
                        wavs.append(j['tts_speech'])
                    if si < len(segs) - 1:
                        wavs.append(torch.zeros(1, int(0.15 * m.sample_rate)))
                torchaudio.save(out, torch.cat(wavs, dim=1), m.sample_rate)
                print(hid, key, take, round(time.time() - t0, 1), 's', flush=True)
    print('COSY_DONE', flush=True)


def post(a):
    spec = importlib.util.spec_from_file_location('gv', os.path.join(ROOT, 'tools', 'gen-voices.py'))
    gv = importlib.util.module_from_spec(spec); spec.loader.exec_module(gv)
    import sherpa_onnx, soundfile as sf
    rec = sherpa_onnx.OfflineRecognizer.from_paraformer(paraformer=f'{a.asr}/model.int8.onnx', tokens=f'{a.asr}/tokens.txt', num_threads=4)
    cast = json.load(open(os.path.join(VOICE, 'cast.json'), encoding='utf-8'))
    rp = os.path.join(VOICE, 'report.json')
    report = json.load(open(rp, encoding='utf-8')) if os.path.exists(rp) else {}
    used = kept = 0
    with tempfile.TemporaryDirectory() as tmp:
        for h in json.load(open(os.path.join(VOICE, 'lines.json'), encoding='utf-8')):
            hid = h['id']
            if a.only and hid != a.only:
                continue
            c = cast[hid]
            for key, text in items_of(h):
                takes = []
                for t in range(2):
                    wav = os.path.join(a.out, hid, f'{key}_{t}.wav')
                    if not os.path.exists(wav):
                        continue
                    mp3 = os.path.join(tmp, f'{hid}_{key}_{t}.mp3')
                    gv.post(wav, mp3, 0, [gv.HERO_FX[c.get('fx', 'none')], POST_FX.get(key, '')], GAIN.get(key, 0) + c.get('gain', 0))
                    chk = os.path.join(tmp, f'{hid}_{key}_{t}_chk.wav')
                    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-ar', '16000', '-ac', '1', chk], check=True)
                    y, sr = sf.read(chk, dtype='float32')
                    s = rec.create_stream(); s.accept_waveform(sr, y); rec.decode_stream(s); hyp = s.result.text
                    takes.append(dict(mp3=mp3, hyp=hyp, per=gv.per(text, hyp), cer=gv.cer(text, hyp), expr=gv.f0_range(y, sr), t=t, sec=len(y) / sr))
                if not takes:
                    continue
                bp = min(x['per'] for x in takes)
                best = max([x for x in takes if x['per'] <= bp + 0.05], key=lambda x: x['expr'] - 3 * x['cer'])
                old = report.get(hid, {}).get(text)
                if best['per'] > a.max_per and old and old.get('per', 1) < best['per']:
                    kept += 1
                    report[hid][text] = dict(old, engine='kokoro')
                    print('保留原录音', hid, key, text, 'cosy', round(best['per'], 2), '原', old.get('per'), flush=True)
                    continue
                out = os.path.join(VOICE, hid, f'{key}.mp3')
                os.replace(best['mp3'], out); used += 1
                report.setdefault(hid, {})[text] = {'type': key, 'engine': 'cosyvoice2', 'asr': best['hyp'], 'cer': round(best['cer'], 3), 'per': round(best['per'], 3),
                                                    'take': f"cosy×{1 + 0.04 * best['t']:.2f}", 'expr': round(best['expr'], 2), 'sec': round(best['sec'], 2)}
                print(hid, key, text, report[hid][text], flush=True)
    json.dump(report, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    allv = [v for hh in report.values() for v in hh.values()]
    n = len(allv)
    print('换成 CosyVoice2', used, '条；保留原录音', kept, '条；全部', n, '条 · 拼音错误率', round(sum(v['per'] for v in allv) / n, 3),
          '· 拼音全对', sum(1 for v in allv if v['per'] == 0), '· 平均音高起伏(半音)', round(sum(v.get('expr', 0) for v in allv) / n, 2))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    g = sub.add_parser('gen'); g.add_argument('--cosy', required=True); g.add_argument('--model', required=True); g.add_argument('--out', required=True)
    g.add_argument('--only'); g.add_argument('--threads', type=int, default=4)
    p = sub.add_parser('post'); p.add_argument('--asr', required=True); p.add_argument('--out', required=True); p.add_argument('--only')
    p.add_argument('--max-per', type=float, default=0.3)
    a = ap.parse_args()
    (gen if a.cmd == 'gen' else post)(a)


if __name__ == '__main__':
    sys.exit(main())
