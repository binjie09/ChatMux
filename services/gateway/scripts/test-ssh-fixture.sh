#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gateway_dir="$(cd "${script_dir}/.." && pwd)"
fixture_dir="${gateway_dir}/testdata/ssh-fixture"
image_name="${CHATMUX_SSH_FIXTURE_IMAGE:-chatmux-ssh-fixture:latest}"
container_name="${CHATMUX_SSH_FIXTURE_CONTAINER:-chatmux-ssh-fixture}"
fixture_user="chatmux"
fixture_secret="${CHATMUX_SSH_FIXTURE_SECRET:-chatmux}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 2
  fi
}

cleanup() {
  docker rm -f "${container_name}" >/dev/null 2>&1 || true
}

wait_for_ssh() {
  local port="$1"
  for _ in {1..30}; do
    if timeout 1 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/${port}" 2>/dev/null; then
      return
    fi
    sleep 1
  done
  echo "SSH fixture did not become ready on port ${port}" >&2
  exit 1
}

require_command docker
require_command go
require_command timeout

docker build --build-arg "CHATMUX_FIXTURE_SECRET=${fixture_secret}" -t "${image_name}" "${fixture_dir}"
cleanup
trap cleanup EXIT
docker run -d --name "${container_name}" -p 127.0.0.1::22 "${image_name}" >/dev/null
fixture_port="$(docker port "${container_name}" 22/tcp | awk -F: '{print $NF}')"
if [[ -z "${fixture_port}" ]]; then
  echo "Could not read SSH fixture port" >&2
  exit 1
fi
wait_for_ssh "${fixture_port}"

(
  cd "${gateway_dir}"
  env \
    CHATMUX_TEST_SSH_HOST=127.0.0.1 \
    CHATMUX_TEST_SSH_PORT="${fixture_port}" \
    CHATMUX_TEST_SSH_USER="${fixture_user}" \
    CHATMUX_TEST_SSH_PASSWORD="${fixture_secret}" \
    timeout 180 go test ./internal/sshclient ./internal/api -run Integration -count=1
)
