import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import {
  createTmuxWindow,
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
  getCredentialToken: () => Promise<string>;
  hostId: string;
  isMobileLayout: boolean;
  selectedSessionName: string;
  selectedWindowIndex: number | null;
  sessions: TmuxSession[];
  onAuditRefresh: () => void;
  onError: (message: string) => void;
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
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const nextSessions = await listTmuxSessions(current.hostId, credentialToken);
      const result = applySessions(current, nextSessions);
      await openReconciledWindow(current, result, credentialToken);
    });
  }, []);

  const createWindow = useCallback(async (sessionName: string) => {
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const windowName = nextWindowName(current.sessions.find((session) => session.name === sessionName));
      const nextSessions = await createTmuxWindow(current.hostId, sessionName, credentialToken, windowName);
      current.onSessionsChange(nextSessions);
      const windowIndex = findWindowIndexByName(nextSessions, sessionName, windowName);
      if (windowIndex !== null) {
        await current.onOpenWindow(sessionName, windowIndex, credentialToken);
      }
    });
  }, []);

  const deleteWindow = useCallback(async (sessionName: string, windowIndex: number) => {
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const nextSessions = await deleteTmuxWindow(current.hostId, sessionName, credentialToken, windowIndex);
      const result = applySessions(current, nextSessions);
      await openReconciledWindow(current, result, credentialToken);
    });
  }, []);

  const renameWindow = useCallback(async (sessionName: string, windowIndex: number, name: string) => {
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const nextSessions = await renameTmuxWindow(current.hostId, sessionName, credentialToken, windowIndex, name);
      applySessions(current, nextSessions);
    });
  }, []);

  const renameSession = useCallback(async (sessionName: string, name: string) => {
    await runTmuxAction(optionsRef, async (current) => {
      const credentialToken = await current.getCredentialToken();
      const nextSessions = await renameTmuxSession(current.hostId, sessionName, credentialToken, name);
      const preferred = renamedSelectionTarget(current, sessionName, name);
      const result = applySessions(current, nextSessions, preferred);
      current.onSelectionRenameSession(sessionName, name);
      await openReconciledWindow(current, result, credentialToken);
    });
  }, []);

  return { applySessionRefresh, createWindow, deleteWindow, refreshSessionsKeepingSelection, renameSession, renameWindow };
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
    current.onError(errorMessage(error));
  }
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
