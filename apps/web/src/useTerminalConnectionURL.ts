import { useCallback } from "react";
import { createTerminalToken, terminalWebSocketURL } from "./api";
import { type ConnectionStatus } from "./useTerminalSocket";

type TerminalConnectionURLOptions = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  windowIndex: number | null;
};

export function useTerminalConnectionURL({
  getCredentialToken,
  hostId,
  sessionName,
  windowIndex,
}: TerminalConnectionURLOptions) {
  return useCallback(async (status: ConnectionStatus) => {
    if (!hostId || !sessionName || windowIndex === null) {
      throw new Error("Host, session, and window are required");
    }
    const credentialToken = await getCredentialToken();
    const token = await createTerminalToken(hostId, sessionName, {
      credentialToken,
      recovering: status === "recovering",
      windowIndex,
    });
    return terminalWebSocketURL(token);
  }, [getCredentialToken, hostId, sessionName, windowIndex]);
}
