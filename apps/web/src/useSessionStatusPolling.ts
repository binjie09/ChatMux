import { useEffect } from "react";
import { type TmuxSession } from "./api";
import { errorMessage } from "./view-utils";

const sessionStatusPollIntervalMs = 2_000;

type SessionStatusPollingOptions = {
  hostId: string;
  refreshSessions: () => Promise<TmuxSession[]>;
  sshReady: boolean;
  onError: (message: string) => void;
  onRefreshError?: () => void;
  onRefreshSuccess?: () => void;
  onSessionsChange: (sessions: TmuxSession[]) => void;
};

export function useSessionStatusPolling(options: SessionStatusPollingOptions) {
  useEffect(() => {
    if (!options.hostId || !options.sshReady) {
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const nextSessions = await options.refreshSessions();
        if (active) {
          options.onRefreshSuccess?.();
          options.onSessionsChange(nextSessions);
        }
      } catch (error) {
        if (active) {
          options.onRefreshError?.();
          options.onError(errorMessage(error));
        }
      }
    };
    const timer = window.setInterval(() => void refresh(), sessionStatusPollIntervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    options.hostId,
    options.onError,
    options.onRefreshError,
    options.onRefreshSuccess,
    options.onSessionsChange,
    options.refreshSessions,
    options.sshReady,
  ]);
}
