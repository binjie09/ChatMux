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
  token: string;
};

type CredentialStatusInput = {
  credential: SSHCredentialState;
  hasPassword: boolean;
  now: number;
  refreshing: boolean;
};

const emptyCredential: SSHCredentialState = { expiresAt: 0, token: "" };

export function useSSHCredentialToken() {
  const [credential, setCredential] = useState<SSHCredentialState>(emptyCredential);
  const [refreshing, setRefreshing] = useState(false);
  const [sshPassword, setSSHPasswordState] = useState("");
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

  const setSSHPassword = useCallback((value: string) => {
    setSSHPasswordState(value);
    setCredential(emptyCredential);
  }, []);

  const ensureSSHCredentialToken = useCallback(async (hostId: string) => {
    if (!hostId || !sshPassword) {
      throw new Error("Host and password are required");
    }
    if (credentialIsFresh(credential, Date.now())) {
      return credential.token;
    }
    try {
      setRefreshing(true);
      const now = Date.now();
      const nextCredential = await createSSHCredential(hostId, sshPassword);
      const nextState = credentialStateFromResponse(nextCredential, now);
      setCredential(nextState);
      setStatusNow(now);
      return nextState.token;
    } finally {
      setRefreshing(false);
    }
  }, [credential, sshPassword]);

  return {
    credentialToken: credential.token,
    ensureSSHCredentialToken,
    ready: Boolean(sshPassword),
    resetCredential,
    setSSHPassword,
    sshPassword,
    status: credentialStatus({
      credential,
      hasPassword: Boolean(sshPassword),
      now: statusNow,
      refreshing,
    }),
  };
}

function credentialIsFresh(credential: SSHCredentialState, now: number) {
  return Boolean(credential.token && credential.expiresAt - now > credentialRefreshBufferMs);
}

function credentialStateFromResponse(credential: SSHCredential, now: number): SSHCredentialState {
  return {
    expiresAt: now + credential.expiresIn * 1000,
    token: credential.token,
  };
}

function credentialStatus(input: CredentialStatusInput): SSHCredentialStatus {
  if (input.refreshing) {
    return { label: "Refreshing", tone: "refreshing" };
  }
  if (!input.hasPassword) {
    return { label: "Password needed", tone: "empty" };
  }
  if (!input.credential.token) {
    return { label: "Ready to connect", tone: "empty" };
  }
  if (input.credential.expiresAt <= input.now) {
    return { label: "Expired", tone: "expired" };
  }
  return { label: `Ready ${credentialMinutesRemaining(input.credential, input.now)}m`, tone: "ready" };
}

function credentialMinutesRemaining(credential: SSHCredentialState, now: number) {
  return Math.max(1, Math.ceil((credential.expiresAt - now) / minuteMs));
}
