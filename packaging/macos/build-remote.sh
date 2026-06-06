#!/usr/bin/env bash
set -euo pipefail

remote="${CHATMUX_MACOS_BUILDER:-}"
remote_dir="${CHATMUX_MACOS_REMOTE_DIR:-chatmux-build}"
ssh_port="${CHATMUX_MACOS_SSH_PORT:-22}"
remote_env_names=(
  APPLE_API_ISSUER
  APPLE_API_KEY
  APPLE_API_KEY_PATH
  APPLE_CERTIFICATE
  APPLE_CERTIFICATE_PASSWORD
  APPLE_ID
  APPLE_PASSWORD
  APPLE_PROVIDER_SHORT_NAME
  APPLE_SIGNING_IDENTITY
  APPLE_TEAM_ID
  CHATMUX_CREATE_UPDATER_ARTIFACTS
  CHATMUX_MACOS_AD_HOC
  CHATMUX_MACOS_SKIP_STAPLING
  PNPM_STORE_DIR
  TAURI_SIGNING_PRIVATE_KEY
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  TAURI_TARGET_TRIPLE
)

restore_ownership() {
  if [[ -n "${HOST_UID:-}" && -n "${HOST_GID:-}" ]]; then
    chown -R "${HOST_UID}:${HOST_GID}" /workspace/.tmp/artifacts 2>/dev/null || true
  fi
}

fail_missing_builder() {
  cat >&2 <<'ERROR'
CHATMUX_MACOS_BUILDER is required.

macOS desktop bundles need Apple's macOS tooling for app bundles, signing, DMG
creation, and notarization. Use a macOS builder reachable over SSH, for example:

  CHATMUX_MACOS_BUILDER=builder@example-mac.local \
  CHATMUX_MACOS_AD_HOC=1 \
  pnpm desktop:build:macos
ERROR
  exit 2
}

validate_remote_dir() {
  case "$remote_dir" in
    "" | -*)
      echo "Invalid CHATMUX_MACOS_REMOTE_DIR: $remote_dir" >&2
      exit 2
      ;;
  esac
  if [[ ! "$remote_dir" =~ ^[A-Za-z0-9._/-]+$ ]]; then
    echo "CHATMUX_MACOS_REMOTE_DIR may only contain letters, numbers, dots, dashes, underscores, and slashes" >&2
    exit 2
  fi
}

resolve_ssh_key() {
  local configured="${CHATMUX_MACOS_SSH_KEY:-}"
  local candidate=""

  if [[ -n "$configured" ]]; then
    if [[ -f "$configured" ]]; then
      printf '%s\n' "$configured"
      return
    fi
    candidate="/root/.ssh/host/$(basename "$configured")"
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
    echo "Configured SSH key was not found: $configured" >&2
    exit 2
  fi

  for candidate in \
    /root/.ssh/host/id_ed25519 \
    /root/.ssh/host/id_ecdsa \
    /root/.ssh/host/id_rsa; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  return 0
}

build_ssh_args() {
  local key="$1"
  ssh_args=(-p "$ssh_port")
  ssh_args+=(-o BatchMode=yes)
  ssh_args+=(-o StrictHostKeyChecking=accept-new)
  ssh_args+=(-o UserKnownHostsFile=/root/.ssh/known_hosts)
  if [[ -n "$key" ]]; then
    ssh_args+=(-i "$key" -o IdentitiesOnly=yes)
  fi
}

copy_ssh_key() {
  local key="$1"
  local copied_key="/root/.ssh/chatmux_macos_builder_key"

  if [[ -z "$key" ]]; then
    return
  fi

  cp "$key" "$copied_key"
  chmod 600 "$copied_key"
  printf '%s\n' "$copied_key"
}

build_rsync_ssh_command() {
  local command=""
  local part=""

  printf -v command '%q' ssh
  for part in "${ssh_args[@]}"; do
    command+=" "
    printf -v part '%q' "$part"
    command+="$part"
  done
  printf '%s\n' "$command"
}

pass_env() {
  local name="$1"

  if [[ -n "${!name:-}" ]]; then
    printf 'export %s=%q\n' "$name" "${!name}"
  fi
}

pass_remote_env() {
  local name=""

  for name in "${remote_env_names[@]}"; do
    pass_env "$name"
  done
}

run_remote_script() {
  {
    printf 'set -euo pipefail\n'
    printf 'remote_dir=%q\n' "$remote_dir"
    pass_remote_env
    cat <<'REMOTE'

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command on macOS builder: $1" >&2
    exit 2
  fi
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "CHATMUX_MACOS_BUILDER must point to a macOS host" >&2
  exit 2
fi

export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/local/go/bin:$PATH"

require_command bash
require_command corepack
require_command go
require_command hdiutil
require_command node
require_command rustc
require_command xcrun
xcrun --find clang >/dev/null
xcrun --find codesign >/dev/null

if [[ -n "${TAURI_TARGET_TRIPLE:-}" ]] && command -v rustup >/dev/null 2>&1; then
  rustup target add "$TAURI_TARGET_TRIPLE"
fi

cd "$remote_dir"
git config --global --add safe.directory "$PWD" >/dev/null 2>&1 || true
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm config set store-dir "${PNPM_STORE_DIR:-$HOME/Library/Caches/pnpm/store}"
pnpm install --frozen-lockfile
rm -rf .tmp/artifacts/macos-*
pnpm --filter @chatmux/web desktop:build:macos
REMOTE
  } | ssh "${ssh_args[@]}" "$remote" 'bash -s'
}

remote_artifact_dirs() {
  {
    printf 'set -euo pipefail\n'
    printf 'cd %q\n' "$remote_dir"
    printf "find .tmp/artifacts -maxdepth 1 -type d -name 'macos-*' -print\n"
  } | ssh "${ssh_args[@]}" "$remote" 'bash -s'
}

sync_repo_to_remote() {
  ssh "${ssh_args[@]}" "$remote" "mkdir -p $(printf '%q' "$remote_dir")"
  rsync -az --delete \
    --exclude '.git/' \
    --exclude '.tmp/' \
    --exclude 'node_modules/' \
    --exclude 'apps/web/node_modules/' \
    --exclude 'packages/shared/node_modules/' \
    --exclude 'apps/web/dist/' \
    --exclude 'apps/web/src-tauri/target/' \
    --exclude 'apps/web/src-tauri/binaries/chatmux-gateway-*' \
    -e "$rsync_ssh_command" \
    /workspace/ "${remote}:${remote_dir}/"
}

pull_artifacts() {
  local found=false
  local rel=""

  mkdir -p /workspace/.tmp/artifacts
  while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    found=true
    mkdir -p "/workspace/$rel"
    rsync -az --delete \
      -e "$rsync_ssh_command" \
      "${remote}:${remote_dir}/${rel}/" "/workspace/${rel}/"
  done < <(remote_artifact_dirs)

  if [[ "$found" != "true" ]]; then
    echo "No macOS artifacts were found on the builder" >&2
    exit 1
  fi
}

trap restore_ownership EXIT

if [[ -z "$remote" ]]; then
  fail_missing_builder
fi
validate_remote_dir

mkdir -p /root/.ssh
ssh_key="$(resolve_ssh_key)"
ssh_key="$(copy_ssh_key "$ssh_key")"
ssh_args=()
build_ssh_args "$ssh_key"
rsync_ssh_command="$(build_rsync_ssh_command)"

sync_repo_to_remote
run_remote_script
pull_artifacts

echo "macOS artifacts copied to:"
find /workspace/.tmp/artifacts -maxdepth 2 -mindepth 2 -path '*/macos-*/*' -print | sort
