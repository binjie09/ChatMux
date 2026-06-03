# MuxChat

MuxChat is a multi-platform SSH and tmux workspace client. It presents remote
tmux sessions as chat-like conversations while keeping full terminal access when
the user needs it.

## Product Goal

Build one shared application experience for:

- Web SPA
- iOS and Android apps
- macOS and Windows desktop apps

The core workflow is:

1. Add an SSH host.
2. Connect to the host through a secure gateway.
3. Discover or create remote tmux sessions.
4. View each tmux session as a conversation thread with status, history, and
   terminal access.
5. Send commands, inspect output, resume long-running work, and optionally ask
   an AI assistant to summarize or propose commands.

## Technical Choice

- UI: React + TypeScript + Vite
- Shared app shell: Web SPA first
- Mobile: Capacitor using the same SPA
- Desktop: Tauri v2 using the same SPA
- Gateway: Go service for SSH, tmux control, PTY streaming, auth, audit logs
- Terminal rendering: xterm.js
- Transport: HTTP JSON APIs plus WebSocket streams
- Data: SQLite for local/self-hosted MVP, Postgres-compatible schema later

See [docs/architecture.md](docs/architecture.md) and
[docs/roadmap.md](docs/roadmap.md).

For local setup, see [docs/development.md](docs/development.md).

## Repository Layout

```text
apps/web              Shared React SPA
services/gateway      Go SSH/tmux gateway
packages/shared       Shared TypeScript contracts
docs                  Product and architecture docs
```

## MVP Scope

The first useful version should support:

- Host CRUD with username, hostname, port, and auth metadata
- Connect through the gateway to one host
- List remote tmux sessions
- Create a tmux session
- Open a live terminal stream for a selected session
- Capture recent tmux history and show it as a conversation transcript
- Send a command/message to the selected session

Mobile and desktop packaging should come after the Web SPA and gateway contract
are stable.
