FROM golang:1.24-trixie

ENV ANDROID_HOME=/android-sdk \
    ANDROID_SDK_ROOT=/android-sdk \
    ANDROID_NDK_VERSION=27.2.12479018 \
    DEBIAN_FRONTEND=noninteractive \
    PNPM_HOME=/pnpm/home \
    PATH=/pnpm/home:/android-sdk/cmdline-tools/latest/bin:/android-sdk/platform-tools:/usr/local/go/bin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      binutils \
      ca-certificates \
      curl \
      git \
      openjdk-21-jdk-headless \
      unzip \
      xz-utils \
      zip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://nodejs.org/dist/v24.14.1/node-v24.14.1-linux-x64.tar.xz \
    | tar -xJ -C /usr/local --strip-components=1 \
    && corepack enable \
    && corepack prepare pnpm@10.33.2 --activate

RUN set -eux; \
    mkdir -p "$ANDROID_HOME/cmdline-tools"; \
    curl -fsSL https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip -o /tmp/cmdline-tools.zip; \
    unzip -q /tmp/cmdline-tools.zip -d /tmp/android-cmdline-tools; \
    mv /tmp/android-cmdline-tools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"; \
    rm -rf /tmp/cmdline-tools.zip /tmp/android-cmdline-tools; \
    yes | sdkmanager --licenses >/dev/null; \
    sdkmanager \
      "platform-tools" \
      "platforms;android-36" \
      "build-tools;36.0.0" \
      "ndk;$ANDROID_NDK_VERSION"

ENV ANDROID_NDK_HOME=/android-sdk/ndk/27.2.12479018 \
    JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
