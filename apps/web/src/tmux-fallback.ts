import { type TmuxSession } from "./api";

export const fallbackSSHSessionName = "ssh";

export function isSSHFallbackSession(session: TmuxSession | undefined) {
  return session?.mode === "ssh";
}

export function hasSSHFallbackSession(sessions: TmuxSession[]) {
  return sessions.some((session) => isSSHFallbackSession(session));
}

export const tmuxInstallScript = `cat <<'CHATMUX_TMUX_INSTALL' >/tmp/chatmux-install-tmux.sh
#!/bin/sh
set -eu

need_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    return 1
  fi
  command -v sudo >/dev/null 2>&1
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return
  fi
  echo "Root privileges are required. Re-run as root or install sudo." >&2
  exit 1
}

if command -v tmux >/dev/null 2>&1; then
  tmux -V
  exit 0
fi

if command -v apt-get >/dev/null 2>&1; then
  run_root apt-get update
  run_root apt-get install -y tmux
elif command -v dnf >/dev/null 2>&1; then
  run_root dnf install -y tmux
elif command -v yum >/dev/null 2>&1; then
  run_root yum install -y tmux
elif command -v apk >/dev/null 2>&1; then
  run_root apk add --no-cache tmux
elif command -v pacman >/dev/null 2>&1; then
  run_root pacman -Sy --noconfirm tmux
elif command -v zypper >/dev/null 2>&1; then
  run_root zypper --non-interactive install tmux
elif command -v brew >/dev/null 2>&1; then
  brew install tmux
elif command -v pkg >/dev/null 2>&1; then
  run_root pkg install -y tmux
else
  echo "No supported package manager found. Install tmux with your system package manager." >&2
  exit 1
fi

tmux -V
CHATMUX_TMUX_INSTALL
sh /tmp/chatmux-install-tmux.sh
`;
