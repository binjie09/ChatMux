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
pnpm --filter @muxchat/web mobile:build:android-internal
pnpm --filter @muxchat/web mobile:build:ios-testflight
pnpm --filter @muxchat/web desktop:dev
pnpm --filter @muxchat/web desktop:build
pnpm --filter @muxchat/web desktop:build:macos
pnpm --filter @muxchat/web desktop:build:windows
```

Capacitor generates `ios/` and `android/` under `apps/web` when the add commands
run. The iOS and Android projects are checked in after generation and use the
shared SPA from `apps/web/dist`. Tauri uses `apps/web/src-tauri`.

The desktop commands build a Go gateway sidecar into
`apps/web/src-tauri/binaries/` before Tauri starts. The generated binary is
ignored by git and is named with the Tauri target triple, for example
`muxchat-gateway-x86_64-unknown-linux-gnu`.
Signed desktop release scripts are OS-specific. macOS builds must run on macOS
with `APPLE_SIGNING_IDENTITY`, or `APPLE_CERTIFICATE` plus
`APPLE_CERTIFICATE_PASSWORD`; set `MUXCHAT_MACOS_AD_HOC=1` only for local ad-hoc
artifacts. Windows builds must run on Windows with
`MUXCHAT_WINDOWS_CERT_THUMBPRINT` for a certificate in the Windows store, or
`MUXCHAT_WINDOWS_SIGN_COMMAND` for a custom signer. Optional Windows overrides
are `MUXCHAT_WINDOWS_DIGEST_ALGORITHM` and `MUXCHAT_WINDOWS_TIMESTAMP_URL`.
Set `MUXCHAT_CREATE_UPDATER_ARTIFACTS=1` plus `TAURI_SIGNING_PRIVATE_KEY` to
have Tauri generate updater archives and `.sig` files alongside signed desktop
bundles. Keep the updater private key outside the repository.

## Run Gateway

```bash
cd services/gateway
go run ./cmd/muxchat-gateway
```

The gateway listens on `http://localhost:8080` by default.

Set `MUXCHAT_GATEWAY_TOKEN` to require `Authorization: Bearer <token>` on API
requests with the `admin` role. `MUXCHAT_USERS_JSON` can define additional
static users, for example `[{"name":"ops","role":"operator","token":"..."}]`.
Roles are `viewer`, `operator`, and `admin`; viewers can call read APIs, while
operators and admins can mutate hosts and tmux sessions. The SPA can store a
gateway token from the sidebar; iOS uses Keychain, Android uses Android Keystore
backed storage, and the web fallback is only for local development. When
biometric unlock is enabled, the stored token is loaded only after Face ID,
Touch ID, Android biometrics, or device credentials succeed.
Hosts are owned by the principal that creates them. Shared hosts are visible to
all authenticated users; private hosts are visible only to their owner and
admins. tmux session access follows the host visibility rule.
Session alerts use local notifications on iOS and Android, and browser
notifications on the web. When enabled, the SPA polls the selected host's tmux
sessions every 30 seconds and notifies on status changes.
Session status is inferred from tmux session attachment plus the active pane
command and pane exit state: shell panes are idle or waiting, non-shell panes are
running, and dead panes with non-zero exit status are failed.
Touch and narrow-screen terminal views show quick keys for Esc, Tab, Ctrl-C,
Ctrl-D, and arrow navigation. These keys write directly to the native PTY stream.

Composer-sent terminal input is recorded as audit metadata only; the raw command
text is not stored. Native xterm.js keystrokes bypass command policy and audit
recording so passwords and interactive TUI input stay inside the terminal
stream. Set `MUXCHAT_COMMAND_DENY_PATTERNS_JSON` to a JSON array of regular
expressions, for example `["^rm\\s+-rf\\s+/"]`. Policy mode defaults to
`enforce`; set `MUXCHAT_COMMAND_POLICY_MODE=audit` to log pattern matches while
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
`automation.tool.ran` audit event. The first tool set includes `hosts.list`,
`audit.list`, `tmux.sessions.list`, and `tmux.history.capture`. The tmux tools
accept SSH passwords in request bodies for early local testing, but passwords are
not persisted and are not written into audit messages. There is intentionally no
arbitrary shell command tool.

Android internal testing builds require signing material in environment
variables: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The script writes the AAB to
`apps/web/android/app/build/outputs/bundle/release/app-release.aab`.

TestFlight builds require macOS with Xcode. `MUXCHAT_IOS_TEAM_ID` can be set for
automatic signing, and `MUXCHAT_IOS_EXPORT_OPTIONS_PLIST` can override the
default export options at `apps/web/scripts/ios-export-options.plist`.

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
