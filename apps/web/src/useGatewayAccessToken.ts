import { useCallback, useEffect, useState } from "react";
import { setGatewayAccessToken } from "./api";
import {
  clearGatewayAccessToken,
  loadGatewayAccessToken,
  saveGatewayAccessToken,
} from "./gateway-token-store";
import { errorMessage } from "./view-utils";

export type GatewayTokenStatus = "empty" | "loading" | "saving" | "stored";

export type GatewayTokenState = {
  hasToken: boolean;
  ready: boolean;
  status: GatewayTokenStatus;
  clearToken: () => Promise<void>;
  saveToken: (token: string) => Promise<void>;
};

export function useGatewayAccessToken(onError: (message: string) => void): GatewayTokenState {
  const [status, setStatus] = useState<GatewayTokenStatus>("loading");
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    let active = true;
    void loadToken(() => active, setStatus, setHasToken, onError);
    return () => {
      active = false;
    };
  }, [onError]);

  const saveToken = useCallback(async (token: string) => {
    await saveTokenValue(token, setStatus, setHasToken, onError);
  }, [onError]);

  const clearToken = useCallback(async () => {
    await clearTokenValue(setStatus, setHasToken, onError);
  }, [onError]);

  return { clearToken, hasToken, ready: status !== "loading", saveToken, status };
}

async function loadToken(
  isActive: () => boolean,
  setStatus: (status: GatewayTokenStatus) => void,
  setHasToken: (hasToken: boolean) => void,
  onError: (message: string) => void,
) {
  try {
    const token = await loadGatewayAccessToken();
    if (isActive()) {
      applyLoadedToken(token, setStatus, setHasToken);
    }
  } catch (error) {
    if (isActive()) {
      setStatus("empty");
      onError(errorMessage(error));
    }
  }
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
  setStatus: (status: GatewayTokenStatus) => void,
  setHasToken: (hasToken: boolean) => void,
  onError: (message: string) => void,
) {
  setStatus("saving");
  try {
    await clearGatewayAccessToken();
    setGatewayAccessToken("");
    setHasToken(false);
    setStatus("empty");
    onError("");
  } catch (error) {
    setStatus("stored");
    onError(errorMessage(error));
  }
}

function applyLoadedToken(
  token: string,
  setStatus: (status: GatewayTokenStatus) => void,
  setHasToken: (hasToken: boolean) => void,
) {
  setGatewayAccessToken(token);
  setHasToken(Boolean(token));
  setStatus(token ? "stored" : "empty");
}
