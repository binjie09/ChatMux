import { KeychainAccess, SecureStorage } from "@aparajita/capacitor-secure-storage";

const storagePrefix = "muxchat_";
const gatewayAccessTokenKey = "gateway-access-token";
const gatewayBiometricUnlockKey = "gateway-biometric-unlock";

let configured = false;

export async function loadGatewayAccessToken() {
  await configureGatewayTokenStorage();
  return (await SecureStorage.getItem(gatewayAccessTokenKey)) ?? "";
}

export async function saveGatewayAccessToken(token: string) {
  await configureGatewayTokenStorage();
  await SecureStorage.setItem(gatewayAccessTokenKey, token);
}

export async function clearGatewayAccessToken() {
  await configureGatewayTokenStorage();
  await SecureStorage.removeItem(gatewayAccessTokenKey);
}

export async function loadGatewayBiometricUnlock() {
  await configureGatewayTokenStorage();
  return (await SecureStorage.getItem(gatewayBiometricUnlockKey)) === "true";
}

export async function saveGatewayBiometricUnlock(enabled: boolean) {
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
