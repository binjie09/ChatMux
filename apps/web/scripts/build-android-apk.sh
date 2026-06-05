#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
web_dir="$repo_root/apps/web"
artifact_dir="${CHATMUX_ANDROID_ARTIFACT_DIR:-$repo_root/.tmp/artifacts/android}"
artifact="$artifact_dir/ChatMux-android-debug.apk"

cd "$repo_root"
pnpm --filter @chatmux/web mobile:sync
"$web_dir/scripts/build-android-gateway.sh"

cd "$web_dir/android"
./gradlew :app:assembleDebug

rm -rf "$artifact_dir"
mkdir -p "$artifact_dir"
cp "$web_dir/android/app/build/outputs/apk/debug/app-debug.apk" "$artifact"

cd "$artifact_dir"
sha256sum "$(basename "$artifact")" > SHA256SUMS.txt
unzip -Z1 "$artifact" > apk-contents.txt

grep -Fx "assets/public/index.html" apk-contents.txt >/dev/null
grep -Fx "lib/arm64-v8a/libchatmux_gateway.so" apk-contents.txt >/dev/null
grep -Fx "lib/x86_64/libchatmux_gateway.so" apk-contents.txt >/dev/null
rm apk-contents.txt

echo "Android APK artifact:"
find "$artifact_dir" -maxdepth 1 -type f -printf "%p %s bytes\n" | sort
