#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
android_api="${CHATMUX_ANDROID_API:-24}"
abi_list="${CHATMUX_ANDROID_ABIS:-arm64-v8a x86_64}"
out_root="$repo_root/apps/web/android/app/src/main/jniLibs"

host_tag() {
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) echo "linux-x86_64" ;;
    Darwin-arm64) echo "darwin-arm64" ;;
    Darwin-x86_64) echo "darwin-x86_64" ;;
    *) echo "unsupported Android NDK host: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
}

ndk_home() {
  if [[ -n "${ANDROID_NDK_HOME:-}" ]]; then
    echo "$ANDROID_NDK_HOME"
    return
  fi
  if [[ -n "${ANDROID_NDK_ROOT:-}" ]]; then
    echo "$ANDROID_NDK_ROOT"
    return
  fi
  local sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [[ -n "$sdk_root" && -d "$sdk_root/ndk" ]]; then
    find "$sdk_root/ndk" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -1
    return
  fi
  echo "ANDROID_NDK_HOME or ANDROID_HOME with ndk/ is required" >&2
  exit 1
}

build_gateway_abi() {
  local abi="$1"
  local ndk="$2"
  local goarch="" goarm="" cc_prefix=""
  case "$abi" in
    arm64-v8a) goarch="arm64"; cc_prefix="aarch64-linux-android" ;;
    x86_64) goarch="amd64"; cc_prefix="x86_64-linux-android" ;;
    armeabi-v7a) goarch="arm"; goarm="7"; cc_prefix="armv7a-linux-androideabi" ;;
    *) echo "unsupported Android ABI: $abi" >&2; exit 1 ;;
  esac

  local toolchain="$ndk/toolchains/llvm/prebuilt/$(host_tag)/bin"
  local cc="$toolchain/${cc_prefix}${android_api}-clang"
  local cxx="$toolchain/${cc_prefix}${android_api}-clang++"
  local out_dir="$out_root/$abi"
  local out_file="$out_dir/libchatmux_gateway.so"
  [[ -x "$cc" ]] || { echo "missing Android compiler: $cc" >&2; exit 1; }
  mkdir -p "$out_dir"
  (
    cd "$repo_root/services/gateway"
    build_env=(GOOS=android GOARCH="$goarch" CGO_ENABLED=1 CC="$cc" CXX="$cxx")
    if [[ -n "$goarm" ]]; then
      build_env+=(GOARM="$goarm")
    fi
    env "${build_env[@]}" go build -buildmode=pie -ldflags="-s -w" -o "$out_file" ./cmd/chatmux-gateway
  )
  if grep -a -q "go-sqlite3 requires cgo" "$out_file"; then
    echo "Android gateway for $abi was built without cgo; sqlite would fail at runtime" >&2
    exit 1
  fi
  echo "$out_file"
}

ndk="$(ndk_home)"
read -r -a abis <<< "$abi_list"
for abi in "${abis[@]}"; do
  build_gateway_abi "$abi" "$ndk"
done
