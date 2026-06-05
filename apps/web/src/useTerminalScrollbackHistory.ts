import { useCallback } from "react";
import { captureTmuxHistory } from "./api";

type TerminalScrollbackHistoryOptions = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  windowIndex: number | null;
};

export function useTerminalScrollbackHistory({
  getCredentialToken,
  hostId,
  sessionName,
  windowIndex,
}: TerminalScrollbackHistoryOptions) {
  return useCallback(async (lines: number) => {
    if (!hostId || !sessionName || windowIndex === null) {
      return "";
    }
    const credentialToken = await getCredentialToken();
    const history = await captureTmuxHistory(hostId, sessionName, credentialToken, {
      lines,
      preserveAnsi: true,
      windowIndex,
    });
    return history.text;
  }, [getCredentialToken, hostId, sessionName, windowIndex]);
}
