import { useCallback, useEffect, useState } from "react";
import { type TmuxSession, uploadTerminalImage } from "./api";
import { type ComposerMode } from "./Composer";
import { AppShell } from "./AppShell";
import { fileToBase64 } from "./file-base64";
import { HostTrustDialog } from "./HostTrustDialog";
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
import { useHostTrustPrompt } from "./useHostTrustPrompt";
import { type ConnectionStatus } from "./useTerminalSocket";
import { findSessionWindow, windowLabel } from "./session-window-utils";
import { bracketedPaste } from "./terminal-protocol";
import { hasSSHFallbackSession, isSSHFallbackSession, tmuxInstallScript } from "./tmux-fallback";
import { errorMessage } from "./view-utils";

const noExpandedSessions: ReadonlySet<string> = new Set();

export function App() {
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [newSessionName, setNewSessionName] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("enter");
  const [composerValue, setComposerValue] = useState("");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("hosts");
  const [mobileSheet, setMobileSheet] = useState<MobileTerminalSheet | null>(null);
  const [queuedInput, setQueuedInput] = useState<QueuedTerminalInput | null>(null);
  const [terminalReconnectSignal, setTerminalReconnectSignal] = useState(0);
  const [pendingTmuxInstall, setPendingTmuxInstall] = useState(false);
  const [tmuxInstallPromptHostId, setTmuxInstallPromptHostId] = useState("");
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
  const trustPrompt = useHostTrustPrompt({
    selectedHost,
    onError: setError,
    onTrustHost: handleTrustHost,
  });
  const hostTrusted = trustPrompt.isHostTrusted(selectedHost);
  const sshCredential = useSSHCredentialToken(Boolean(selectedHost?.hasCredential));
  const terminalSessionKey = selectedHostId && selection.selectedSessionName && selection.selectedWindowIndex !== null
    ? `${selectedHostId}:${selection.selectedSessionName}:${selection.selectedWindowIndex}`
    : "";
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
    ensureHostTrusted: trustPrompt.ensureHostTrusted,
    getCredentialToken: getSelectedHostCredentialToken,
    history,
    isMobileLayout,
    newSessionName,
    sessions,
    selectedHostId,
    selection,
    sshReady: sshCredential.ready,
    onAuditRefresh: () => void auditEvents.refresh(),
    onError: setError,
    onHostTrustError: trustPrompt.handleHostTrustError,
    onMobilePanelChange: setMobilePanel,
    onMobileSheetClear: () => setMobileSheet(null),
    onNewSessionNameChange: setNewSessionName,
    onSessionsChange: setSessions,
  });
  useAppStartupEffects({
    autoListSessions: !terminalSessionKey,
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
    setPendingTmuxInstall(false);
    sshCredential.resetCredential();
    setSessions([]);
    history.clear();
    setMobilePanel("sessions");
  }

  function handleComposerSubmit(data: string) {
    setQueuedInput({ data, id: Date.now() });
    setComposerValue("");
  }

  const clearQueuedInput = useCallback((inputId: number) => {
    setQueuedInput((current) => current?.id === inputId ? null : current);
  }, []);

  async function handleTerminalImagePaste(file: File) {
    if (!selectedHostId || !selection.selectedSessionName) {
      throw new Error("Host and session are required");
    }
    const credentialToken = await getSelectedHostCredentialToken();
    const response = await uploadTerminalImage(selectedHostId, selection.selectedSessionName, {
      credentialToken,
      dataBase64: await fileToBase64(file),
      mimeType: file.type,
    });
    void auditEvents.refresh();
    return response.remotePath;
  }

  const isMobileTerminalActive = Boolean(terminalSessionKey && mobilePanel === "terminal");

  async function handleMobileTerminalImageUpload(file: File) {
    try {
      const remotePath = await handleTerminalImagePaste(file);
      setQueuedInput({ data: bracketedPaste(remotePath), id: Date.now() });
    } catch (error) {
      setError(errorMessage(error));
    }
  }

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
    ensureHostTrusted: trustPrompt.ensureHostTrusted,
    onHistoryClear: history.clear,
    onHostTrustError: trustPrompt.handleHostTrustError,
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
    sshReady: Boolean(selectedHostId && sshCredential.ready && hostTrusted),
  });
  const displaySessions = sessionState.displaySessions;
  const selectedSession = displaySessions.find((session) => session.name === selection.selectedSessionName);
  const selectedWindow = findSessionWindow(selectedSession, selection.selectedWindowIndex);
  const tmuxFallbackActive = hasSSHFallbackSession(displaySessions);
  const selectedSessionIsFallback = isSSHFallbackSession(selectedSession);

  const queueTmuxInstall = useCallback(() => {
    setQueuedInput({ data: `${tmuxInstallScript}\n`, id: Date.now(), source: "installer" });
    setPendingTmuxInstall(false);
  }, []);

  const handleInstallTmux = useCallback(() => {
    const fallbackSession = displaySessions.find((session) => isSSHFallbackSession(session));
    const windowIndex = fallbackSession?.windowList[0]?.index;
    setMobilePanel("terminal");
    setPendingTmuxInstall(true);
    if (selectedSessionIsFallback) {
      queueTmuxInstall();
      return;
    }
    if (!selectedSessionIsFallback && fallbackSession && windowIndex !== undefined) {
      void sessionWorkflow.handleOpenSessionWindow(fallbackSession.name, windowIndex);
    }
  }, [displaySessions, queueTmuxInstall, selectedSessionIsFallback, sessionWorkflow]);

  useEffect(() => {
    if (!tmuxFallbackActive || !selectedHostId || pendingTmuxInstall || tmuxInstallPromptHostId === selectedHostId) {
      return;
    }
    setTmuxInstallPromptHostId(selectedHostId);
    if (window.confirm("tmux is not installed on this server. ChatMux is using a single SSH shell. Allow ChatMux to run the built-in tmux installer now?")) {
      handleInstallTmux();
    }
  }, [handleInstallTmux, pendingTmuxInstall, selectedHostId, tmuxFallbackActive, tmuxInstallPromptHostId]);

  const createTerminalWebSocketURL = useTerminalConnectionURL({
    getCredentialToken: getSelectedHostCredentialToken,
    hostId: selectedHostId,
    selectedSession,
    sessionName: selection.selectedSessionName,
    windowIndex: selection.selectedWindowIndex,
  });
  const reconnectTerminal = useCallback(() => {
    setTerminalReconnectSignal((current) => current + 1);
  }, []);
  const guardedTerminalWebSocketURL = useCallback(async (status: ConnectionStatus) => {
    if (!trustPrompt.ensureHostTrusted(reconnectTerminal, "reconnect")) {
      throw new Error("host key is not trusted");
    }
    return createTerminalWebSocketURL(status);
  }, [createTerminalWebSocketURL, reconnectTerminal, trustPrompt.ensureHostTrusted]);
  const handleTerminalConnectionBlocked = useCallback((message: string) => {
    return trustPrompt.handleHostTrustError(new Error(message), reconnectTerminal, "reconnect");
  }, [reconnectTerminal, trustPrompt.handleHostTrustError]);

  const summaryTarget = {
    getCredentialToken: getSelectedHostCredentialToken,
    hostId: selectedHostId,
    sessionName: selection.selectedSessionName,
    sshReady: sshCredential.ready && hostTrusted && !selectedSessionIsFallback,
    windowIndex: selection.selectedWindowIndex,
  };
  const sessionHandlers = useAppSessionHandlers({
    selectedSession,
    tmuxWindowActions,
    onBackToSessions: sessionWorkflow.handleBackToSessions,
    onConnectionReady: (status) => {
      void sessionWorkflow.handleTerminalConnectionReady(status);
      if (pendingTmuxInstall && selectedSessionIsFallback) {
        queueTmuxInstall();
      }
    },
    onCreateSession: () => void sessionWorkflow.handleCreateSession(),
    onExpandSession: sessionWorkflow.handleExpandSession,
    onListSessions: () => void sessionWorkflow.handleListSessions(),
    onMobileSheetClear: () => setMobileSheet(null),
    onOpenWindow: (sessionName, windowIndex) => void sessionWorkflow.handleOpenSessionWindow(sessionName, windowIndex),
  });
  return (
    <>
      <AppShell
        auditEvents={auditEvents.events}
        composerMode={composerMode}
        composerValue={composerValue}
        createTerminalWebSocketURL={terminalSessionKey ? guardedTerminalWebSocketURL : null}
        credentialStatus={sshCredential.status}
        error={error}
        gatewayToken={gatewayToken}
        historyChunks={history.chunks}
        historyQuery={history.query}
        historyText={history.text}
        hosts={hosts}
        expandedSessionNames={isMobileLayout ? noExpandedSessions : selection.expandedSessionNames}
        isMobileTerminalActive={isMobileTerminalActive}
        loadScrollbackHistory={terminalSessionKey && !selectedSessionIsFallback ? loadTerminalScrollbackHistory : null}
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
        tmuxFallbackActive={tmuxFallbackActive}
        tmuxInstallPending={pendingTmuxInstall}
        composerHandlers={{
          onComposerModeChange: setComposerMode,
          onComposerSubmit: handleComposerSubmit,
          onComposerUploadImage: isMobileLayout && isMobileTerminalActive && !selectedSessionIsFallback ? handleMobileTerminalImageUpload : null,
          onComposerValueChange: setComposerValue,
        }}
        sessionHandlers={sessionHandlers}
        onConnectionError={setError}
        onConnectionBlocked={handleTerminalConnectionBlocked}
        onPasteTerminalImage={terminalSessionKey && !selectedSessionIsFallback ? handleTerminalImagePaste : null}
        onCreateHost={handleCreateHost}
        onDeleteHost={handleDeleteHost}
        onDrafted={() => void auditEvents.refresh()}
        onHistoryQueryChange={history.setQuery}
        onInstallTmux={handleInstallTmux}
        onMobilePanelChange={setMobilePanel}
        onMobileSheetChange={setMobileSheet}
        onNewSessionNameChange={setNewSessionName}
        onNotificationsEnabledChange={(enabled) => void sessionState.notifications.setEnabled(enabled)}
        onQueuedInputSent={clearQueuedInput}
        mobileWindowList={isMobileLayout && Boolean(selection.windowListSessionName)}
        windowListSessionName={selection.windowListSessionName}
        onSaveSessionMetadata={saveSessionMetadata}
        onSelectHost={handleSelectHost}
        onShowHostForm={setShowHostForm}
        onTogglePin={handleTogglePin}
        onTrustHost={() => void handleTrustHost()}
        terminalReconnectSignal={terminalReconnectSignal}
        onUpdateHost={handleUpdateHost}
      />
      <HostTrustDialog request={trustPrompt.request} trusting={trustPrompt.trusting} onCancel={trustPrompt.cancelHostTrust} onTrust={() => void trustPrompt.confirmHostTrust()} />
    </>
  );
}
