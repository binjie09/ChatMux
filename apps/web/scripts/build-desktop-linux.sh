#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Build a Linux x86_64 Tauri artifact.

Usage:
  build-desktop-linux.sh [--check] [x86_64-unknown-linux-gnu]
USAGE
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 2
  fi
}

validate_target() {
  case "$1" in
    x86_64-unknown-linux-gnu) ;;
    *)
      echo "Unsupported Linux target: $1" >&2
      exit 2
      ;;
  esac
}

copy_linux_artifacts() {
  local bundle_root="$1"
  local artifact_dir="$2"
  local copied=false

  if [[ ! -d "$bundle_root" ]]; then
    echo "Missing Linux bundle directory: $bundle_root" >&2
    exit 1
  fi

  rm -rf "$artifact_dir"
  mkdir -p "$artifact_dir"

  while IFS= read -r -d '' path; do
    cp "$path" "$artifact_dir/"
    copied=true
  done < <(find "$bundle_root" -type f \( \
    -name "*.AppImage" -o \
    -name "*.deb" -o \
    -name "*.rpm" -o \
    -name "*.tar.gz" -o \
    -name "*.sig" \
  \) -print0)

  if [[ "$copied" != "true" ]]; then
    echo "No Linux bundle artifacts were produced under $bundle_root" >&2
    exit 1
  fi
}

write_artifact_checksums() {
  local artifact_dir="$1"

  (
    cd "$artifact_dir"
    find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -print0 \
      | sort -z \
      | xargs -0 sha256sum > SHA256SUMS.txt
  )
}

check_sidecar_cgo() {
  local sidecar="$1"

  if grep -a -q "go-sqlite3 requires cgo" "$sidecar"; then
    echo "Linux gateway was built without cgo; sqlite would fail at runtime" >&2
    exit 1
  fi
}

check_only=false
target="${TAURI_TARGET_TRIPLE:-x86_64-unknown-linux-gnu}"
for arg in "$@"; do
  case "$arg" in
    --)
      ;;
    --help | -h)
      usage
      exit 0
      ;;
    --check)
      check_only=true
      ;;
    *)
      target="$arg"
      ;;
  esac
done

validate_target "$target"

if [[ "$check_only" == "true" ]]; then
  exit 0
fi
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Linux desktop artifacts must be built on Linux" >&2
  exit 2
fi

require_command go
require_command pnpm
require_command rustc
require_command sha256sum

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${web_dir}/../.." && pwd)"
sidecar="${repo_root}/apps/web/src-tauri/binaries/chatmux-gateway-${target}"

"${web_dir}/scripts/ensure-tauri-icons.sh"

cd "$repo_root"
TAURI_TARGET_TRIPLE="$target" pnpm --filter @chatmux/web desktop:sidecar "$target"
check_sidecar_cgo "$sidecar"

cd "$web_dir"
pnpm exec tauri build --target "$target" --ci --bundles deb appimage

bundle_root="${web_dir}/src-tauri/target/${target}/release/bundle"
artifact_dir="${repo_root}/.tmp/artifacts/linux-${target}"
copy_linux_artifacts "$bundle_root" "$artifact_dir"
write_artifact_checksums "$artifact_dir"

echo "Linux artifact:"
find "$artifact_dir" -maxdepth 1 -type f -printf "%p %s bytes\n" | sort
