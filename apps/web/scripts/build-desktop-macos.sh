#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Build a signed macOS Tauri artifact.

Usage:
  build-desktop-macos.sh [--check] [x86_64-apple-darwin|aarch64-apple-darwin]

Signing:
  Set APPLE_SIGNING_IDENTITY to a Developer ID/Application signing identity.
  Or set APPLE_CERTIFICATE and APPLE_CERTIFICATE_PASSWORD for CI import.
  Set MUXCHAT_MACOS_AD_HOC=1 to create an ad-hoc signed local artifact.
USAGE
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 2
  fi
}

host_triple() {
  rustc -Vv | awk '/^host:/ { print $2 }'
}

validate_target() {
  case "$1" in
    x86_64-apple-darwin | aarch64-apple-darwin) ;;
    *)
      echo "Unsupported macOS target: $1" >&2
      exit 2
      ;;
  esac
}

validate_signing() {
  if [[ "${MUXCHAT_MACOS_AD_HOC:-}" == "1" ]]; then
    export APPLE_SIGNING_IDENTITY="-"
    return
  fi
  if [[ -n "${APPLE_CERTIFICATE:-}" && -z "${APPLE_CERTIFICATE_PASSWORD:-}" ]]; then
    echo "APPLE_CERTIFICATE_PASSWORD is required when APPLE_CERTIFICATE is set" >&2
    exit 2
  fi
  if [[ -z "${APPLE_SIGNING_IDENTITY:-}" && -z "${APPLE_CERTIFICATE:-}" ]]; then
    echo "Set APPLE_SIGNING_IDENTITY, APPLE_CERTIFICATE, or MUXCHAT_MACOS_AD_HOC=1" >&2
    exit 2
  fi
}

check_only=false
target="${TAURI_TARGET_TRIPLE:-}"
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

require_command go
require_command pnpm
require_command rustc

if [[ -n "$target" ]]; then
  validate_target "$target"
elif [[ "$check_only" == "false" ]]; then
  target="$(host_triple)"
  validate_target "$target"
fi

if [[ "$check_only" == "true" ]]; then
  exit 0
fi
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS desktop artifacts must be built on macOS" >&2
  exit 2
fi

validate_signing

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${web_dir}/../.." && pwd)"

cd "${repo_root}"
TAURI_TARGET_TRIPLE="$target" pnpm --filter @muxchat/web desktop:sidecar "$target"

cd "${web_dir}"
tauri_args=(--target "$target" --ci)
if [[ "${MUXCHAT_MACOS_SKIP_STAPLING:-}" == "1" ]]; then
  tauri_args+=(--skip-stapling)
fi
pnpm exec tauri build "${tauri_args[@]}"
