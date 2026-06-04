import { useCallback } from "react";
import { captureTmuxHistory } from "./api";

type TerminalScrollbackHistoryOptions = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
};

export function useTerminalScrollbackHistory({
  getCredentialToken,
  hostId,
  sessionName,
}: TerminalScrollbackHistoryOptions) {
  return useCallback(async (lines: number) => {
    if (!hostId || !sessionName) {
      return "";
    }
    const credentialToken = await getCredentialToken();
    const history = await captureTmuxHistory(hostId, sessionName, credentialToken, {
      lines,
      preserveAnsi: true,
    });
    return history.text;
  }, [getCredentialToken, hostId, sessionName]);
}
