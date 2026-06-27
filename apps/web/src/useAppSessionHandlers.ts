import { type DisplayTmuxSession } from "./session-state-machine";
import { type ConnectionStatus } from "./useTerminalSocket";
import { type TmuxWindowActions } from "./useTmuxWindowActions";

type UseAppSessionHandlersOptions = {
  selectedSession: DisplayTmuxSession | undefined;
  tmuxWindowActions: TmuxWindowActions;
  onBackToSessions: (session: DisplayTmuxSession | undefined) => void;
  onConnectionReady: (status: ConnectionStatus) => void;
  onCreateSession: () => void;
  onExpandSession: (sessionName: string) => void;
  onListSessions: () => void;
  onMobileSheetClear: () => void;
  onOpenWindow: (sessionName: string, windowIndex: number) => void;
};

export function useAppSessionHandlers(options: UseAppSessionHandlersOptions) {
  return {
    onBackToSessions: () => {
      options.onMobileSheetClear();
      options.onBackToSessions(options.selectedSession);
    },
    onConnectionClosed: () => void options.tmuxWindowActions.refreshSessionsKeepingSelection(),
    onConnectionReady: options.onConnectionReady,
    onCreateSession: options.onCreateSession,
    onCreateWindow: (sessionName: string) => void options.tmuxWindowActions.createWindow(sessionName),
    onDeleteWindow: (sessionName: string, windowIndex: number) => void options.tmuxWindowActions.deleteWindow(sessionName, windowIndex),
    onDeleteSession: (sessionName: string) => void options.tmuxWindowActions.deleteSession(sessionName),
    onExpandSession: options.onExpandSession,
    onListSessions: options.onListSessions,
    onMoveWindow: (sessionName: string, fromWindowIndex: number, toWindowIndex: number) =>
      void options.tmuxWindowActions.moveWindow(sessionName, fromWindowIndex, toWindowIndex),
    onOpenWindow: options.onOpenWindow,
    onReorderSessions: (orderedNames: string[]) => void options.tmuxWindowActions.reorderSessions(orderedNames),
    onRenameSession: (sessionName: string, name: string) => options.tmuxWindowActions.renameSession(sessionName, name),
    onRenameWindow: (sessionName: string, windowIndex: number, name: string) => options.tmuxWindowActions.renameWindow(sessionName, windowIndex, name),
  };
}
