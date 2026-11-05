# 第三方代码与素材

- `phaser.min.js`：[Phaser](https://phaser.io) 3.90.0（npm 包里的 `dist/phaser-arcade-physics.min.js`，不含 Matter 物理），MIT 许可，见 `LICENSE-phaser.md`。农场画面用它渲染。
- `vosk.js`：[vosk-browser](https://github.com/ccoreilly/vosk-browser) 0.0.8（npm 包里的 `dist/vosk.js`），Vosk / Kaldi 的 WebAssembly 版本，Apache-2.0 许可。
  **改动**：用 `../tools/patch_vosk.py` 给内嵌的 worker 加了下载进度上报（`dlprogress` 消息），其余未改。
- 识别模型 `vosk-model-small-en-us-0.15`（[alphacephei](https://alphacephei.com/vosk/models)，Apache-2.0）不放在仓库里。游戏先找同目录下的 `vosk/vosk-model-small-en-us-0.15.tar.gz`，找不到就从 vosk-browser 作者的 GitHub Pages 下载同一个模型，下载一次后存在浏览器里。
- `fonts/fusion-pixel-12px-proportional-sc.woff2`：[Fusion Pixel Font](https://github.com/TakWolf/fusion-pixel-font)（经 Fontsource 打包），SIL OFL 1.1，保留字体名 "Fusion Pixel"。游戏里内联的是只含用到的字的子集，按 OFL 要求改名为 "Doudou Pixel CJK"。许可证见 `fonts/OFL-fusion-pixel.txt`。
- `fonts/jersey10-latin.woff2`：[Jersey 10](https://github.com/scfried/soft-type-jersey)（Google Fonts），SIL OFL 1.1，许可证见 `fonts/OFL-jersey10.txt`。
- `../voice.js` 里的示范发音由 [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)（Apache-2.0）通过 kokoro-onnx 合成。

## 发音引擎（vendor/kokoro/）

- kokoro-js 1.2.1（Apache-2.0，https://github.com/hexgrad/kokoro 的浏览器版，作者 Xenova），打包了 transformers.js（Apache-2.0）和 phonemizer（espeak-ng，GPL-3.0）。`kokoro.web.js` 用 `tools/patch_kokoro.py` 改成从本网站下载模型。
- onnxruntime-web 1.22（MIT）：`ort-wasm-simd-threaded.jsep.*`。
- Kokoro-82M v1.0 ONNX 模型和 af_heart 声音（Apache-2.0，hexgrad / onnx-community）：`onnx-community/Kokoro-82M-v1.0-ONNX/`。

