#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Build a macOS Tauri artifact.

Default path:
  CHATMUX_MACOS_BUILDER=user@mac-host CHATMUX_MACOS_AD_HOC=1 pnpm desktop:build:macos

The Docker Compose flow runs locally in a small rsync/ssh container, then builds
on the macOS host configured by CHATMUX_MACOS_BUILDER. The local machine does
not need Node, pnpm, Go, Rust, Xcode, or Tauri.

Optional:
  TAURI_TARGET_TRIPLE=x86_64-apple-darwin|aarch64-apple-darwin
  CHATMUX_MACOS_REMOTE_DIR=chatmux-build
  CHATMUX_MACOS_SSH_KEY=~/.ssh/id_ed25519
  CHATMUX_MACOS_SSH_PORT=22
USAGE
}

run_compose() {
  local compose_file="$1"
  shift

  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$compose_file" build macos-artifact
    CHATMUX_UID="$(id -u)" CHATMUX_GID="$(id -g)" \
      docker compose -f "$compose_file" run --rm macos-artifact "$@"
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$compose_file" build macos-artifact
    CHATMUX_UID="$(id -u)" CHATMUX_GID="$(id -g)" \
      docker-compose -f "$compose_file" run --rm macos-artifact "$@"
    return
  fi

  echo "Missing Docker Compose. Install the docker compose plugin or docker-compose." >&2
  exit 2
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
compose_file="${script_dir}/docker-compose.yml"

for arg in "$@"; do
  case "$arg" in
    --help | -h)
      usage
      exit 0
      ;;
    x86_64-apple-darwin | aarch64-apple-darwin)
      export TAURI_TARGET_TRIPLE="$arg"
      ;;
  esac
done

if [[ -n "${CHATMUX_MACOS_BUILDER:-}" ]]; then
  run_compose "$compose_file"
  exit 0
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "CHATMUX_MACOS_BUILDER is not set; using the local macOS toolchain." >&2
  exec bash "${repo_root}/apps/web/scripts/build-desktop-macos.sh" "$@"
fi

cat >&2 <<'ERROR'
macOS artifacts cannot be produced in a Linux-only Docker container.

Set CHATMUX_MACOS_BUILDER to a macOS host reachable over SSH and run:

  CHATMUX_MACOS_BUILDER=user@mac-host CHATMUX_MACOS_AD_HOC=1 pnpm desktop:build:macos
ERROR
exit 2
