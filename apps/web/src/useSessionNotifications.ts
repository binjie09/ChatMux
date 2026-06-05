import { useCallback, useEffect, useRef, useState } from "react";
import { type SessionStatus } from "./api";
import { type DisplayTmuxSession } from "./session-state-machine";
import {
  ensureSessionNotificationPermission,
  sendSessionStatusNotification,
  type SessionStatusChange,
} from "./session-notifications";
import { errorMessage } from "./view-utils";

export type SessionNotificationStatus = "credential-error" | "credential-needed" | "denied" | "enabling" | "off" | "watching";

type SessionNotificationsOptions = {
  hostId: string;
  hostName: string;
  sessions: DisplayTmuxSession[];
  sshReady: boolean;
  onError: (message: string) => void;
};

type SessionSnapshot = {
  hostId: string;
  statuses: Map<string, SessionStatus>;
};

export function useSessionNotifications(options: SessionNotificationsOptions) {
  const [enabled, setEnabledState] = useState(false);
  const [status, setStatus] = useState<SessionNotificationStatus>("off");
  const snapshotRef = useRef<SessionSnapshot>(emptySnapshot());

  useEffect(() => {
    syncSessionSnapshot({ enabled, options, snapshotRef });
  }, [enabled, options.hostId, options.hostName, options.onError, options.sessions]);

  useEffect(() => {
    syncCredentialStatus(enabled, options.hostId, options.sshReady, setStatus);
  }, [enabled, options.hostId, options.sshReady]);

  const setEnabled = useCallback(async (nextEnabled: boolean) => {
    await updateNotificationEnabled(nextEnabled, setEnabledState, setStatus, options.onError);
  }, [options.onError]);

  const markRefreshError = useCallback(() => {
    if (enabled) {
      setStatus("credential-error");
    }
  }, [enabled]);
  const markRefreshSuccess = useCallback(() => {
    if (enabled && options.hostId && options.sshReady) {
      setStatus("watching");
    }
  }, [enabled, options.hostId, options.sshReady]);

  return { enabled, markRefreshError, markRefreshSuccess, setEnabled, status };
}

function syncCredentialStatus(
  enabled: boolean,
  hostId: string,
  sshReady: boolean,
  setStatus: (status: SessionNotificationStatus) => void,
) {
  if (!enabled || !hostId) {
    return;
  }
  if (!sshReady) {
    setStatus("credential-needed");
    return;
  }
  setStatus("watching");
}

async function updateNotificationEnabled(
  enabled: boolean,
  setEnabledState: (enabled: boolean) => void,
  setStatus: (status: SessionNotificationStatus) => void,
  onError: (message: string) => void,
) {
  if (!enabled) {
    setEnabledState(false);
    setStatus("off");
    return;
  }
  setStatus("enabling");
  try {
    await ensureSessionNotificationPermission();
    setEnabledState(true);
    setStatus("watching");
    onError("");
  } catch (error) {
    setEnabledState(false);
    setStatus("denied");
    onError(errorMessage(error));
  }
}

function syncSessionSnapshot(args: {
  enabled: boolean;
  options: SessionNotificationsOptions;
  snapshotRef: React.MutableRefObject<SessionSnapshot>;
}) {
  const nextSnapshot = sessionSnapshot(args.options.hostId, args.options.sessions);
  if (!args.enabled || args.snapshotRef.current.hostId !== args.options.hostId) {
    args.snapshotRef.current = nextSnapshot;
    return;
  }
  for (const change of sessionStatusChanges(args.options, args.snapshotRef.current)) {
    void sendSessionStatusNotification(change).catch((error) => {
      args.options.onError(errorMessage(error));
    });
  }
  args.snapshotRef.current = nextSnapshot;
}

function sessionStatusChanges(options: SessionNotificationsOptions, snapshot: SessionSnapshot) {
  const changes: SessionStatusChange[] = [];
  for (const session of options.sessions) {
    const previousStatus = snapshot.statuses.get(session.id);
    if (previousStatus && previousStatus !== session.displayStatus) {
      changes.push({ hostName: options.hostName, previousStatus, session });
    }
  }
  return changes;
}

function sessionSnapshot(hostId: string, sessions: DisplayTmuxSession[]): SessionSnapshot {
  return {
    hostId,
    statuses: new Map(sessions.map((session) => [session.id, session.displayStatus])),
  };
}

function emptySnapshot(): SessionSnapshot {
  return { hostId: "", statuses: new Map() };
}
