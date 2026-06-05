import { Capacitor } from "@capacitor/core";

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export function isDesktopShell() {
  const tauriWindow = window as TauriWindow;
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

export function isAndroidShell() {
  return Capacitor.getPlatform() === "android";
}

export function usesLocalGateway() {
  return isDesktopShell() || isAndroidShell();
}

export function isBrowserShell() {
  return !Capacitor.isNativePlatform() && !isDesktopShell();
}
