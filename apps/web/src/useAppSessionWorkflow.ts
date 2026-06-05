import { createTmuxSession, listTmuxSessions } from "./tmux-api";
import { type TmuxSession } from "./api";
import { type MobilePanel } from "./MobileNavigation";
import { isSSHFallbackSession } from "./tmux-fallback";
import { type TerminalHistoryState } from "./useTerminalHistoryState";
import { type ConnectionStatus } from "./useTerminalSocket";
import { errorMessage } from "./view-utils";

type SessionSelection = {
  clearSelection: () => void;
  openWindow: (input: { isMobileLayout: boolean; sessionName: string; windowIndex: number }) => void;
  showWindowList: (sessionName: string) => void;
  toggleExpandedSession: (sessionName: string) => void;
  selectedSessionName: string;
  selectedWindowIndex: number | null;
};

type SessionWorkflowOptions = {
  ensureHostTrusted?: (retry: () => Promise<void> | void, actionLabel?: string) => boolean;
  getCredentialToken: () => Promise<string>;
  onHostTrustError?: (error: unknown, retry: () => Promise<void> | void, actionLabel?: string) => boolean;
  history: TerminalHistoryState;
  isMobileLayout: boolean;
  newSessionName: string;
  sessions: TmuxSession[];
  selectedHostId: string;
  selection: SessionSelection;
  sshReady: boolean;
  onAuditRefresh: () => void;
  onError: (message: string) => void;
  onMobilePanelChange: (panel: MobilePanel) => void;
  onMobileSheetClear: () => void;
  onNewSessionNameChange: (name: string) => void;
  onSessionsChange: (sessions: TmuxSession[] | ((current: TmuxSession[]) => TmuxSession[])) => void;
};

export function useAppSessionWorkflow(options: SessionWorkflowOptions) {
  return {
    handleBackToSessions: (session: TmuxSession | undefined) => backToSessions(options, session),
    handleCreateSession: () => createSession(options),
    handleExpandSession: (sessionName: string) => expandSession(options, sessionName),
    handleListSessions: () => listSessions(options),
    handleOpenSessionWindow: (sessionName: string, windowIndex: number, tokenOverride = "") =>
      openWindow(options, sessionName, windowIndex, tokenOverride, false),
    handleTerminalConnectionReady: (status: ConnectionStatus) => terminalConnectionReady(options, status),
  };
}

function expandSession(options: SessionWorkflowOptions, sessionName: string) {
  if (options.isMobileLayout) {
    options.selection.showWindowList(sessionName);
  } else {
    options.selection.toggleExpandedSession(sessionName);
  }
  options.onMobileSheetClear();
  if (sessionName) {
    options.onMobilePanelChange("sessions");
  }
}

function backToSessions(options: SessionWorkflowOptions, session: TmuxSession | undefined) {
  if (options.isMobileLayout && session && session.windowList.length > 1) {
    options.selection.showWindowList(session.name);
  }
  options.onMobilePanelChange("sessions");
}

async function listSessions(options: SessionWorkflowOptions) {
  if (!options.selectedHostId || !options.sshReady) {
    return;
  }
  if (!ensureWorkflowHostTrusted(options, () => listSessions(options))) {
    return;
  }
  await runSessionWorkflow(options, async () => {
    const credentialToken = await options.getCredentialToken();
    const sessions = await listTmuxSessions(options.selectedHostId, credentialToken);
    options.onSessionsChange(sessions);
    options.selection.clearSelection();
    options.onMobilePanelChange("sessions");
    options.history.clear();
    await openFallbackSession(options, sessions, credentialToken);
  });
}

async function openWindow(
  options: SessionWorkflowOptions,
  sessionName: string,
  windowIndex: number,
  tokenOverride: string,
  skipHistory: boolean,
) {
  if (!options.selectedHostId) {
    return;
  }
  if (!ensureWorkflowHostTrusted(options, () => openWindow(options, sessionName, windowIndex, tokenOverride, skipHistory))) {
    return;
  }
  options.selection.openWindow({ isMobileLayout: options.isMobileLayout, sessionName, windowIndex });
  options.onMobileSheetClear();
  options.onMobilePanelChange("terminal");
  await runSessionWorkflow(options, async () => {
    const credentialToken = tokenOverride || await options.getCredentialToken();
    if (!skipHistory && !isFallbackWindow(options, sessionName)) {
      await refreshSessionHistory(options, sessionName, windowIndex, credentialToken);
    }
  });
}

async function createSession(options: SessionWorkflowOptions) {
  if (!options.selectedHostId || !options.newSessionName) {
    return;
  }
  if (!ensureWorkflowHostTrusted(options, () => createSession(options))) {
    return;
  }
  await runSessionWorkflow(options, async () => {
    const credentialToken = await options.getCredentialToken();
    const session = await createTmuxSession(options.selectedHostId, credentialToken, options.newSessionName);
    options.onSessionsChange((current) => [session, ...current.filter((item) => item.name !== session.name)]);
    options.onNewSessionNameChange("");
    await openCreatedSession(options, session, credentialToken);
  });
}

async function openFallbackSession(options: SessionWorkflowOptions, sessions: TmuxSession[], credentialToken: string) {
  const session = sessions.find((item) => isSSHFallbackSession(item));
  const windowIndex = session?.windowList[0]?.index;
  if (!session || windowIndex === undefined) {
    return;
  }
  await openWindow(options, session.name, windowIndex, credentialToken, true);
}

function isFallbackWindow(options: SessionWorkflowOptions, sessionName: string) {
  return isSSHFallbackSession(options.sessions.find((session) => session.name === sessionName));
}

async function terminalConnectionReady(options: SessionWorkflowOptions, status: ConnectionStatus) {
  options.onError("");
  options.onAuditRefresh();
  if (status === "recovering") {
    await runSessionWorkflow(options, () => refreshRecoveredHistory(options));
  }
}

async function runSessionWorkflow(options: SessionWorkflowOptions, action: () => Promise<void>) {
  try {
    await action();
    options.onAuditRefresh();
    options.onError("");
  } catch (error) {
    if (options.onHostTrustError?.(error, () => runSessionWorkflow(options, action))) {
      return;
    }
    options.onError(errorMessage(error));
  }
}

function ensureWorkflowHostTrusted(options: SessionWorkflowOptions, retry: () => Promise<void> | void) {
  return options.ensureHostTrusted?.(retry, "reconnect") ?? true;
}

async function openCreatedSession(options: SessionWorkflowOptions, session: TmuxSession, credentialToken: string) {
  const windowIndex = session.windowList[0]?.index;
  if (windowIndex !== undefined) {
    await openWindow(options, session.name, windowIndex, credentialToken, isSSHFallbackSession(session));
  }
}

async function refreshSessionHistory(
  options: SessionWorkflowOptions,
  sessionName: string,
  windowIndex: number,
  credentialToken: string,
) {
  await options.history.refresh({ credentialToken, hostId: options.selectedHostId, sessionName, windowIndex });
}

async function refreshRecoveredHistory(options: SessionWorkflowOptions) {
  if (!options.selectedHostId || !options.selection.selectedSessionName || options.selection.selectedWindowIndex === null) {
    return;
  }
  if (isFallbackWindow(options, options.selection.selectedSessionName)) {
    return;
  }
  const credentialToken = await options.getCredentialToken();
  await refreshSessionHistory(options, options.selection.selectedSessionName, options.selection.selectedWindowIndex, credentialToken);
}
