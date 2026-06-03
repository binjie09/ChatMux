import { invoke } from "@tauri-apps/api/core";

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

export function hasDesktopSecureStorage() {
  if (typeof window === "undefined") {
    return false;
  }
  const tauriWindow = window as TauriWindow;
  return Boolean(tauriWindow.__TAURI__ || tauriWindow.__TAURI_INTERNALS__);
}

export async function loadDesktopGatewayAccessToken() {
  return invoke<string>("load_gateway_access_token");
}

export async function saveDesktopGatewayAccessToken(token: string) {
  await invoke("save_gateway_access_token", { token });
}

export async function clearDesktopGatewayAccessToken() {
  await invoke("clear_gateway_access_token");
}
