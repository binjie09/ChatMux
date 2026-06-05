# Development

> Web 端必须只连接你自己部署、自己信任的 ChatMux Gateway。不要把真实服务器地址、SSH 密码、私钥或 Gateway Token 输入到外部演示站、第三方托管地址或陌生域名。

## Prerequisites

- Node.js 24+
- pnpm 10+
- Go 1.23+
- Rust 1.85+ for Tauri desktop builds
- JDK 21+ for Android builds
- `tmux` installed on SSH hosts used for tmux feature testing

## Install

```bash
pnpm install
```

## Run With Docker Compose

Copy `.env.example` to `.env` and edit local values there. `.env` is ignored by
git so tokens and local-only paths stay outside commits.

```bash
docker-compose up -d --build
docker-compose logs -f gateway web
docker-compose down
```

The compose stack uses host networking on Linux so the gateway can reach SSH
hosts bound to the host loopback address, such as `127.0.0.1:22001`. The gateway
listens on `CHATMUX_GATEWAY_PORT`, defaulting to `19327`, and the web dev server
listens on `CHATMUX_WEB_PORT`, defaulting to `5173`.

## Self-host Web Deployment

For production Web usage, use the self-host template in `deploy/web/`:

```bash
cp deploy/web/.env.example deploy/web/.env
docker compose --env-file deploy/web/.env -f deploy/web/docker-compose.yml up -d --build
```

The production template serves the SPA with Nginx and proxies `/api` plus the
terminal WebSocket to the Gateway container. See
[web-deployment.md](web-deployment.md) for the complete deployment guide.

## Run Web SPA

```bash
pnpm dev
```

The SPA runs on `http://localhost:5173` by default.

## Native Shells

The native shells reuse the Web SPA build in `apps/web`.

```bash
pnpm --filter @chatmux/web mobile:add:ios
pnpm --filter @chatmux/web mobile:add:android
pnpm --filter @chatmux/web mobile:sync
pnpm --filter @chatmux/web mobile:build:android-internal
pnpm --filter @chatmux/web mobile:build:ios-testflight
pnpm --filter @chatmux/web desktop:dev
pnpm --filter @chatmux/web desktop:build
pnpm --filter @chatmux/web desktop:build:macos
pnpm --filter @chatmux/web desktop:build:windows
```

Capacitor generates `ios/` and `android/` under `apps/web` when the add commands
run. The iOS and Android projects are checked in after generation and use the
shared SPA from `apps/web/dist`. Tauri uses `apps/web/src-tauri`.

The desktop commands build a Go gateway sidecar into
`apps/web/src-tauri/binaries/` before Tauri starts. The generated binary is
ignored by git and is named with the Tauri target triple, for example
`chatmux-gateway-x86_64-unknown-linux-gnu`.
Signed desktop release scripts are OS-specific. macOS builds must run on macOS
with `APPLE_SIGNING_IDENTITY`, or `APPLE_CERTIFICATE` plus
`APPLE_CERTIFICATE_PASSWORD`; set `CHATMUX_MACOS_AD_HOC=1` only for local ad-hoc
artifacts. Windows builds must run on Windows with
`CHATMUX_WINDOWS_CERT_THUMBPRINT` for a certificate in the Windows store, or
`CHATMUX_WINDOWS_SIGN_COMMAND` for a custom signer. Optional Windows overrides
are `CHATMUX_WINDOWS_DIGEST_ALGORITHM` and `CHATMUX_WINDOWS_TIMESTAMP_URL`.
Set `CHATMUX_CREATE_UPDATER_ARTIFACTS=1` plus `TAURI_SIGNING_PRIVATE_KEY` to
have Tauri generate updater archives and `.sig` files alongside signed desktop
bundles. Keep the updater private key outside the repository.

## Run Gateway

```bash
cd services/gateway
go run ./cmd/chatmux-gateway
```

The gateway listens on `http://localhost:8080` by default.

Set `CHATMUX_GATEWAY_TOKEN`; the gateway refuses to start without it. API
requests require `Authorization: Bearer <token>` with the `admin` role for this
token. `CHATMUX_USERS_JSON` can define additional static users, for example
`[{"name":"ops","role":"operator","token":"..."}]`.
Roles are `viewer`, `operator`, and `admin`; viewers can call read APIs, while
operators and admins can mutate hosts and tmux sessions. The SPA can store a
gateway token from the entry page before the workspace loads; iOS uses Keychain,
Android uses Android Keystore backed storage, Tauri desktop uses the operating
system credential store, and the web fallback is only for local development.
When biometric unlock is enabled on mobile, the stored token is loaded only
after Face ID, Touch ID, Android biometrics, or device credentials succeed.
Hosts are owned by the principal that creates them. Non-admin users can only see
their own hosts; admins can see all hosts. tmux sessions carry owner metadata.
Host owners and admins can see all sessions on an owned or admin-visible host;
session owners can see and manage their sessions. tmux sessions without ChatMux
metadata are visible only to the host owner and admins.
Session alerts use local notifications on iOS and Android, and browser
notifications on the web. When enabled, the SPA notifies on status changes from
the selected host's 30-second session status refresh. If the in-memory SSH
credential is missing or rejected during background polling, the session sidebar
keeps alerts enabled and shows a recoverable saved-credential prompt.
When the native terminal WebSocket reconnects from recovery, the SPA captures
the selected tmux pane history again so the history/context panel reflects the
current session state. The gateway records those successful recovery attaches as
`terminal.recovered` audit events.
Session status is inferred with a state machine. A tmux session is running only
when its session activity changed in the last 30 seconds; after that window it is
done unless the pane is failed or unknown. The SPA records viewed sessions, and a
viewed session becomes idle after the user leaves it for 30 minutes without newer
terminal activity. Running labels include the active pane process name, such as
`codex running`.
Touch and narrow-screen terminal views show quick keys for Esc, Tab, Ctrl-C,
Ctrl-D, and arrow navigation. These keys write directly to the native PTY stream.

Composer-sent terminal input is recorded as audit metadata only; the raw command
text is not stored. Native xterm.js keystrokes bypass command policy and audit
recording so passwords and interactive TUI input stay inside the terminal
stream. Set `CHATMUX_COMMAND_DENY_PATTERNS_JSON` to a JSON array of regular
expressions, for example `["^rm\\s+-rf\\s+/"]`. Policy mode defaults to
`enforce`; set `CHATMUX_COMMAND_POLICY_MODE=audit` to log pattern matches while
still allowing composer input.

AI transcript summaries are disabled unless `OPENAI_API_KEY` is set on the
gateway. The summary endpoint captures the selected tmux pane and sends that
transcript to the configured OpenAI-compatible Responses API only when the user
presses Summarize. `OPENAI_MODEL` defaults to `gpt-5.5`, and `OPENAI_BASE_URL`
defaults to `https://api.openai.com/v1`.
AI command drafting uses the same OpenAI settings. Drafts capture the selected
tmux pane for context and return a command, explanation, and risk label. The SPA
only inserts the draft into the composer; the user must still send it explicitly.

Controlled automation exposes only allowlisted gateway tools. `GET /api/automation/tools`
lists available tools, and `POST /api/automation/tools/{name}/run` executes one tool with an `arguments` object.
Tool runs require an operator or admin gateway role and write an
`automation.tool.ran` audit event. Tools also declare explicit capabilities such
as `hosts.read`, `audit.read`, `tmux.sessions.read`, and `tmux.history.read`;
set `CHATMUX_AUTOMATION_CAPABILITIES_JSON` to a JSON array to narrow the enabled
capabilities. The tool set includes `hosts.list`, `hosts.get`, `audit.list`,
`tmux.sessions.list`, and `tmux.history.capture`. The tmux tools require
`credentialToken` values from the SSH credential endpoint. Raw SSH credentials
are accepted only by `/ssh/probe` and `/ssh/credentials`; tmux, AI, terminal
token, and automation request bodies do not accept raw credentials. There is
intentionally no arbitrary shell command tool.
Hosts can store an SSH password or an SSH private key with an optional
passphrase. API responses expose only `hasCredential` and compatibility
`hasPassword` flags, never the raw credential. The SPA asks the credential
endpoint to mint short-lived credential tokens from the saved host credential,
keeps those tokens in memory, and refreshes them before expiry. The session
sidebar shows whether a host credential is saved, a token is ready, a refresh is
in progress, or the current token has expired.

Android internal testing builds require signing material in environment
variables: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The script writes the AAB to
`apps/web/android/app/build/outputs/bundle/release/app-release.aab`.

TestFlight builds require macOS with Xcode. `CHATMUX_IOS_TEAM_ID` can be set for
automatic signing, and `CHATMUX_IOS_EXPORT_OPTIONS_PLIST` can override the
default export options at `apps/web/scripts/ios-export-options.plist`.

Useful checks:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/hosts
curl -X PATCH http://localhost:8080/api/hosts/{hostID} \
  -H 'Content-Type: application/json' \
  -d '{"name":"renamed"}'
curl -X DELETE http://localhost:8080/api/hosts/{hostID}
```

## SSH Fixture Integration Tests

The gateway has a Docker-based SSH fixture with `tmux` installed. It starts an
ephemeral local container, maps SSH to a random localhost port, and runs the
SSH client plus terminal WebSocket integration tests.

```bash
services/gateway/scripts/test-ssh-fixture.sh
```

## Remote SSH Test Flow

Issue a short-lived credential token once per host connection and pass
`credentialToken` to tmux, history, summary, command draft, terminal-token, and
automation endpoints. Raw SSH passwords and private keys can be saved on hosts
and are accepted only by `/ssh/probe` and `/ssh/credentials`. Do not commit
credentials.

```bash
curl -X POST http://localhost:8080/api/hosts \
  -H 'Content-Type: application/json' \
  -d '{"name":"local-test","hostname":"192.168.1.14","port":22001,"username":"binjie09","password":"<password>"}'

curl -X POST http://localhost:8080/api/hosts \
  -H 'Content-Type: application/json' \
  -d '{"name":"key-test","hostname":"192.168.1.14","port":22001,"username":"binjie09","sshAuthMethod":"private_key","privateKey":"<private-key>","privateKeyPassphrase":"<optional-passphrase>"}'

curl -X POST http://localhost:8080/api/hosts/{hostID}/ssh/trust

curl -X POST http://localhost:8080/api/hosts/{hostID}/ssh/credentials \
  -H 'Content-Type: application/json' \
  -d '{}'

curl -X POST http://localhost:8080/api/hosts/{hostID}/ssh/probe \
  -H 'Content-Type: application/json' \
  -d '{"password":"<password>"}'

curl -X POST http://localhost:8080/api/hosts/{hostID}/ssh/probe \
  -H 'Content-Type: application/json' \
  -d '{"sshAuthMethod":"private_key","privateKey":"<private-key>","privateKeyPassphrase":"<optional-passphrase>"}'

curl -X POST http://localhost:8080/api/hosts/{hostID}/tmux/sessions/list \
  -H 'Content-Type: application/json' \
  -d '{"credentialToken":"<token>"}'
```

## Verify

```bash
pnpm typecheck
pnpm build
cd services/gateway && go test ./... && go build ./cmd/chatmux-gateway
```

## Next Implementation Tasks

No open roadmap tasks.
