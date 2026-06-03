import { KeychainAccess, SecureStorage } from "@aparajita/capacitor-secure-storage";

const storagePrefix = "muxchat_";
const gatewayAccessTokenKey = "gateway-access-token";

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

async function configureGatewayTokenStorage() {
  if (configured) {
    return;
  }
  await SecureStorage.setKeyPrefix(storagePrefix);
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
  configured = true;
}
