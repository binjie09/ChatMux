import { useCallback } from "react";
import { createTerminalToken, terminalWebSocketURL } from "./api";
import { type ConnectionStatus } from "./useTerminalSocket";

type TerminalConnectionURLOptions = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
};

export function useTerminalConnectionURL({ getCredentialToken, hostId, sessionName }: TerminalConnectionURLOptions) {
  return useCallback(async (status: ConnectionStatus) => {
    if (!hostId || !sessionName) {
      throw new Error("Host and session are required");
    }
    const credentialToken = await getCredentialToken();
    const token = await createTerminalToken(hostId, sessionName, {
      credentialToken,
      recovering: status === "recovering",
    });
    return terminalWebSocketURL(token);
  }, [getCredentialToken, hostId, sessionName]);
}
