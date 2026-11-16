#!/bin/bash
# 一键打 Android 安装包：先打网页版单文件，再用 Gradle 打 APK，输出到 dist/yujian-<版本>.apk
# 需要：Node、JDK 17+、Gradle 8.13+、Android SDK（platforms;android-35、build-tools;35.0.0），ANDROID_HOME 指向 SDK
set -e
cd "$(dirname "$0")/.."
node build.mjs
cd android
[ -f local.properties ] || echo "sdk.dir=${ANDROID_HOME:?先设置 ANDROID_HOME}" > local.properties
gradle assembleRelease --no-daemon -q
V=$(grep versionName app/build.gradle | sed -E "s/.*'(.*)'.*/\1/")
cp app/build/outputs/apk/release/app-release.apk ../dist/yujian-$V.apk
echo "已输出 dist/yujian-$V.apk"
