import { useCallback, useEffect, useRef, useState } from "react";
import { type Host } from "./api";
import { errorMessage } from "./view-utils";

const untrustedHostKeyMessage = "host key is not trusted";

export type HostTrustRetry = () => Promise<void> | void;

export type HostTrustRequest = {
  actionLabel: string;
  hostId: string;
  hostName: string;
  hostname: string;
  port: number;
  retry: HostTrustRetry;
};

type HostTrustPromptOptions = {
  selectedHost: Host | undefined;
  onError: (message: string) => void;
  onTrustHost: (hostId: string) => Promise<Host | null>;
};

export function useHostTrustPrompt(options: HostTrustPromptOptions) {
  const [request, setRequest] = useState<HostTrustRequest | null>(null);
  const [trusting, setTrusting] = useState(false);
  const hostRef = useRef(options.selectedHost);
  const trustedHostIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    hostRef.current = options.selectedHost;
    if (options.selectedHost?.hostKeyFingerprint) {
      trustedHostIdsRef.current.add(options.selectedHost.id);
    }
  }, [options.selectedHost]);

  const isHostTrusted = useCallback((host: Host | undefined) => {
    return Boolean(host && (host.hostKeyFingerprint || trustedHostIdsRef.current.has(host.id)));
  }, []);

  const ensureHostTrusted = useCallback((retry: HostTrustRetry, actionLabel = "Reconnect") => {
    const host = hostRef.current;
    if (!host) {
      options.onError("Host is required");
      return false;
    }
    if (host.hostKeyFingerprint || trustedHostIdsRef.current.has(host.id)) {
      return true;
    }
    setRequest(hostTrustRequest(host, actionLabel, retry));
    options.onError("");
    return false;
  }, [options.onError]);

  const handleHostTrustError = useCallback((error: unknown, retry: HostTrustRetry, actionLabel = "Reconnect") => {
    const host = hostRef.current;
    if (!host || !isHostKeyTrustError(error)) {
      return false;
    }
    setRequest(hostTrustRequest(host, actionLabel, retry));
    options.onError("");
    return true;
  }, [options.onError]);

  const cancelHostTrust = useCallback(() => {
    setRequest(null);
  }, []);

  const confirmHostTrust = useCallback(async () => {
    if (!request) {
      return;
    }
    setTrusting(true);
    try {
      await options.onTrustHost(request.hostId);
      trustedHostIdsRef.current.add(request.hostId);
      setRequest(null);
      options.onError("");
      await request.retry();
    } catch (error) {
      options.onError(errorMessage(error));
    } finally {
      setTrusting(false);
    }
  }, [options, request]);

  return {
    cancelHostTrust,
    confirmHostTrust,
    ensureHostTrusted,
    handleHostTrustError,
    isHostTrusted,
    request,
    trusting,
  };
}

export function isHostKeyTrustError(error: unknown) {
  return hostTrustErrorText(errorMessage(error)).includes(untrustedHostKeyMessage);
}

function hostTrustRequest(host: Host, actionLabel: string, retry: HostTrustRetry): HostTrustRequest {
  return {
    actionLabel,
    hostId: host.id,
    hostName: host.name,
    hostname: host.hostname,
    port: host.port,
    retry,
  };
}

function hostTrustErrorText(message: string) {
  try {
    const payload = JSON.parse(message) as { error?: unknown };
    if (typeof payload.error === "string") {
      return payload.error;
    }
  } catch {
    return message;
  }
  return message;
}
