import { AndroidBiometryStrength, BiometricAuth } from "@aparajita/capacitor-biometric-auth";

export type GatewayBiometricAvailability = {
  canUnlock: boolean;
  reason: string;
};

export async function checkGatewayBiometricAvailability(): Promise<GatewayBiometricAvailability> {
  const result = await BiometricAuth.checkBiometry();
  return {
    canUnlock: result.isAvailable || result.deviceIsSecure,
    reason: result.reason,
  };
}

export async function authenticateGatewayTokenUnlock() {
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
