import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import {
  createTmuxWindow,
  deleteTmuxSession,
  deleteTmuxWindow,
  listTmuxSessions,
  renameTmuxSession,
  renameTmuxWindow,
} from "./tmux-api";
import { type TmuxSession } from "./api";
import { type MobilePanel } from "./MobileNavigation";
import { findSessionWindow, firstSessionWindowIndex } from "./session-window-utils";
import { errorMessage } from "./view-utils";

type SelectionTarget = {
  sessionName: string;
  windowIndex: number;
};

type SelectionResult = {
  changed: boolean;
  target: SelectionTarget | null;
};

type UseTmuxWindowActionsOptions = {
  ensureHostTrusted?: (retry: () => Promise<void> | void, actionLabel?: string) => boolean;
  getCredentialToken: () => Promise<string>;
  hostId: string;
  isMobileLayout: boolean;
  selectedSessionName: string;
  selectedWindowIndex: number | null;
  sessions: TmuxSession[];
  onAuditRefresh: () => void;
  onError: (message: string) => void;
  onHostTrustError?: (error: unknown, retry: () => Promise<void> | void, actionLabel?: string) => boolean;
  onHistoryClear: () => void;
  onMobilePanelChange: (panel: MobilePanel) => void;
  onMobileSheetClear: () => void;
  onOpenWindow: (sessionName: string, windowIndex: number, tokenOverride?: string) => Promise<void>;
  onSelectionClear: () => void;
  onSelectionOpen: (input: { isMobileLayout: boolean; sessionName: string; windowIndex: number }) => void;
  onSelectionRenameSession: (oldName: string, newName: string) => void;
  onSessionsChange: (sessions: TmuxSession[]) => void;
};

export type TmuxWindowActions = ReturnType<typeof useTmuxWindowActions>;

const noWindowIndex = -1;

export function useTmuxWindowActions(options: UseTmuxWindowActionsOptions) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const applySessionRefresh = useCallback((nextSessions: TmuxSession[]) => {
    const current = optionsRef.current;
    current.onSessionsChange(nextSessions);
    reconcileSelection(current, nextSessions);
  }, []);

  const refreshSessionsKeepingSelection = useCallback(async () => {
    if (!ensureTmuxHostTrusted(optionsRef, refreshSessionsKeepingSelection)) {
      return;
    }
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const nextSessions = await listTmuxSessions(current.hostId, credentialToken);
      const result = applySessions(current, nextSessions);
      await openReconciledWindow(current, result, credentialToken);
    });
  }, []);

  const createWindow = useCallback(async (sessionName: string) => {
    if (!ensureTmuxHostTrusted(optionsRef, () => createWindow(sessionName))) {
      return;
    }
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const windowName = nextWindowName(current.sessions.find((session) => session.name === sessionName));
      const sourceWindowIndex = sourceWindowIndexForCreate(current, sessionName);
      const nextSessions = await createTmuxWindow(current.hostId, sessionName, credentialToken, windowName, sourceWindowIndex);
      current.onSessionsChange(nextSessions);
      const windowIndex = findWindowIndexByName(nextSessions, sessionName, windowName);
      if (windowIndex !== null) {
        await current.onOpenWindow(sessionName, windowIndex, credentialToken);
      }
    });
  }, []);

  const deleteWindow = useCallback(async (sessionName: string, windowIndex: number) => {
    if (!ensureTmuxHostTrusted(optionsRef, () => deleteWindow(sessionName, windowIndex))) {
      return;
    }
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const selectedForDeletion = current.selectedSessionName === sessionName && current.selectedWindowIndex === windowIndex;
      const deletedWindowPosition = windowListPosition(current.sessions, sessionName, windowIndex);
      const deletedSessionPosition = sessionListPosition(current.sessions, sessionName);
      const nextSessions = await deleteTmuxWindow(current.hostId, sessionName, credentialToken, windowIndex);
      const preferred = selectedForDeletion
        ? nextSelectionAfterDeletion(nextSessions, sessionName, deletedWindowPosition, deletedSessionPosition)
        : undefined;
      const result = applySessions(current, nextSessions, preferred);
      await openReconciledWindow(current, result, credentialToken);
    });
  }, []);

  const deleteSession = useCallback(async (sessionName: string) => {
    if (!ensureTmuxHostTrusted(optionsRef, () => deleteSession(sessionName))) {
      return;
    }
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const deletingSelected = current.selectedSessionName === sessionName;
      const deletedSessionPosition = sessionListPosition(current.sessions, sessionName);
      const nextSessions = await deleteTmuxSession(current.hostId, sessionName, credentialToken);
      const preferred = deletingSelected
        ? nextSelectionAfterDeletion(nextSessions, sessionName, null, deletedSessionPosition)
        : undefined;
      const result = applySessions(current, nextSessions, preferred);
      await openReconciledWindow(current, result, credentialToken);
    });
  }, []);

  const renameWindow = useCallback(async (sessionName: string, windowIndex: number, name: string) => {
    if (!ensureTmuxHostTrusted(optionsRef, () => renameWindow(sessionName, windowIndex, name))) {
      return;
    }
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const nextSessions = await renameTmuxWindow(current.hostId, sessionName, credentialToken, windowIndex, name);
      applySessions(current, nextSessions);
    });
  }, []);

  const renameSession = useCallback(async (sessionName: string, name: string) => {
    if (!ensureTmuxHostTrusted(optionsRef, () => renameSession(sessionName, name))) {
      return;
    }
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const nextSessions = await renameTmuxSession(current.hostId, sessionName, credentialToken, name);
      const preferred = renamedSelectionTarget(current, sessionName, name);
      const result = applySessions(current, nextSessions, preferred);
      current.onSelectionRenameSession(sessionName, name);
      await openReconciledWindow(current, result, credentialToken);
    });
  }, []);

  return { applySessionRefresh, createWindow, deleteSession, deleteWindow, refreshSessionsKeepingSelection, renameSession, renameWindow };
}

function sourceWindowIndexForCreate(options: UseTmuxWindowActionsOptions, sessionName: string) {
  if (options.selectedSessionName !== sessionName) {
    return null;
  }
  return options.selectedWindowIndex;
}

async function runTmuxAction(
  optionsRef: MutableRefObject<UseTmuxWindowActionsOptions>,
  action: (options: UseTmuxWindowActionsOptions) => Promise<void>,
) {
  const current = optionsRef.current;
  if (!current.hostId) {
    return;
  }
  try {
    await action(current);
    current.onAuditRefresh();
    current.onError("");
  } catch (error) {
    if (current.onHostTrustError?.(error, () => runTmuxAction(optionsRef, action))) {
      return;
    }
    current.onError(errorMessage(error));
  }
}

function ensureTmuxHostTrusted(
  optionsRef: MutableRefObject<UseTmuxWindowActionsOptions>,
  retry: () => Promise<void> | void,
) {
  return optionsRef.current.ensureHostTrusted?.(retry, "reconnect") ?? true;
}

function applySessions(
  options: UseTmuxWindowActionsOptions,
  nextSessions: TmuxSession[],
  preferred?: SelectionTarget | null,
) {
  options.onSessionsChange(nextSessions);
  return reconcileSelection(options, nextSessions, preferred);
}

function reconcileSelection(
  options: UseTmuxWindowActionsOptions,
  nextSessions: TmuxSession[],
  preferred?: SelectionTarget | null,
): SelectionResult {
  const currentTarget = preferred === undefined ? selectedTarget(options) : preferred;
  if (!currentTarget) {
    return { changed: false, target: null };
  }
  const nextTarget = resolveSelectionTarget(nextSessions, currentTarget);
  if (!nextTarget) {
    clearMissingSelection(options);
    return { changed: true, target: null };
  }
  if (selectionMatches(options, nextTarget)) {
    return { changed: false, target: nextTarget };
  }
  options.onSelectionOpen({ isMobileLayout: options.isMobileLayout, ...nextTarget });
  return { changed: true, target: nextTarget };
}

function selectedTarget(options: UseTmuxWindowActionsOptions): SelectionTarget | null {
  if (!options.selectedSessionName || options.selectedWindowIndex === null) {
    return null;
  }
  return { sessionName: options.selectedSessionName, windowIndex: options.selectedWindowIndex };
}

function resolveSelectionTarget(sessions: TmuxSession[], target: SelectionTarget) {
  const session = sessions.find((item) => item.name === target.sessionName);
  if (!session) {
    return null;
  }
  if (findSessionWindow(session, target.windowIndex)) {
    return target;
  }
  const windowIndex = firstSessionWindowIndex(session);
  return windowIndex === null ? null : { sessionName: session.name, windowIndex };
}

function clearMissingSelection(options: UseTmuxWindowActionsOptions) {
  options.onSelectionClear();
  options.onHistoryClear();
  options.onMobileSheetClear();
  options.onMobilePanelChange("sessions");
}

function selectionMatches(options: UseTmuxWindowActionsOptions, target: SelectionTarget) {
  return options.selectedSessionName === target.sessionName && options.selectedWindowIndex === target.windowIndex;
}

async function openReconciledWindow(
  options: UseTmuxWindowActionsOptions,
  result: SelectionResult,
  credentialToken: string,
) {
  if (result.changed && result.target) {
    await options.onOpenWindow(result.target.sessionName, result.target.windowIndex, credentialToken);
  }
}

function renamedSelectionTarget(
  options: UseTmuxWindowActionsOptions,
  oldName: string,
  newName: string,
): SelectionTarget | null | undefined {
  if (options.selectedSessionName !== oldName || options.selectedWindowIndex === null) {
    return undefined;
  }
  return { sessionName: newName, windowIndex: options.selectedWindowIndex };
}

function windowListPosition(sessions: TmuxSession[], sessionName: string, windowIndex: number): number | null {
  const session = sessions.find((item) => item.name === sessionName);
  if (!session) {
    return null;
  }
  const position = session.windowList.findIndex((window) => window.index === windowIndex);
  return position === -1 ? null : position;
}

function sessionListPosition(sessions: TmuxSession[], sessionName: string): number | null {
  const position = sessions.findIndex((session) => session.name === sessionName);
  return position === -1 ? null : position;
}

// Pick the target to focus after a deletion: the next sibling (window or session) by
// list position, falling back to the previous one when the deleted item was last.
// Positions are computed against the pre-deletion list and resolved on the
// post-deletion list, which is robust to index gaps and renumbering.
function nextSelectionAfterDeletion(
  nextSessions: TmuxSession[],
  deletedSessionName: string,
  deletedWindowPosition: number | null,
  deletedSessionPosition: number | null,
): SelectionTarget | undefined {
  const session = nextSessions.find((item) => item.name === deletedSessionName);
  if (session && session.windowList.length > 0) {
    const window = session.windowList[nextListPosition(deletedWindowPosition, session.windowList.length)];
    return { sessionName: session.name, windowIndex: window.index };
  }
  if (nextSessions.length === 0 || deletedSessionPosition === null) {
    return undefined;
  }
  const nextSession = nextSessions[nextListPosition(deletedSessionPosition, nextSessions.length)];
  const windowIndex = activeOrFirstWindowIndex(nextSession);
  return windowIndex === null ? undefined : { sessionName: nextSession.name, windowIndex };
}

// After removing the item at `deletedPosition`, the following item shifts into that
// slot; if the deleted item was last, take the new final slot instead.
function nextListPosition(deletedPosition: number | null, listLength: number): number {
  if (deletedPosition !== null && deletedPosition < listLength) {
    return deletedPosition;
  }
  return Math.max(0, listLength - 1);
}

function activeOrFirstWindowIndex(session: TmuxSession): number | null {
  const active = session.windowList.find((window) => window.active);
  if (active) {
    return active.index;
  }
  return firstSessionWindowIndex(session);
}

function nextWindowName(session: TmuxSession | undefined) {
  let index = nextWindowIndex(session);
  while (session?.windowList.some((window) => window.name === `window-${index}`)) {
    index += 1;
  }
  return `window-${index}`;
}

function nextWindowIndex(session: TmuxSession | undefined) {
  return (session?.windowList.reduce((maxIndex, window) => Math.max(maxIndex, window.index), noWindowIndex) ?? noWindowIndex) + 1;
}

function findWindowIndexByName(sessions: TmuxSession[], sessionName: string, windowName: string) {
  const session = sessions.find((item) => item.name === sessionName);
  const window = session?.windowList.find((item) => item.name === windowName);
  return window?.index ?? null;
}
