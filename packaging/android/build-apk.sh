#!/usr/bin/env bash
set -euo pipefail

restore_ownership() {
  if [[ -n "${HOST_UID:-}" && -n "${HOST_GID:-}" ]]; then
    chown -R "${HOST_UID}:${HOST_GID}" \
      /workspace/.tmp/artifacts \
      /workspace/apps/web/dist \
      /workspace/apps/web/android/.gradle \
      /workspace/apps/web/android/app/build \
      /workspace/apps/web/android/app/src/main/assets \
      /workspace/apps/web/android/app/src/main/jniLibs \
      /workspace/node_modules \
      /workspace/apps/web/node_modules \
      /workspace/packages/shared/node_modules 2>/dev/null || true
  fi
}

trap restore_ownership EXIT

cd /workspace

git config --global --add safe.directory /workspace

pnpm config set store-dir "${PNPM_STORE_DIR:-/pnpm/store}"
pnpm install --frozen-lockfile
pnpm --filter @chatmux/web mobile:build:android-apk
