import { createTmuxSession, listTmuxSessions } from "./tmux-api";
import { type TmuxSession, getHostLastWindow, saveHostLastWindow } from "./api";
import { clearLastWindowSelection, loadLastWindowSelection, saveLastWindowSelection } from "./last-window-selection";
import { type MobilePanel } from "./MobileNavigation";
import { findSessionWindow, firstSessionWindowIndex } from "./session-window-utils";
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
  canRestoreLastWindow: () => boolean;
  ensureHostTrusted?: (retry: () => Promise<void> | void, actionLabel?: string) => boolean;
  getCredentialToken: () => Promise<string>;
  onHostTrustError?: (error: unknown, retry: () => Promise<void> | void, actionLabel?: string) => boolean;
  history: TerminalHistoryState;
  isMobileLayout: boolean;
  newSessionName: string;
  restoreLastWindow: boolean;
  sessions: TmuxSession[];
  selectedHostId: string;
  selection: SessionSelection;
  sshReady: boolean;
  onAuditRefresh: () => void;
  onError: (message: string) => void;
  onMobilePanelChange: (panel: MobilePanel) => void;
  onMobileSheetClear: () => void;
  onNewSessionNameChange: (name: string) => void;
  onLastWindowRestoreFinished?: (opened: boolean) => void;
  onSessionsChange: (sessions: TmuxSession[] | ((current: TmuxSession[]) => TmuxSession[])) => void;
};

type ListSessionsBehavior = {
  openLastWindow: boolean;
  openHostLastWindow: boolean;
  openFallback: boolean;
  revealPanel: boolean;
};

export function useAppSessionWorkflow(options: SessionWorkflowOptions) {
  return {
    handleAutoListSessions: () => listSessions(options, { openLastWindow: options.restoreLastWindow, openHostLastWindow: true, openFallback: false, revealPanel: false }),
    handleBackToSessions: (session: TmuxSession | undefined) => backToSessions(options, session),
    handleCreateSession: () => createSession(options),
    handleExpandSession: (sessionName: string) => expandSession(options, sessionName),
    handleListSessions: () => listSessions(options, { openLastWindow: false, openHostLastWindow: false, openFallback: true, revealPanel: true }),
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

async function listSessions(options: SessionWorkflowOptions, behavior: ListSessionsBehavior) {
  if (!options.selectedHostId || !options.sshReady) {
    return;
  }
  if (!ensureWorkflowHostTrusted(options, () => listSessions(options, behavior))) {
    return;
  }
  await runSessionWorkflow(options, async () => {
    const credentialToken = await options.getCredentialToken();
    const sessions = await listTmuxSessions(options.selectedHostId, credentialToken);
    options.onSessionsChange(sessions);
    if (behavior.revealPanel) {
      options.onMobilePanelChange("sessions");
    }
    if (behavior.openLastWindow) {
      const openedLastWindow = options.canRestoreLastWindow()
        ? await openLastWindowSelection(options, sessions, credentialToken)
        : false;
      options.onLastWindowRestoreFinished?.(openedLastWindow);
      if (openedLastWindow) {
        return;
      }
    }
    if (behavior.openHostLastWindow) {
      const openedHostWindow = await openHostLastWindowSelection(options, sessions, credentialToken);
      if (openedHostWindow) {
        return;
      }
    }
    options.selection.clearSelection();
    options.history.clear();
    if (behavior.openFallback) {
      await openFallbackSession(options, sessions, credentialToken);
    }
  }, behavior.openLastWindow ? () => options.onLastWindowRestoreFinished?.(false) : undefined);
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
  saveLastWindowSelection({ hostId: options.selectedHostId, sessionName, windowIndex });
  void saveHostLastWindow(options.selectedHostId, sessionName, windowIndex).catch(() => {});
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

async function openLastWindowSelection(options: SessionWorkflowOptions, sessions: TmuxSession[], credentialToken: string) {
  const target = lastWindowTarget(options.selectedHostId, sessions);
  if (!target || !options.canRestoreLastWindow()) {
    return false;
  }
  await openWindow(options, target.sessionName, target.windowIndex, credentialToken, false);
  return true;
}

function lastWindowTarget(hostId: string, sessions: TmuxSession[]) {
  const lastSelection = loadLastWindowSelection();
  if (!lastSelection || lastSelection.hostId !== hostId) {
    return null;
  }
  const session = sessions.find((item) => item.name === lastSelection.sessionName);
  if (!session) {
    clearLastWindowSelection();
    return null;
  }
  if (findSessionWindow(session, lastSelection.windowIndex)) {
    return { sessionName: session.name, windowIndex: lastSelection.windowIndex };
  }
  const windowIndex = firstSessionWindowIndex(session);
  return windowIndex === null ? null : { sessionName: session.name, windowIndex };
}

async function openHostLastWindowSelection(options: SessionWorkflowOptions, sessions: TmuxSession[], credentialToken: string) {
  const target = await hostLastWindowTarget(options.selectedHostId, sessions);
  if (!target) {
    return false;
  }
  await openWindow(options, target.sessionName, target.windowIndex, credentialToken, false);
  return true;
}

async function hostLastWindowTarget(hostId: string, sessions: TmuxSession[]) {
  if (!hostId) {
    return null;
  }
  const lastWindow = await getHostLastWindow(hostId);
  if (!lastWindow) {
    return null;
  }
  const session = sessions.find((item) => item.name === lastWindow.sessionName);
  if (!session) {
    return null;
  }
  if (findSessionWindow(session, lastWindow.windowIndex)) {
    return { sessionName: session.name, windowIndex: lastWindow.windowIndex };
  }
  const windowIndex = firstSessionWindowIndex(session);
  return windowIndex === null ? null : { sessionName: session.name, windowIndex };
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

async function runSessionWorkflow(
  options: SessionWorkflowOptions,
  action: () => Promise<void>,
  onWorkflowFailure?: () => void,
) {
  try {
    await action();
    options.onAuditRefresh();
    options.onError("");
  } catch (error) {
    if (options.onHostTrustError?.(error, () => runSessionWorkflow(options, action, onWorkflowFailure))) {
      return;
    }
    onWorkflowFailure?.();
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
