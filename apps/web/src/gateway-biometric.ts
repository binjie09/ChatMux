import { Capacitor } from "@capacitor/core";
import { AndroidBiometryStrength, BiometricAuth } from "@aparajita/capacitor-biometric-auth";
import { hasDesktopSecureStorage } from "./desktop-secure-storage";

export type GatewayBiometricAvailability = {
  canUnlock: boolean;
  reason: string;
};

export async function checkGatewayBiometricAvailability(): Promise<GatewayBiometricAvailability> {
  if (hasDesktopSecureStorage() || !Capacitor.isNativePlatform()) {
    return {
      canUnlock: false,
      reason: "Biometric unlock is available only on iOS and Android",
    };
  }
  const result = await BiometricAuth.checkBiometry();
  return {
    canUnlock: result.isAvailable || result.deviceIsSecure,
    reason: result.reason,
  };
}

export async function authenticateGatewayTokenUnlock() {
  if (hasDesktopSecureStorage() || !Capacitor.isNativePlatform()) {
    throw new Error("Biometric unlock is available only on iOS and Android");
  }
  await BiometricAuth.authenticate({
    allowDeviceCredential: true,
    androidBiometryStrength: AndroidBiometryStrength.weak,
    androidConfirmationRequired: false,
    androidSubtitle: "Unlock stored gateway token",
    androidTitle: "Unlock MuxChat",
    cancelTitle: "Cancel",
    iosFallbackTitle: "Use passcode",
    reason: "Unlock stored gateway token",
  });
}
