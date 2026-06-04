import { invoke } from "@tauri-apps/api/core";
import { isDesktopShell } from "./runtime-platform";

export function hasDesktopSecureStorage() {
  if (typeof window === "undefined") {
    return false;
  }
  return isDesktopShell();
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
