# 第三方许可与声明

## 字体

部分标题字形取自 **Noto Sans SC Black** 与 **Noto Sans Black**（Google），以 [SIL Open Font License 1.1](https://openfontlicense.org) 授权。字形轮廓由 `tools/gen-brand-glyphs.py` 导出到 `js/brand-glyphs.js`。

主标题《造月之路》与游戏图标由项目主创提供的设计稿描摹而成（`tools/trace-logo.py`）。

## 商标与灵感来源

游戏中提到的 ChatGPT、OpenAI、Gemini、Google、Grok、xAI、Llama、Meta、DeepSeek、Kimi、月之暗面、通义千问、阿里巴巴、豆包、字节跳动、Claude、Anthropic 等名称是其各自所有者的商标，仅用于说明英雄性格的灵感来源。本游戏是独立的学习项目，与上述公司没有任何关联、合作或背书。所有英雄的名字与形象均为原创（v6 起原 X-S 已重新设计为「灯语」，见 `design/03-compliance.md` 第一部分第 1 项）。

公开发布时请把 `js/config.js` 的 `publicRelease` 设为 `true`。

## 音乐与音效

全部由 Web Audio API 实时合成，没有使用任何第三方录音或曲谱。玩家自行上传的音乐只在本机播放，版权由玩家自行负责。

## 英雄配音（v6）

`voice/` 与 `js/voice-data.js` 里的台词录音由下面的开源工具在本机离线生成，**不是真人配音演员的录音**：

| 用途 | 名称 | 许可 | 是否随游戏分发 |
|---|---|---|---|
| 语音合成模型 | [Kokoro-82M v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)（hexgrad；中文数据由龙猫数据提供）；sherpa-onnx 转换版 `csukuangfj/kokoro-int8-multi-lang-v1_1` | Apache-2.0 | 否，只分发生成好的 mp3 |
| 推理框架 | [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | Apache-2.0 | 否（只在 `tools/gen-voices.py` 里使用） |
| 质量校验（语音识别） | sherpa-onnx Paraformer 中文小模型 `csukuangfj/sherpa-onnx-paraformer-zh-small-2024-03-09` | 见模型发布页 | 否（只用来逐条「听」录音、挑最清楚的一条） |
| 后期 | FFmpeg（rubberband 变调、均衡、压缩、回声、响度标准化） | LGPL/GPL | 否 |

v7 起录音经过「分句演绎 + 情绪模板 + 挑 take」的加工（见 `tools/gen-voices.py` 说明），用的仍是上表的工具。v7 也评估过带情绪指令的 CosyVoice2-0.5B（Apache-2.0），但没有用于本版本的录音。

公开发布、商用前请再核对一次模型许可的最新版本；如果改用真人配音，替换 `voice/` 下的 mp3 后运行 `node tools/pack-voices.mjs` 即可。

## 英语田园（v8，`farm/`）

英语田园是主创之前做的「生而向星」英语农场（v1.10.0），按《造月之路》的 UI 宪法换了皮（`tools/farm-skin.mjs`、`farm/zaoyue-skin.css`、`farm/zaoyue-bridge.js`）。它自带的第三方代码与素材：

| 组件 | 许可 | 位置 / 说明 |
|---|---|---|
| [Phaser](https://phaser.io) 3.90.0（arcade 物理版） | MIT | `farm/vendor/phaser.min.js`，许可 `farm/vendor/LICENSE-phaser.md`（v8 补上，取自 phaserjs/phaser 仓库） |
| [JSZip](https://stuk.github.io/jszip/) | MIT 或 GPL-3.0 双许可（选 MIT） | `farm/vendor/jszip.min.js`，许可 `farm/vendor/LICENSE-jszip.md` |
| [vosk-browser](https://github.com/ccoreilly/vosk-browser) 0.0.8（Vosk / Kaldi 的 WebAssembly 版，加了下载进度补丁） | Apache-2.0 | `farm/vendor/vosk.js`；口语评分模型 vosk-model-small-en-us-0.15（Apache-2.0）不随包分发，第一次使用时下载 |
| kokoro-js 1.2.1（含 transformers.js） | Apache-2.0 | `farm/vendor/kokoro/` |
| └ 其中打包的 phonemizer（**espeak-ng**） | **GPL-3.0** | 随包分发时须满足 GPL-3.0，见 `design/03-compliance.md` 第一部分第 11 项 |
| onnxruntime-web 1.22 | MIT | `farm/vendor/kokoro/ort-wasm-simd-threaded.jsep.mjs` |
| Kokoro-82M v1.0 ONNX 模型、af_heart 等英文声音 | Apache-2.0 | 不随包分发，第一次使用时下载；`farm/voice.js` 里的示范发音由它预先合成 |
| 字体 Fusion Pixel（子集改名为 "Doudou Pixel CJK"）、Jersey 10、ZCOOL 快乐体、Noto Sans SC | SIL OFL 1.1 | `farm/vendor/fonts/OFL-*.txt`（Fusion Pixel 与 Jersey 10 的许可文件 v8 补上，取自各自仓库）。换皮后界面文字改用系统字体；字体文件仍原样保留在包里（不删原版资源） |
| 场景画、图标、豆豆等角色 | 主创提供 | 来自「生而向星」安装包 |

详细说明见 `farm/vendor/NOTICE-voice.md`。

## 参考

界面与玩法参考了王者荣耀、QQ 飞车、英雄联盟手游、金铲铲之战、魔兽争霸 3、部落冲突、海岛奇兵等游戏的交互思路，没有使用其任何素材、名称或角色。
