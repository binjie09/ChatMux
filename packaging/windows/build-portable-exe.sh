#!/usr/bin/env bash
set -euo pipefail

target="${TAURI_TARGET_TRIPLE:-x86_64-pc-windows-msvc}"
artifact_dir="/workspace/.tmp/artifacts/windows-${target}"

restore_ownership() {
  if [[ -n "${HOST_UID:-}" && -n "${HOST_GID:-}" ]]; then
    chown -R "${HOST_UID}:${HOST_GID}" \
      /workspace/.tmp/artifacts \
      /workspace/apps/web/dist \
      /workspace/apps/web/src-tauri/binaries \
      /workspace/apps/web/src-tauri/icons \
      /workspace/apps/web/src-tauri/target \
      /workspace/node_modules \
      /workspace/apps/web/node_modules \
      /workspace/packages/shared/node_modules 2>/dev/null || true
  fi
}

trap restore_ownership EXIT

cd /workspace

git config --global --add safe.directory /workspace

mkdir -p apps/web/src-tauri/icons
if [[ ! -f apps/web/src-tauri/icons/icon.ico ]]; then
  node <<'NODE'
const fs = require("fs");
const pngPath = "apps/web/public/icons/pwa-512.png";
const outPath = "apps/web/src-tauri/icons/icon.ico";
const png = fs.readFileSync(pngPath);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);
entry.writeUInt8(0, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);
fs.writeFileSync(outPath, Buffer.concat([header, entry, png]));
NODE
fi

pnpm config set store-dir "${PNPM_STORE_DIR:-/pnpm/store}"
pnpm install --frozen-lockfile
pnpm --filter @chatmux/web build
TAURI_TARGET_TRIPLE="${target}" pnpm --filter @chatmux/web desktop:sidecar "${target}"

if strings "apps/web/src-tauri/binaries/chatmux-gateway-${target}.exe" | grep -q "go-sqlite3 requires cgo"; then
  echo "Windows gateway was built without cgo; sqlite would fail at runtime" >&2
  exit 1
fi

cd /workspace/apps/web/src-tauri
TAURI_ENV_PLATFORM_VERSION=10.0.22621 \
TAURI_ENV_FAMILY=windows \
TAURI_ENV_TARGET_TRIPLE="${target}" \
TAURI_ENV_ARCH=x86_64 \
TAURI_ENV_PLATFORM=windows \
cargo xwin build --bin chatmux --features tauri/custom-protocol --release --target "${target}"

rm -rf "${artifact_dir}"
mkdir -p "${artifact_dir}"
cp "/workspace/apps/web/src-tauri/target/${target}/release/chatmux.exe" "${artifact_dir}/ChatMux.exe"

cd "${artifact_dir}"
sha256sum ChatMux.exe > SHA256SUMS.txt

echo "Windows portable exe artifact:"
find "${artifact_dir}" -maxdepth 1 -type f -printf "%p %s bytes\n" | sort
