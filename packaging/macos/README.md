# macOS Packaging

macOS Tauri bundles require Apple's tooling for the app bundle, signing, DMG
creation, and notarization. The Docker Compose flow keeps the local machine
clean by running only an rsync/ssh container locally, then building on a macOS
host over SSH.

## Builder Requirements

The macOS builder must have:

- Xcode Command Line Tools
- Node.js with Corepack
- Rust and Cargo
- Go
- SSH access from the machine running Docker Compose

For a local ad-hoc artifact:

```bash
CHATMUX_MACOS_BUILDER=user@mac-host \
CHATMUX_MACOS_AD_HOC=1 \
pnpm desktop:build:macos
```

For a signed release, set the same signing variables used by
`apps/web/scripts/build-desktop-macos.sh`, for example
`APPLE_SIGNING_IDENTITY` or `APPLE_CERTIFICATE` plus
`APPLE_CERTIFICATE_PASSWORD`.

Optional settings:

```bash
TAURI_TARGET_TRIPLE=aarch64-apple-darwin
CHATMUX_MACOS_REMOTE_DIR=chatmux-build
CHATMUX_MACOS_SSH_KEY=~/.ssh/id_ed25519
CHATMUX_MACOS_SSH_PORT=22
CHATMUX_MACOS_SKIP_STAPLING=1
```

Artifacts are copied back to:

```text
.tmp/artifacts/macos-aarch64-apple-darwin/
.tmp/artifacts/macos-x86_64-apple-darwin/
```

The local machine only needs Docker Compose and SSH credentials. If
`CHATMUX_MACOS_BUILDER` is not set and the command is run directly on macOS, the
wrapper uses the local macOS toolchain path.
