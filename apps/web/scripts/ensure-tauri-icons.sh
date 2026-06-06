#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "${script_dir}/.." && pwd)"
source_icon="${web_dir}/public/icons/pwa-512.png"
icons_dir="${web_dir}/src-tauri/icons"

if [[ ! -f "$source_icon" ]]; then
  echo "Missing source icon: $source_icon" >&2
  exit 2
fi

if [[ -f "${icons_dir}/icon.icns" && -f "${icons_dir}/32x32.png" ]]; then
  exit 0
fi

mkdir -p "$icons_dir"
cd "$web_dir"
pnpm exec tauri icon "$source_icon" --output "$icons_dir"
