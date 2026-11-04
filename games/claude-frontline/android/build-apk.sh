#!/usr/bin/env bash
# 不依赖 Gradle / Android Studio 的最小 APK 构建脚本。
# 需要：JDK 17+、Android build-tools 34（aapt2 / d8 / zipalign / apksigner）、platform-34 的 android.jar、Node.js。
#   BT=/path/to/build-tools/34.0.0  ANDROID_JAR=/path/to/platforms/android-34/android.jar  ./android/build-apk.sh
# 输出：release/xs-frontline.apk（调试签名，可直接安装；上架应用商店需要换成你自己的发布签名）
set -euo pipefail
cd "$(dirname "$0")/.."
: "${BT:?请设置 BT=build-tools 目录}"; : "${ANDROID_JAR:?请设置 ANDROID_JAR=android.jar 路径}"
OUT=android/build; rm -rf "$OUT"; mkdir -p "$OUT"/{res,classes,dex,assets} release
node build.mjs
cp dist/claude-frontline.html "$OUT/assets/index.html"
"$BT/aapt2" compile --dir android/res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$ANDROID_JAR" --manifest android/AndroidManifest.xml \
  --min-sdk-version 24 --target-sdk-version 34 -A "$OUT/assets" "$OUT/res.zip" --java "$OUT/gen" --auto-add-overlay
javac -source 8 -target 8 -nowarn -Xlint:-options -bootclasspath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find android/src "$OUT/gen" -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$ANDROID_JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q -j ../unsigned.apk classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
KS=${KEYSTORE:-android/debug.keystore}  # 固定调试签名：以后的版本可以直接覆盖安装，存档不丢
if [ ! -f "$KS" ]; then keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias xs -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=X-S Frontline Debug" >/dev/null; fi
"$BT/apksigner" sign --v4-signing-enabled false --ks "$KS" --ks-pass pass:${KS_PASS:-android} --ks-key-alias ${KS_ALIAS:-xs} --out release/xs-frontline.apk "$OUT/aligned.apk"
"$BT/apksigner" verify release/xs-frontline.apk && ls -l release/xs-frontline.apk
