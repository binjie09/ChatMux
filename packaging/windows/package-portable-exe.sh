#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compose_file="${script_dir}/docker-compose.yml"

if docker compose version >/dev/null 2>&1; then
  docker compose -f "${compose_file}" build windows-exe
  CHATMUX_UID="$(id -u)" CHATMUX_GID="$(id -g)" \
    docker compose -f "${compose_file}" run --rm windows-exe
  exit 0
fi

if command -v docker-compose >/dev/null 2>&1; then
  docker-compose -f "${compose_file}" build windows-exe
  CHATMUX_UID="$(id -u)" CHATMUX_GID="$(id -g)" \
    docker-compose -f "${compose_file}" run --rm windows-exe
  exit 0
fi

echo "Missing Docker Compose. Install the docker compose plugin or docker-compose." >&2
exit 2
