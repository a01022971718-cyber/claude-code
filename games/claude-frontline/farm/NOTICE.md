# 英语田园（豆豆的田园厨房 · 造月之路版）的第三方代码与素材

- `vendor/phaser.min.js`：[Phaser](https://phaser.io) 3.90，MIT 许可，见 `vendor/LICENSE-phaser.md`。
- `vendor/vosk.js`：[vosk-browser](https://github.com/ccoreilly/vosk-browser) 0.0.8（Vosk / Kaldi 的 WebAssembly 版，加了下载进度补丁），Apache-2.0。口语评分模型 `vosk-model-small-en-us-0.15`（Apache-2.0）不随包分发，第一次使用时从 vosk-browser 作者的 GitHub Pages 下载（约 40 MB），之后存在本机。
- `voice.js`：示范发音录音，由 Kokoro-82M（Apache-2.0）预先合成。
- 页面里内联的字体：Fusion Pixel（子集改名为 "Doudou Pixel CJK"）、Jersey 10，均为 SIL OFL 1.1。
- 场景画、作物、小动物客人等美术：主创提供。
- `zy/`：《造月之路》的界面与引擎（主题英雄、像素脉冲舞台、英雄主题曲、像素图标），由 `tools/farm-zy-build.mjs` 生成。
