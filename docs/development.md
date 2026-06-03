# Development

## Prerequisites

- Node.js 24+
- pnpm 10+
- Go 1.23+

## Install

```bash
pnpm install
```

## Run Web SPA

```bash
pnpm dev
```

The SPA runs on `http://localhost:5173` by default.

## Run Gateway

```bash
cd services/gateway
go run ./cmd/muxchat-gateway
```

The gateway listens on `http://localhost:8080` by default.

Useful checks:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/hosts
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
