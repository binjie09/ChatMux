#!/usr/bin/env bash
set -euo pipefail

required_env=(
  ANDROID_KEYSTORE_PATH
  ANDROID_KEYSTORE_PASSWORD
  ANDROID_KEY_ALIAS
  ANDROID_KEY_PASSWORD
)

for name in "${required_env[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 2
  fi
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web_dir="$(cd "${script_dir}/.." && pwd)"
repo_root="$(cd "${web_dir}/../.." && pwd)"

cd "${repo_root}"
pnpm --filter @muxchat/web mobile:sync

cd "${web_dir}/android"
./gradlew :app:bundleRelease

artifact="${web_dir}/android/app/build/outputs/bundle/release/app-release.aab"
if [[ ! -f "${artifact}" ]]; then
  echo "Expected Android artifact was not created: ${artifact}" >&2
  exit 1
fi

printf 'Android internal testing artifact: %s\n' "${artifact}"
