#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Build a signed Windows Tauri artifact.

Usage:
  build-desktop-windows.sh [--check] [x86_64-pc-windows-msvc|aarch64-pc-windows-msvc]

Signing:
  Set MUXCHAT_WINDOWS_CERT_THUMBPRINT for a certificate in the Windows store.
  Optional: MUXCHAT_WINDOWS_DIGEST_ALGORITHM, MUXCHAT_WINDOWS_TIMESTAMP_URL.
  Or set MUXCHAT_WINDOWS_SIGN_COMMAND to use a custom signing command.
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
    x86_64-pc-windows-* | aarch64-pc-windows-*) ;;
    *)
      echo "Unsupported Windows target: $1" >&2
      exit 2
      ;;
  esac
}

validate_signing() {
  if [[ -n "${MUXCHAT_WINDOWS_SIGN_COMMAND:-}" ]]; then
    return
  fi
  if [[ -z "${MUXCHAT_WINDOWS_CERT_THUMBPRINT:-}" ]]; then
    echo "Set MUXCHAT_WINDOWS_CERT_THUMBPRINT or MUXCHAT_WINDOWS_SIGN_COMMAND" >&2
    exit 2
  fi
}

write_signing_config() {
  local config_path="$1"
  node - "$config_path" <<'NODE'
const fs = require("fs");
const [configPath] = process.argv.slice(2);
const signCommand = process.env.MUXCHAT_WINDOWS_SIGN_COMMAND;
const windows = signCommand ? {
  signCommand,
} : {
  certificateThumbprint: process.env.MUXCHAT_WINDOWS_CERT_THUMBPRINT,
  digestAlgorithm: process.env.MUXCHAT_WINDOWS_DIGEST_ALGORITHM || "sha256",
  timestampUrl: process.env.MUXCHAT_WINDOWS_TIMESTAMP_URL || "http://timestamp.digicert.com",
};
fs.writeFileSync(configPath, JSON.stringify({ bundle: { windows } }, null, 2));
NODE
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
require_command node
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
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN* | Windows_NT) ;;
  *)
    echo "Windows desktop artifacts must be built on Windows" >&2
    exit 2
    ;;
esac

validate_signing

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${web_dir}/../.." && pwd)"
config_path="$(mktemp "${TMPDIR:-/tmp}/muxchat-tauri-windows.XXXXXX.json")"
trap 'rm -f "$config_path"' EXIT
write_signing_config "$config_path"

cd "${repo_root}"
TAURI_TARGET_TRIPLE="$target" pnpm --filter @muxchat/web desktop:sidecar "$target"

cd "${web_dir}"
pnpm exec tauri build --target "$target" --config "$config_path" --ci
