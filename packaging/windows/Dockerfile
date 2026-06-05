FROM golang:1.24-trixie

ENV CARGO_HOME=/cargo \
    RUSTUP_HOME=/rustup \
    PNPM_HOME=/pnpm/home \
    PATH=/cargo/bin:/pnpm/home:/usr/local/go/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      build-essential \
      ca-certificates \
      clang \
      cmake \
      curl \
      g++-mingw-w64-x86-64 \
      gcc-mingw-w64-x86-64 \
      git \
      lld \
      llvm \
      perl \
      pkg-config \
      xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    for version in 21 20 19 18 17 16 15 14; do \
      if command -v "llvm-rc-${version}" >/dev/null 2>&1; then \
        ln -sf "$(command -v "llvm-rc-${version}")" /usr/local/bin/llvm-rc; \
        ln -sf "$(command -v "lld-link-${version}")" /usr/local/bin/lld-link; \
        if command -v "llvm-lib-${version}" >/dev/null 2>&1; then \
          ln -sf "$(command -v "llvm-lib-${version}")" /usr/local/bin/llvm-lib; \
        else \
          ln -sf "$(command -v "llvm-ar-${version}")" /usr/local/bin/llvm-lib; \
        fi; \
        if command -v "clang-cl-${version}" >/dev/null 2>&1; then \
          ln -sf "$(command -v "clang-cl-${version}")" /usr/local/bin/clang-cl; \
        else \
          ln -sf "$(command -v "clang-${version}")" /usr/local/bin/clang-cl; \
        fi; \
        break; \
      fi; \
    done; \
    command -v llvm-rc; \
    command -v llvm-lib; \
    command -v lld-link; \
    command -v clang-cl

RUN curl -fsSL https://nodejs.org/dist/v24.14.1/node-v24.14.1-linux-x64.tar.xz \
    | tar -xJ -C /usr/local --strip-components=1 \
    && corepack enable \
    && corepack prepare pnpm@10.33.2 --activate

RUN curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.96.0 \
    && rustup target add x86_64-pc-windows-msvc \
    && cargo install cargo-xwin --locked
