# Development

## Prerequisites

- Node.js 24+
- pnpm 10+
- Go 1.23+
- JDK 21+ for Android builds
- `tmux` installed on SSH hosts used for tmux feature testing

## Install

```bash
pnpm install
```

## Run Web SPA

```bash
pnpm dev
```

The SPA runs on `http://localhost:5173` by default.

## Native Shells

The native shells reuse the Web SPA build in `apps/web`.

```bash
pnpm --filter @muxchat/web mobile:add:ios
pnpm --filter @muxchat/web mobile:add:android
pnpm --filter @muxchat/web mobile:sync
pnpm --filter @muxchat/web desktop:dev
pnpm --filter @muxchat/web desktop:build
```

Capacitor generates `ios/` and `android/` under `apps/web` when the add commands
run. The iOS and Android projects are checked in after generation and use the
shared SPA from `apps/web/dist`. Tauri uses `apps/web/src-tauri`.

The desktop commands build a Go gateway sidecar into
`apps/web/src-tauri/binaries/` before Tauri starts. The generated binary is
ignored by git and is named with the Tauri target triple, for example
`muxchat-gateway-x86_64-unknown-linux-gnu`.

## Run Gateway

```bash
cd services/gateway
go run ./cmd/muxchat-gateway
```

The gateway listens on `http://localhost:8080` by default.

Set `MUXCHAT_GATEWAY_TOKEN` to require `Authorization: Bearer <token>` on API
requests. The SPA can store that token from the sidebar; iOS uses Keychain,
Android uses Android Keystore backed storage, and the web fallback is only for
local development. When biometric unlock is enabled, the stored token is loaded
only after Face ID, Touch ID, Android biometrics, or device credentials succeed.
Session alerts use local notifications on iOS and Android, and browser
notifications on the web. When enabled, the SPA polls the selected host's tmux
sessions every 30 seconds and notifies on status changes.

Useful checks:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/hosts
```

## Remote SSH Test Flow

The gateway currently accepts passwords in request bodies for early local
testing. Do not commit credentials.

```bash
curl -X POST http://localhost:8080/api/hosts \
  -H 'Content-Type: application/json' \
  -d '{"name":"local-test","hostname":"192.168.1.14","port":22001,"username":"binjie09"}'

curl -X POST http://localhost:8080/api/hosts/{hostID}/ssh/trust

curl -X POST http://localhost:8080/api/hosts/{hostID}/ssh/probe \
  -H 'Content-Type: application/json' \
  -d '{"password":"<password>"}'

curl -X POST http://localhost:8080/api/hosts/{hostID}/tmux/sessions/list \
  -H 'Content-Type: application/json' \
  -d '{"password":"<password>"}'
```

## Verify

```bash
pnpm typecheck
pnpm build
cd services/gateway && go test ./... && go build ./cmd/muxchat-gateway
```

## Next Implementation Tasks

1. Replace demo frontend data with API calls.
2. Add SQLite persistence for hosts.
3. Add SSH connection tests against a local fixture container.
4. Implement tmux session listing and creation.
5. Add xterm.js terminal stream once the WebSocket API is fixed.
