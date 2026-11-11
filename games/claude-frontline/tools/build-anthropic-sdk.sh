#!/usr/bin/env bash
# 把 Anthropic 官方 SDK 打包成浏览器单文件 js/vendor/anthropic-sdk.min.js（离线可用、单文件 H5 和安卓 APK 都直接内嵌）。
# 用法：bash tools/build-anthropic-sdk.sh [版本号，默认 1.8.0]
set -euo pipefail
cd "$(dirname "$0")/.."
VER=${1:-1.8.0}
TMP=$(mktemp -d)
( cd "$TMP" && npm init -y >/dev/null && npm install --no-audit --no-fund "@anthropic-ai/sdk@$VER" esbuild >/dev/null \
  && printf 'import Anthropic from "@anthropic-ai/sdk";\nwindow.AnthropicSDK = Anthropic;\n' > entry.mjs \
  && npx esbuild entry.mjs --bundle --minify --format=iife --platform=browser --target=es2019 --outfile=out.js --legal-comments=eof )
{ printf '/*! @anthropic-ai/sdk %s — Anthropic 官方 TypeScript / JavaScript SDK，打包成浏览器单文件（window.AnthropicSDK）。\n * 许可证：Apache License 2.0（https://www.apache.org/licenses/LICENSE-2.0）；包含的 partial-json-parser 见 SDK 仓库 _vendor 目录。\n * 来源：https://github.com/anthropics/anthropic-sdk-typescript ；重新打包：bash tools/build-anthropic-sdk.sh\n * 游戏里只在 js/ai-claude.js 里使用。 */\n' "$VER"; cat "$TMP/out.js"; } > js/vendor/anthropic-sdk.min.js
rm -rf "$TMP"; ls -l js/vendor/anthropic-sdk.min.js
