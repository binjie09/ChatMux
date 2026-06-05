import { useCallback, useState } from "react";
import { type TmuxSession } from "./api";
import { type ComposerMode } from "./Composer";
import { AppShell } from "./AppShell";
import { type MobilePanel } from "./MobileNavigation";
import { type MobileTerminalSheet } from "./MobileTerminalChrome";
import { type QueuedTerminalInput } from "./NativeTerminal";
import { useGatewayAccessToken } from "./useGatewayAccessToken";
import { useHostWorkspace } from "./useHostWorkspace";
import { useAppStartupEffects } from "./useAppStartupEffects";
import { useSessionWorkspaceState } from "./useSessionWorkspaceState";
import { useTerminalConnectionURL } from "./useTerminalConnectionURL";
import { useTerminalScrollbackHistory } from "./useTerminalScrollbackHistory";
import { useSSHCredentialToken } from "./useSSHCredentialToken";
import { useIsMobileLayout } from "./useIsMobileLayout";
import { useSessionWindowSelection } from "./useSessionWindowSelection";
import { useAuditEvents } from "./useAuditEvents";
import { useTerminalHistoryState } from "./useTerminalHistoryState";
import { useSessionMetadataSaver } from "./useSessionMetadataSaver";
import { useTmuxWindowActions } from "./useTmuxWindowActions";
import { useAppSessionHandlers } from "./useAppSessionHandlers";
import { useAppSessionWorkflow } from "./useAppSessionWorkflow";
import { findSessionWindow, windowLabel } from "./session-window-utils";

const noExpandedSessions: ReadonlySet<string> = new Set();

export function App() {
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [newSessionName, setNewSessionName] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("enter");
  const [composerValue, setComposerValue] = useState("");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("hosts");
  const [mobileSheet, setMobileSheet] = useState<MobileTerminalSheet | null>(null);
  const [queuedInput, setQueuedInput] = useState<QueuedTerminalInput | null>(null);
  const [error, setError] = useState("");
  const isMobileLayout = useIsMobileLayout();
  const auditEvents = useAuditEvents(setError);
  const history = useTerminalHistoryState();
  const selection = useSessionWindowSelection();
  const gatewayToken = useGatewayAccessToken(setError);
  const {
    handleCreateHost,
    handleDeleteHost,
    handleSelectHost,
    handleTogglePin,
    handleTrustHost,
    handleUpdateHost,
    hosts,
    refreshHosts,
    selectedHost,
    selectedHostId,
    setShowHostForm,
    showHostForm,
  } = useHostWorkspace({
    onAuditRefresh: () => void auditEvents.refresh(),
    onError: setError,
    onHostCreated: () => setMobilePanel("sessions"),
    onHostSelected: clearSelectedSession,
  });
  const sshCredential = useSSHCredentialToken(Boolean(selectedHost?.hasCredential));
  const getSelectedHostCredentialToken = useCallback(async () => {
    if (!selectedHostId) {
      throw new Error("Host is required");
    }
    return sshCredential.ensureSSHCredentialToken(selectedHostId);
  }, [selectedHostId, sshCredential.ensureSSHCredentialToken]);
  const saveSessionMetadata = useSessionMetadataSaver({
    hostId: selectedHostId,
    selectedSessionName: selection.selectedSessionName,
    onAuditRefresh: () => void auditEvents.refresh(),
    onError: setError,
    onSessionsChange: setSessions,
  });
  const sessionWorkflow = useAppSessionWorkflow({
    getCredentialToken: getSelectedHostCredentialToken,
    history,
    isMobileLayout,
    newSessionName,
    selectedHostId,
    selection,
    sshReady: sshCredential.ready,
    onAuditRefresh: () => void auditEvents.refresh(),
    onError: setError,
    onMobilePanelChange: setMobilePanel,
    onMobileSheetClear: () => setMobileSheet(null),
    onNewSessionNameChange: setNewSessionName,
    onSessionsChange: setSessions,
  });
  useAppStartupEffects({
    gatewayReady: gatewayToken.ready,
    resetCredential: sshCredential.resetCredential,
    selectedHostHasCredential: Boolean(selectedHost?.hasCredential),
    selectedHostId,
    selectedHostUpdatedAt: selectedHost?.updatedAt ?? "",
    onAuditRefresh: () => void auditEvents.refresh(),
    onHostsRefresh: () => void refreshHosts(),
    onListSessions: () => void sessionWorkflow.handleListSessions(),
  });

  function clearSelectedSession() {
    selection.clearSelection();
    setMobileSheet(null);
    sshCredential.resetCredential();
    setSessions([]);
    history.clear();
    setMobilePanel("sessions");
  }

  function handleComposerSubmit(data: string) {
    setQueuedInput({ data, id: Date.now() });
    setComposerValue("");
  }

  const terminalSessionKey = selectedHostId && selection.selectedSessionName && selection.selectedWindowIndex !== null
    ? `${selectedHostId}:${selection.selectedSessionName}:${selection.selectedWindowIndex}`
    : "";
  const isMobileTerminalActive = Boolean(terminalSessionKey && mobilePanel === "terminal");
  const loadTerminalScrollbackHistory = useTerminalScrollbackHistory({
    getCredentialToken: getSelectedHostCredentialToken,
    hostId: selectedHostId,
    sessionName: selection.selectedSessionName,
    windowIndex: selection.selectedWindowIndex,
  });

  const tmuxWindowActions = useTmuxWindowActions({
    getCredentialToken: getSelectedHostCredentialToken,
    hostId: selectedHostId,
    isMobileLayout,
    selectedSessionName: selection.selectedSessionName,
    selectedWindowIndex: selection.selectedWindowIndex,
    sessions,
    onAuditRefresh: () => void auditEvents.refresh(),
    onError: setError,
    onHistoryClear: history.clear,
    onMobilePanelChange: setMobilePanel,
    onMobileSheetClear: () => setMobileSheet(null),
    onOpenWindow: sessionWorkflow.handleOpenSessionWindow,
    onSelectionClear: selection.clearSelection,
    onSelectionOpen: selection.openWindow,
    onSelectionRenameSession: selection.renameSession,
    onSessionsChange: setSessions,
  });

  const sessionState = useSessionWorkspaceState({
    getCredentialToken: getSelectedHostCredentialToken,
    hostId: selectedHostId,
    hostName: selectedHost?.name ?? "ChatMux",
    mobilePanel,
    onError: setError,
    onSessionsChange: tmuxWindowActions.applySessionRefresh,
    selectedSessionName: selection.selectedSessionName,
    sessions,
    sshReady: Boolean(selectedHostId && sshCredential.ready),
  });
  const displaySessions = sessionState.displaySessions;
  const selectedSession = displaySessions.find((session) => session.name === selection.selectedSessionName);
  const selectedWindow = findSessionWindow(selectedSession, selection.selectedWindowIndex);

  const createTerminalWebSocketURL = useTerminalConnectionURL({
    getCredentialToken: getSelectedHostCredentialToken,
    hostId: selectedHostId,
    sessionName: selection.selectedSessionName,
    windowIndex: selection.selectedWindowIndex,
  });

  const summaryTarget = {
    getCredentialToken: getSelectedHostCredentialToken,
    hostId: selectedHostId,
    sessionName: selection.selectedSessionName,
    sshReady: sshCredential.ready,
    windowIndex: selection.selectedWindowIndex,
  };
  const sessionHandlers = useAppSessionHandlers({
    selectedSession,
    tmuxWindowActions,
    onBackToSessions: sessionWorkflow.handleBackToSessions,
    onConnectionReady: (status) => void sessionWorkflow.handleTerminalConnectionReady(status),
    onCreateSession: () => void sessionWorkflow.handleCreateSession(),
    onExpandSession: sessionWorkflow.handleExpandSession,
    onListSessions: () => void sessionWorkflow.handleListSessions(),
    onMobileSheetClear: () => setMobileSheet(null),
    onOpenWindow: (sessionName, windowIndex) => void sessionWorkflow.handleOpenSessionWindow(sessionName, windowIndex),
  });
  return (
    <AppShell
      auditEvents={auditEvents.events}
      composerMode={composerMode}
      composerValue={composerValue}
      createTerminalWebSocketURL={terminalSessionKey ? createTerminalWebSocketURL : null}
      credentialStatus={sshCredential.status}
      error={error}
      gatewayToken={gatewayToken}
      historyChunks={history.chunks}
      historyQuery={history.query}
      historyText={history.text}
      hosts={hosts}
      expandedSessionNames={isMobileLayout ? noExpandedSessions : selection.expandedSessionNames}
      isMobileTerminalActive={isMobileTerminalActive}
      loadScrollbackHistory={terminalSessionKey ? loadTerminalScrollbackHistory : null}
      mobilePanel={mobilePanel}
      mobileSheet={mobileSheet}
      newSessionName={newSessionName}
      notifications={{ enabled: sessionState.notifications.enabled, status: sessionState.notifications.status }}
      queuedInput={queuedInput}
      selectedHost={selectedHost}
      selectedSession={selectedSession}
      selectedSessionName={selection.selectedSessionName}
      selectedWindowIndex={selection.selectedWindowIndex}
      selectedWindowName={selectedWindow ? windowLabel(selectedWindow) : ""}
      sessions={displaySessions}
      showHostForm={showHostForm}
      target={summaryTarget}
      terminalSessionKey={terminalSessionKey}
      composerHandlers={{ onComposerModeChange: setComposerMode, onComposerSubmit: handleComposerSubmit, onComposerValueChange: setComposerValue }}
      sessionHandlers={sessionHandlers}
      onConnectionError={setError}
      onCreateHost={handleCreateHost}
      onDeleteHost={handleDeleteHost}
      onDrafted={() => void auditEvents.refresh()}
      onHistoryQueryChange={history.setQuery}
      onMobilePanelChange={setMobilePanel}
      onMobileSheetChange={setMobileSheet}
      onNewSessionNameChange={setNewSessionName}
      onNotificationsEnabledChange={(enabled) => void sessionState.notifications.setEnabled(enabled)}
      mobileWindowList={isMobileLayout && Boolean(selection.windowListSessionName)}
      windowListSessionName={selection.windowListSessionName}
      onSaveSessionMetadata={saveSessionMetadata}
      onSelectHost={handleSelectHost}
      onShowHostForm={setShowHostForm}
      onTogglePin={handleTogglePin}
      onTrustHost={handleTrustHost}
      onUpdateHost={handleUpdateHost}
    />
  );
}
