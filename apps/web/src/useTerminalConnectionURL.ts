import { useCallback } from "react";
import { createTerminalToken, terminalWebSocketURL, type TmuxSession } from "./api";
import { isSSHFallbackSession } from "./tmux-fallback";
import { type ConnectionStatus } from "./useTerminalSocket";

type TerminalConnectionURLOptions = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  selectedSession: TmuxSession | undefined;
  sessionName: string;
  windowIndex: number | null;
};

export function useTerminalConnectionURL({
  getCredentialToken,
  hostId,
  selectedSession,
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
      mode: isSSHFallbackSession(selectedSession) ? "ssh" : "tmux",
      recovering: status === "recovering",
      windowIndex,
    });
    return terminalWebSocketURL(token);
  }, [getCredentialToken, hostId, selectedSession, sessionName, windowIndex]);
}
