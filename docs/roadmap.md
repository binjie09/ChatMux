# Roadmap

## Phase 0: Discovery and Shape

Status: started

- Define product scope and competitor landscape.
- Choose shared UI and multi-platform packaging strategy.
- Create repository skeleton.
- Document architecture and security boundaries.

## Phase 1: Web + Gateway MVP

Goal: one developer can connect to one SSH host, see tmux sessions, and use one
session from the browser.

- Build gateway health endpoint.
- Add host CRUD API with SQLite persistence.
- Add SSH connection manager.
- Implement host key verification flow.
- Implement `tmux list-sessions` parsing.
- Implement session creation with `tmux new-session -d`.
- Add WebSocket PTY stream for attaching to one tmux session.
- Add xterm.js native terminal component above the composer.
- Verify interactive terminal behavior with shells and TUI commands.
- Show selected session history with `tmux capture-pane`.
- Send input through `tmux send-keys` or PTY stream.

## Phase 2: Chat-like Session Experience

Goal: tmux sessions keep a native terminal as the primary surface while adding
conversation-like controls and context around it.

- Normalize captured terminal history into transcript chunks.
- Add session status detection: idle, running, waiting, failed, unknown.
- Add command composer with send modes.
- Add session title, tags, and pinned hosts.
- Add searchable history.
- Add audit log view.
- Add reconnect and stream recovery.

## Phase 3: Desktop Apps

Goal: macOS and Windows desktop apps share the same SPA.

- Add Tauri v2 shell.
- Package gateway as a sidecar.
- Add local config directory and encrypted secret storage.
- Add auto-update strategy.
- Build signed macOS and Windows artifacts.

## Phase 4: Mobile Apps

Goal: iOS and Android apps share the same SPA.

- Add Capacitor shell.
- Implement mobile navigation and terminal gestures.
- Use native secure storage for gateway tokens.
- Add biometric unlock.
- Add push notification hooks for long-running session state changes.
- Build TestFlight and Android internal testing artifacts.

## Phase 5: Team and AI Features

Goal: make MuxChat useful for teams and AI-assisted operations.

- Multi-user auth and RBAC.
- Shared hosts and shared sessions.
- Recording and command policy.
- AI transcript summarization.
- AI command drafting with explicit confirmation.
- MCP or plugin API for controlled automation.

## Open Decisions

- Whether hosted cloud gateway is part of the business model or only
  self-hosted/local.
- Whether terminal streams should attach to tmux control-mode or a normal PTY in
  the first MVP.
- Whether desktop should default to local sidecar mode or remote gateway mode.
- How much terminal scrollback to store locally versus recapture on demand.
