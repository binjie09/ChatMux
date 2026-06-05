#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../../.." && pwd)"
target_triple="${TAURI_TARGET_TRIPLE:-${1:-}}"

if [[ -z "$target_triple" ]]; then
  target_triple="$(rustc -Vv | awk '/^host:/ { print $2 }')"
fi

goos=""
goarch=""
extension=""
cgo_enabled=""
cc=""
cxx=""
ldflags=()
case "$target_triple" in
  x86_64-apple-darwin) goos="darwin"; goarch="amd64" ;;
  aarch64-apple-darwin) goos="darwin"; goarch="arm64" ;;
  x86_64-pc-windows-*)
    goos="windows"
    goarch="amd64"
    extension=".exe"
    cgo_enabled="1"
    cc="x86_64-w64-mingw32-gcc"
    cxx="x86_64-w64-mingw32-g++"
    ldflags=(-ldflags '-linkmode external -extldflags "-static"')
    ;;
  aarch64-pc-windows-*)
    goos="windows"
    goarch="arm64"
    extension=".exe"
    cgo_enabled="1"
    cc="aarch64-w64-mingw32-gcc"
    cxx="aarch64-w64-mingw32-g++"
    ldflags=(-ldflags '-linkmode external -extldflags "-static"')
    ;;
  x86_64-unknown-linux-*) goos="linux"; goarch="amd64" ;;
  aarch64-unknown-linux-*) goos="linux"; goarch="arm64" ;;
  *)
    echo "unsupported Tauri sidecar target: $target_triple" >&2
    exit 1
    ;;
esac

out_dir="$repo_root/apps/web/src-tauri/binaries"
out_file="$out_dir/chatmux-gateway-$target_triple$extension"
mkdir -p "$out_dir"

(
  cd "$repo_root/services/gateway"
  build_env=(GOOS="$goos" GOARCH="$goarch")
  if [[ -n "$cgo_enabled" ]]; then
    build_env+=(CGO_ENABLED="$cgo_enabled" CC="$cc" CXX="$cxx")
  fi
  env "${build_env[@]}" go build "${ldflags[@]}" -o "$out_file" ./cmd/chatmux-gateway
)

echo "$out_file"
