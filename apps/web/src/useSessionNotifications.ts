import { useCallback, useEffect, useRef, useState } from "react";
import { type TmuxSession } from "./api";
import {
  ensureSessionNotificationPermission,
  sendSessionStatusNotification,
  type SessionStatusChange,
} from "./session-notifications";
import { errorMessage } from "./view-utils";

export type SessionNotificationStatus = "denied" | "enabling" | "off" | "watching";

type SessionNotificationsOptions = {
  hostId: string;
  hostName: string;
  sessions: TmuxSession[];
  sshReady: boolean;
  onError: (message: string) => void;
  onSessionsChange: (sessions: TmuxSession[]) => void;
  refreshSessions: () => Promise<TmuxSession[]>;
};

type SessionSnapshot = {
  hostId: string;
  statuses: Map<string, TmuxSession["status"]>;
};

const sessionNotificationPollIntervalMs = 30000;

export function useSessionNotifications(options: SessionNotificationsOptions) {
  const [enabled, setEnabledState] = useState(false);
  const [status, setStatus] = useState<SessionNotificationStatus>("off");
  const snapshotRef = useRef<SessionSnapshot>(emptySnapshot());

  useEffect(() => {
    syncSessionSnapshot({ enabled, options, snapshotRef });
  }, [enabled, options.hostId, options.hostName, options.onError, options.sessions]);

  useEffect(() => {
    if (!enabled || !options.hostId || !options.sshReady) {
      return;
    }
    return pollSessionStatuses(options);
  }, [enabled, options.hostId, options.onError, options.onSessionsChange, options.refreshSessions, options.sshReady]);

  const setEnabled = useCallback(async (nextEnabled: boolean) => {
    await updateNotificationEnabled(nextEnabled, setEnabledState, setStatus, options.onError);
  }, [options.onError]);

  return { enabled, setEnabled, status };
}

function pollSessionStatuses(options: SessionNotificationsOptions) {
  let active = true;
  const refresh = async () => {
    try {
      const nextSessions = await options.refreshSessions();
      if (active) {
        options.onSessionsChange(nextSessions);
      }
    } catch (error) {
      if (active) {
        options.onError(errorMessage(error));
      }
    }
  };
  void refresh();
  const timer = window.setInterval(() => void refresh(), sessionNotificationPollIntervalMs);
  return () => {
    active = false;
    window.clearInterval(timer);
  };
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
    if (previousStatus && previousStatus !== session.status) {
      changes.push({ hostName: options.hostName, previousStatus, session });
    }
  }
  return changes;
}

function sessionSnapshot(hostId: string, sessions: TmuxSession[]): SessionSnapshot {
  return {
    hostId,
    statuses: new Map(sessions.map((session) => [session.id, session.status])),
  };
}

function emptySnapshot(): SessionSnapshot {
  return { hostId: "", statuses: new Map() };
}
