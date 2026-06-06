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
  Set CHATMUX_MACOS_AD_HOC=1 to create an ad-hoc signed local artifact.
Updates:
  Set CHATMUX_CREATE_UPDATER_ARTIFACTS=1 and TAURI_SIGNING_PRIVATE_KEY to
  generate updater archives and .sig files during the Tauri build.
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
  if [[ "${CHATMUX_MACOS_AD_HOC:-}" == "1" ]]; then
    export APPLE_SIGNING_IDENTITY="-"
    return
  fi
  if [[ -n "${APPLE_CERTIFICATE:-}" && -z "${APPLE_CERTIFICATE_PASSWORD:-}" ]]; then
    echo "APPLE_CERTIFICATE_PASSWORD is required when APPLE_CERTIFICATE is set" >&2
    exit 2
  fi
  if [[ -z "${APPLE_SIGNING_IDENTITY:-}" && -z "${APPLE_CERTIFICATE:-}" ]]; then
    echo "Set APPLE_SIGNING_IDENTITY, APPLE_CERTIFICATE, or CHATMUX_MACOS_AD_HOC=1" >&2
    exit 2
  fi
}

write_updater_config() {
  local config_path="$1"
  cat >"$config_path" <<'JSON'
{
  "bundle": {
    "createUpdaterArtifacts": true
  }
}
JSON
}

configure_updater_artifacts() {
  if [[ "${CHATMUX_CREATE_UPDATER_ARTIFACTS:-}" != "1" ]]; then
    return
  fi
  if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    echo "TAURI_SIGNING_PRIVATE_KEY is required for updater artifacts" >&2
    exit 2
  fi
  local config_path
  config_path="$(mktemp "${TMPDIR:-/tmp}/chatmux-tauri-updater.XXXXXX.json")"
  temp_configs+=("$config_path")
  write_updater_config "$config_path"
  tauri_config_args+=(--config "$config_path")
}

copy_macos_artifacts() {
  local bundle_root="$1"
  local artifact_dir="$2"
  local copied=false

  if [[ ! -d "$bundle_root" ]]; then
    echo "Missing macOS bundle directory: $bundle_root" >&2
    exit 1
  fi

  rm -rf "$artifact_dir"
  mkdir -p "$artifact_dir"

  while IFS= read -r -d '' path; do
    cp "$path" "$artifact_dir/"
    copied=true
  done < <(find "$bundle_root" -type f \( \
    -name "*.dmg" -o \
    -name "*.pkg" -o \
    -name "*.zip" -o \
    -name "*.tar.gz" -o \
    -name "*.sig" \
  \) -print0)

  if [[ -d "$bundle_root/macos" ]]; then
    while IFS= read -r -d '' path; do
      cp -R "$path" "$artifact_dir/"
      copied=true
    done < <(find "$bundle_root/macos" -maxdepth 1 -type d -name "*.app" -print0)
  fi

  if [[ "$copied" != "true" ]]; then
    echo "No macOS bundle artifacts were produced under $bundle_root" >&2
    exit 1
  fi
}

write_artifact_checksums() {
  local artifact_dir="$1"

  (
    cd "$artifact_dir"
    find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -print0 \
      | sort -z \
      | while IFS= read -r -d '' path; do
          shasum -a 256 "$path"
        done > SHA256SUMS.txt
  )
}

cleanup() {
  for path in "${temp_configs[@]}"; do
    rm -f "$path"
  done
}

check_only=false
target="${TAURI_TARGET_TRIPLE:-}"
tauri_config_args=()
temp_configs=()
trap cleanup EXIT
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
require_command shasum

validate_signing
configure_updater_artifacts

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${web_dir}/../.." && pwd)"

"${web_dir}/scripts/ensure-tauri-icons.sh"

cd "${repo_root}"
TAURI_TARGET_TRIPLE="$target" pnpm --filter @chatmux/web desktop:sidecar "$target"

cd "${web_dir}"
tauri_args=(--target "$target" --ci)
tauri_args+=("${tauri_config_args[@]}")
if [[ "${CHATMUX_MACOS_SKIP_STAPLING:-}" == "1" ]]; then
  tauri_args+=(--skip-stapling)
fi
pnpm exec tauri build "${tauri_args[@]}"

bundle_root="${web_dir}/src-tauri/target/${target}/release/bundle"
artifact_dir="${repo_root}/.tmp/artifacts/macos-${target}"
copy_macos_artifacts "$bundle_root" "$artifact_dir"
write_artifact_checksums "$artifact_dir"

echo "macOS artifact:"
find "$artifact_dir" -maxdepth 1 -mindepth 1 -print | sort
