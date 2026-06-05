import { useCallback, useEffect, useMemo, useState } from "react";
import { setGatewayAccessToken } from "./api";
import {
  authenticateGatewayTokenUnlock,
  checkGatewayBiometricAvailability,
} from "./gateway-biometric";
import {
  clearGatewayAccessToken,
  loadGatewayBiometricUnlock,
  loadGatewayAccessToken,
  saveGatewayBiometricUnlock,
  saveGatewayAccessToken,
} from "./gateway-token-store";
import { usesLocalGateway } from "./runtime-platform";
import { errorMessage } from "./view-utils";

export type GatewayTokenStatus = "empty" | "loading" | "locked" | "saving" | "stored";

export type GatewayTokenState = {
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  hasToken: boolean;
  ready: boolean;
  required: boolean;
  status: GatewayTokenStatus;
  clearToken: () => Promise<void>;
  saveToken: (token: string) => Promise<void>;
  setBiometricUnlock: (enabled: boolean) => Promise<void>;
  unlockToken: () => Promise<void>;
};

export function useGatewayAccessToken(onError: (message: string) => void): GatewayTokenState {
  const required = !usesLocalGateway();
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [status, setStatus] = useState<GatewayTokenStatus>("loading");
  const [hasToken, setHasToken] = useState(false);

  const tokenSetters = useMemo(() => ({
    setBiometricAvailable,
    setBiometricEnabled,
    setHasToken,
    setStatus,
  }), []);

  useEffect(() => {
    if (!required) {
      setGatewayAccessToken("");
      tokenSetters.setBiometricAvailable(false);
      tokenSetters.setBiometricEnabled(false);
      tokenSetters.setHasToken(false);
      tokenSetters.setStatus("stored");
      return;
    }
    let active = true;
    void loadToken(() => active, tokenSetters, onError);
    return () => {
      active = false;
    };
  }, [onError, required, tokenSetters]);

  const saveToken = useCallback(async (token: string) => {
    if (!required) {
      return;
    }
    await saveTokenValue(token, setStatus, setHasToken, onError);
  }, [onError, required]);

  const clearToken = useCallback(async () => {
    if (!required) {
      setGatewayAccessToken("");
      setStatus("stored");
      return;
    }
    await clearTokenValue(tokenSetters, onError);
  }, [onError, required, tokenSetters]);

  const unlockToken = useCallback(async () => {
    if (!required) {
      setStatus("stored");
      return;
    }
    setStatus("loading");
    await loadToken(() => true, tokenSetters, onError);
  }, [onError, required, tokenSetters]);

  const setBiometricUnlock = useCallback(async (enabled: boolean) => {
    if (!required) {
      return;
    }
    await updateBiometricUnlock(enabled, hasToken, tokenSetters, onError);
  }, [hasToken, onError, required, tokenSetters]);

  return {
    biometricAvailable,
    biometricEnabled,
    clearToken,
    hasToken,
    ready: !required || status === "stored",
    required,
    saveToken,
    setBiometricUnlock,
    status,
    unlockToken,
  };
}

type TokenSetters = {
  setBiometricAvailable: (available: boolean) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setHasToken: (hasToken: boolean) => void;
  setStatus: (status: GatewayTokenStatus) => void;
};

async function loadToken(
  isActive: () => boolean,
  setters: TokenSetters,
  onError: (message: string) => void,
) {
  try {
    await applyBiometricGate(setters);
    const token = await loadGatewayAccessToken();
    if (isActive()) {
      applyLoadedToken(token, setters);
    }
  } catch (error) {
    if (isActive()) {
      setGatewayAccessToken("");
      setters.setHasToken(false);
      setters.setStatus("locked");
      onError(errorMessage(error));
    }
  }
}

async function applyBiometricGate(setters: TokenSetters) {
  const availability = await checkGatewayBiometricAvailability();
  const enabled = await loadGatewayBiometricUnlock();
  setters.setBiometricAvailable(availability.canUnlock);
  setters.setBiometricEnabled(enabled);
  if (!enabled) {
    return;
  }
  if (!availability.canUnlock) {
    throw new Error(availability.reason || "Biometric unlock is not available");
  }
  await authenticateGatewayTokenUnlock();
}

async function saveTokenValue(
  token: string,
  setStatus: (status: GatewayTokenStatus) => void,
  setHasToken: (hasToken: boolean) => void,
  onError: (message: string) => void,
) {
  setStatus("saving");
  try {
    await saveGatewayAccessToken(token);
    setGatewayAccessToken(token);
    setHasToken(true);
    setStatus("stored");
    onError("");
  } catch (error) {
    setStatus("empty");
    onError(errorMessage(error));
  }
}

async function clearTokenValue(
  setters: TokenSetters,
  onError: (message: string) => void,
) {
  setters.setStatus("saving");
  try {
    await clearGatewayAccessToken();
    await saveGatewayBiometricUnlock(false);
    setGatewayAccessToken("");
    setters.setBiometricEnabled(false);
    setters.setHasToken(false);
    setters.setStatus("empty");
    onError("");
  } catch (error) {
    setters.setStatus("stored");
    onError(errorMessage(error));
  }
}

async function updateBiometricUnlock(
  enabled: boolean,
  hasToken: boolean,
  setters: TokenSetters,
  onError: (message: string) => void,
) {
  setters.setStatus("saving");
  try {
    await ensureBiometricUnlockCanChange(enabled, setters);
    await saveGatewayBiometricUnlock(enabled);
    setters.setBiometricEnabled(enabled);
    setters.setStatus(hasToken ? "stored" : "empty");
    onError("");
  } catch (error) {
    setters.setStatus(hasToken ? "stored" : "empty");
    onError(errorMessage(error));
  }
}

async function ensureBiometricUnlockCanChange(enabled: boolean, setters: TokenSetters) {
  if (!enabled) {
    return;
  }
  const availability = await checkGatewayBiometricAvailability();
  setters.setBiometricAvailable(availability.canUnlock);
  if (!availability.canUnlock) {
    throw new Error(availability.reason || "Biometric unlock is not available");
  }
  await authenticateGatewayTokenUnlock();
}

function applyLoadedToken(
  token: string,
  setters: TokenSetters,
) {
  setGatewayAccessToken(token);
  setters.setHasToken(Boolean(token));
  setters.setStatus(token ? "stored" : "empty");
}
