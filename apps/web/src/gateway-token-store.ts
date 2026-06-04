import { KeychainAccess, SecureStorage } from "@aparajita/capacitor-secure-storage";
import {
  clearDesktopGatewayAccessToken,
  hasDesktopSecureStorage,
  loadDesktopGatewayAccessToken,
  saveDesktopGatewayAccessToken,
} from "./desktop-secure-storage";

const storagePrefix = "chatmux_";
const gatewayAccessTokenKey = "gateway-access-token";
const gatewayBiometricUnlockKey = "gateway-biometric-unlock";

let configured = false;

export async function loadGatewayAccessToken() {
  if (hasDesktopSecureStorage()) {
    return loadDesktopGatewayAccessToken();
  }
  await configureGatewayTokenStorage();
  return (await SecureStorage.getItem(gatewayAccessTokenKey)) ?? "";
}

export async function saveGatewayAccessToken(token: string) {
  if (hasDesktopSecureStorage()) {
    await saveDesktopGatewayAccessToken(token);
    return;
  }
  await configureGatewayTokenStorage();
  await SecureStorage.setItem(gatewayAccessTokenKey, token);
}

export async function clearGatewayAccessToken() {
  if (hasDesktopSecureStorage()) {
    await clearDesktopGatewayAccessToken();
    return;
  }
  await configureGatewayTokenStorage();
  await SecureStorage.removeItem(gatewayAccessTokenKey);
}

export async function loadGatewayBiometricUnlock() {
  if (hasDesktopSecureStorage()) {
    return false;
  }
  await configureGatewayTokenStorage();
  return (await SecureStorage.getItem(gatewayBiometricUnlockKey)) === "true";
}

export async function saveGatewayBiometricUnlock(enabled: boolean) {
  if (hasDesktopSecureStorage()) {
    return;
  }
  await configureGatewayTokenStorage();
  await SecureStorage.setItem(gatewayBiometricUnlockKey, String(enabled));
}

async function configureGatewayTokenStorage() {
  if (configured) {
    return;
  }
  await SecureStorage.setKeyPrefix(storagePrefix);
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
  configured = true;
}
