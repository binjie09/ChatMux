# Architecture

## Summary

ChatMux uses one React SPA across all clients. SSH and tmux operations are
handled by a gateway process because browsers cannot open raw SSH sessions, and
because key handling, host verification, PTY allocation, and audit logging need a
clear trusted boundary.

```text
Web / Mobile / Desktop UI
        |
        | HTTP + WebSocket
        v
ChatMux Gateway
        |
        | SSH
        v
Remote host
        |
        | tmux control-mode / tmux commands / PTY
        v
tmux sessions, windows, panes
```

## Terminal-First Interaction

The main interaction area above the composer must be a real terminal, not a
rendered chat transcript. It should behave like the VS Code integrated terminal
or vscode-server terminal:

- Full PTY semantics
- Escape sequence support through xterm.js
- Interactive TUI compatibility, including vim, top, htop, lazygit, codex, and
  similar tools
- Raw keyboard input, resize events, paste, selection, alternate screen, and
  mouse reporting
- tmux attach/detach behavior without rewriting terminal output

The chat-like layer is a control and context layer around the terminal. It can
show command drafts, summaries, status, and captured history, but it must never
replace the native terminal stream for active interaction.

The default session view should therefore be:

```text
Native terminal viewport
------------------------
Command / assistant composer
```

Transcript and AI features should be side panels, tabs, overlays, or collapsed
metadata surfaces. They must not block terminal-native workflows.

## Client Strategy

### Web SPA

The Web SPA is the primary implementation target. It owns navigation, host
management screens, native terminal panes, chat-like controls, settings, and
future AI controls.

### Mobile Apps

Use Capacitor for iOS and Android. This keeps the UI code shared while allowing
native secure storage, biometric unlock, push notifications, and deep links when
needed.

Mobile apps normally connect to a hosted or self-hosted gateway. A local SSH
stack inside the mobile app is not part of the first milestone.

### Desktop Apps

Use Tauri v2 for macOS and Windows. Tauri can package the same SPA and, later,
run the Go gateway as a sidecar for local-first desktop usage.

Electron is a fallback if Tauri sidecar or mobile parity becomes a blocker, but
Tauri is the default because it is smaller and fits this app's UI-heavy,
gateway-backed shape.

## Gateway Strategy

The gateway is a Go service with these responsibilities:

- Authenticated HTTP API
- WebSocket terminal streams
- SSH connection lifecycle
- Known-host verification
- Key loading and agent support
- tmux session discovery and creation
- tmux history capture
- tmux command injection
- Audit events for connect, command send, and disconnect

Go is a good fit because mature SSH libraries exist, concurrency is simple, and
shipping a single binary as a Tauri sidecar is straightforward.

## Remote tmux Model

ChatMux maps tmux resources into product concepts:

| tmux | Product |
| --- | --- |
| Host | Workspace |
| Session | Conversation |
| Window | Topic or tab |
| Pane | Terminal stream |
| Scrollback/history | Transcript |

The MVP should start with one pane per conversation. Multi-window and multi-pane
layouts can be exposed after the conversation model is stable.

## API Shape

Initial HTTP endpoints:

- `GET /healthz`
- `GET /api/hosts`
- `POST /api/hosts`
- `GET /api/hosts/{hostID}/tmux/sessions`
- `POST /api/hosts/{hostID}/tmux/sessions`
- `GET /api/sessions/{sessionID}/history`
- `POST /api/sessions/{sessionID}/send`

Initial WebSocket endpoint:

- `GET /api/sessions/{sessionID}/terminal`

## Security Baseline

- Never send private keys back to the client.
- Store secrets encrypted at rest.
- Treat command sending as an auditable event.
- Require explicit host key trust on first connection.
- Separate user identity from SSH identity.
- Make gateway deployment mode explicit: local-only, self-hosted team, or cloud.
- Avoid browser-side SSH for the MVP.

## Product Differentiator

The differentiator is not terminal rendering. It is stateful remote work
continuity:

- See what each remote session is doing without attaching.
- Resume long-running work from any device.
- Read terminal history as surrounding context.
- Send commands like messages while keeping the raw terminal as the primary
  interaction surface.
- Add AI summarization and command drafting after the tmux model is reliable.
