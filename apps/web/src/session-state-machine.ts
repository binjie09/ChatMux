import { useEffect, useMemo, useState } from "react";
import { type SessionStatus, type TmuxSession } from "./api";
import { type MobilePanel } from "./MobileNavigation";

const sessionStatusTickMs = 30_000;
const viewedSessionIdleAfterMs = 30 * 60_000;

export type SessionViewRecord = {
  lastLeftAt: number;
  lastViewedAt: number;
  viewed: boolean;
};

export type DisplayTmuxSession = TmuxSession & {
  displayStatus: SessionStatus;
  statusLabel: string;
};

type SessionStateOptions = {
  hostId: string;
  mobilePanel: MobilePanel;
  selectedSessionName: string;
  sessions: TmuxSession[];
};

type DisplaySessionInput = {
  now: number;
  record: SessionViewRecord | undefined;
  session: TmuxSession;
  viewing: boolean;
};

const emptyViewRecord: SessionViewRecord = { lastLeftAt: 0, lastViewedAt: 0, viewed: false };

export function useSessionStateMachine(options: SessionStateOptions) {
  const [now, setNow] = useState(Date.now());
  const [viewRecords, setViewRecords] = useState<Record<string, SessionViewRecord>>({});
  const viewedSessionKey = selectedSessionViewKey(options.hostId, options.mobilePanel, options.selectedSessionName);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), sessionStatusTickMs);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setViewRecords((current) => transitionViewRecords(current, viewedSessionKey, Date.now()));
    setNow(Date.now());
  }, [viewedSessionKey]);

  return useMemo(() => options.sessions.map((session) => displaySession({
    now,
    record: viewRecords[sessionViewKey(options.hostId, session.name)],
    session,
    viewing: viewedSessionKey === sessionViewKey(options.hostId, session.name),
  })), [now, options.hostId, options.sessions, viewRecords, viewedSessionKey]);
}

function transitionViewRecords(
  current: Record<string, SessionViewRecord>,
  viewedSessionKey: string,
  now: number,
) {
  const next = leaveViewedSessions(current, viewedSessionKey, now);
  if (!viewedSessionKey) {
    return next;
  }
  return {
    ...next,
    [viewedSessionKey]: {
      ...emptyViewRecord,
      ...next[viewedSessionKey],
      lastLeftAt: 0,
      lastViewedAt: now,
      viewed: true,
    },
  };
}

function leaveViewedSessions(
  current: Record<string, SessionViewRecord>,
  viewedSessionKey: string,
  now: number,
) {
  let next = current;
  for (const [sessionName, record] of Object.entries(current)) {
    if (sessionName === viewedSessionKey || !record.viewed || record.lastLeftAt) {
      continue;
    }
    next = { ...next, [sessionName]: { ...record, lastLeftAt: now } };
  }
  return next;
}

export function displaySession(input: DisplaySessionInput): DisplayTmuxSession {
  const displayStatus = displaySessionStatus(input);
  return {
    ...input.session,
    displayStatus,
    statusLabel: sessionStatusLabel(displayStatus, input.session.processName),
  };
}

export function displaySessionStatus(input: DisplaySessionInput): SessionStatus {
  if (input.session.status === "running" || input.session.status === "failed" || input.session.status === "unknown") {
    return input.session.status;
  }
  if (input.viewing) {
    return "done";
  }
  if (viewedSessionIsIdle(input.record, input.session.updatedAt, input.now)) {
    return "idle";
  }
  return "done";
}

function viewedSessionIsIdle(record: SessionViewRecord | undefined, updatedAt: string, now: number) {
  const idleSince = Math.max(record?.lastLeftAt ?? 0, timestampMs(updatedAt));
  return Boolean(record?.viewed && record.lastLeftAt && now - idleSince >= viewedSessionIdleAfterMs);
}

function timestampMs(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sessionStatusLabel(status: SessionStatus, processName: string) {
  if (status === "running" && processName) {
    return `${processName} running`;
  }
  return status;
}

function selectedSessionViewKey(hostId: string, mobilePanel: MobilePanel, sessionName: string) {
  if (mobilePanel !== "terminal" || !sessionName) {
    return "";
  }
  return sessionViewKey(hostId, sessionName);
}

function sessionViewKey(hostId: string, sessionName: string) {
  return `${hostId}:${sessionName}`;
}
