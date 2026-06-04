import { useCallback, useEffect, useState } from "react";
import { createSSHCredential, type SSHCredential } from "./api";

const credentialRefreshBufferMs = 60_000;
const credentialStatusTickMs = 30_000;
const minuteMs = 60_000;

export type SSHCredentialStatus = {
  label: string;
  tone: "empty" | "expired" | "ready" | "refreshing";
};

type SSHCredentialState = {
  expiresAt: number;
  hostId: string;
  token: string;
};

type CredentialStatusInput = {
  credential: SSHCredentialState;
  hasCredential: boolean;
  now: number;
  refreshing: boolean;
};

const emptyCredential: SSHCredentialState = { expiresAt: 0, hostId: "", token: "" };

export function useSSHCredentialToken(hasCredential: boolean) {
  const [credential, setCredential] = useState<SSHCredentialState>(emptyCredential);
  const [refreshing, setRefreshing] = useState(false);
  const [statusNow, setStatusNow] = useState(Date.now());

  useEffect(() => {
    if (!credential.token) {
      return;
    }
    const timer = window.setInterval(() => setStatusNow(Date.now()), credentialStatusTickMs);
    return () => window.clearInterval(timer);
  }, [credential.expiresAt, credential.token]);

  const resetCredential = useCallback(() => {
    setCredential(emptyCredential);
  }, []);

  const ensureSSHCredentialToken = useCallback(async (hostId: string) => {
    if (!hostId || !hasCredential) {
      throw new Error("SSH credential is required");
    }
    if (credentialIsFresh(credential, hostId, Date.now())) {
      return credential.token;
    }
    try {
      setRefreshing(true);
      const now = Date.now();
      const nextCredential = await createSSHCredential(hostId);
      const nextState = credentialStateFromResponse(nextCredential, hostId, now);
      setCredential(nextState);
      setStatusNow(now);
      return nextState.token;
    } finally {
      setRefreshing(false);
    }
  }, [credential, hasCredential]);

  return {
    credentialToken: credential.token,
    ensureSSHCredentialToken,
    ready: hasCredential,
    resetCredential,
    status: credentialStatus({
      credential,
      hasCredential,
      now: statusNow,
      refreshing,
    }),
  };
}

function credentialIsFresh(credential: SSHCredentialState, hostId: string, now: number) {
  return Boolean(credential.hostId === hostId && credential.token && credential.expiresAt - now > credentialRefreshBufferMs);
}

function credentialStateFromResponse(credential: SSHCredential, hostId: string, now: number): SSHCredentialState {
  return {
    expiresAt: now + credential.expiresIn * 1000,
    hostId,
    token: credential.token,
  };
}

function credentialStatus(input: CredentialStatusInput): SSHCredentialStatus {
  if (input.refreshing) {
    return { label: "Connecting", tone: "refreshing" };
  }
  if (!input.hasCredential) {
    return { label: "Save SSH credential", tone: "empty" };
  }
  if (!input.credential.token) {
    return { label: "Connecting", tone: "empty" };
  }
  if (input.credential.expiresAt <= input.now) {
    return { label: "Expired", tone: "expired" };
  }
  return { label: `Ready ${credentialMinutesRemaining(input.credential, input.now)}m`, tone: "ready" };
}

function credentialMinutesRemaining(credential: SSHCredentialState, now: number) {
  return Math.max(1, Math.ceil((credential.expiresAt - now) / minuteMs));
}
