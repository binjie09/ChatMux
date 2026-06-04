#!/usr/bin/env bash
set -euo pipefail

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild is required to create TestFlight artifacts" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${web_dir}/../.." && pwd)"
build_dir="${CHATMUX_IOS_BUILD_DIR:-${web_dir}/build/ios}"
workspace="${CHATMUX_IOS_WORKSPACE:-${web_dir}/ios/App/App.xcworkspace}"
scheme="${CHATMUX_IOS_SCHEME:-App}"
archive_path="${build_dir}/ChatMux.xcarchive"
export_path="${build_dir}/testflight"
export_options="${CHATMUX_IOS_EXPORT_OPTIONS_PLIST:-${script_dir}/ios-export-options.plist}"

mkdir -p "${build_dir}" "${export_path}"

cd "${repo_root}"
pnpm --filter @chatmux/web mobile:sync

archive_args=(
  -workspace "${workspace}"
  -scheme "${scheme}"
  -configuration Release
  -archivePath "${archive_path}"
  archive
)

if [[ -n "${CHATMUX_IOS_TEAM_ID:-}" ]]; then
  archive_args+=(DEVELOPMENT_TEAM="${CHATMUX_IOS_TEAM_ID}")
fi

xcodebuild "${archive_args[@]}"
xcodebuild -exportArchive \
  -archivePath "${archive_path}" \
  -exportOptionsPlist "${export_options}" \
  -exportPath "${export_path}"

printf 'TestFlight export path: %s\n' "${export_path}"
