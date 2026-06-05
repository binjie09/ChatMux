import { useCallback } from "react";
import { type TmuxSession } from "./api";
import { listTmuxSessions } from "./tmux-api";
import { type MobilePanel } from "./MobileNavigation";
import { useSessionStateMachine } from "./session-state-machine";
import { useSessionNotifications } from "./useSessionNotifications";
import { useSessionStatusPolling } from "./useSessionStatusPolling";

type SessionWorkspaceStateOptions = {
  hostId: string;
  hostName: string;
  mobilePanel: MobilePanel;
  selectedSessionName: string;
  sessions: TmuxSession[];
  sshReady: boolean;
  getCredentialToken: () => Promise<string>;
  onError: (message: string) => void;
  onSessionsChange: (sessions: TmuxSession[]) => void;
};

export function useSessionWorkspaceState(options: SessionWorkspaceStateOptions) {
  const refreshSessions = useCallback(async () => {
    if (!options.hostId || !options.sshReady) {
      return [];
    }
    const credentialToken = await options.getCredentialToken();
    return listTmuxSessions(options.hostId, credentialToken);
  }, [options.getCredentialToken, options.hostId, options.sshReady]);

  const displaySessions = useSessionStateMachine({
    hostId: options.hostId,
    mobilePanel: options.mobilePanel,
    selectedSessionName: options.selectedSessionName,
    sessions: options.sessions,
  });
  const notifications = useSessionNotifications({
    hostId: options.hostId,
    hostName: options.hostName,
    onError: options.onError,
    sessions: displaySessions,
    sshReady: options.sshReady,
  });
  useSessionStatusPolling({
    hostId: options.hostId,
    onError: options.onError,
    onRefreshError: notifications.markRefreshError,
    onRefreshSuccess: notifications.markRefreshSuccess,
    onSessionsChange: options.onSessionsChange,
    refreshSessions,
    sshReady: options.sshReady,
  });
  return { displaySessions, notifications };
}
