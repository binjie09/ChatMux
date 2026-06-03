import { useCallback, useState } from "react";
import { createSSHCredential, type SSHCredential } from "./api";

const credentialRefreshBufferMs = 60_000;

type SSHCredentialState = {
  expiresAt: number;
  token: string;
};

const emptyCredential: SSHCredentialState = { expiresAt: 0, token: "" };

export function useSSHCredentialToken() {
  const [credential, setCredential] = useState<SSHCredentialState>(emptyCredential);
  const [sshPassword, setSSHPasswordState] = useState("");

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
    const nextCredential = await createSSHCredential(hostId, sshPassword);
    const nextState = credentialStateFromResponse(nextCredential, Date.now());
    setCredential(nextState);
    return nextState.token;
  }, [credential, sshPassword]);

  return {
    credentialToken: credential.token,
    ensureSSHCredentialToken,
    ready: Boolean(sshPassword),
    resetCredential,
    setSSHPassword,
    sshPassword,
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
