import { useCallback, useEffect, useRef, useState } from "react";
import {
  captureTmuxHistory,
  createTmuxSession,
  listAuditEvents,
  listTmuxSessions,
  saveSessionMetadata,
  type AuditEvent,
  type SaveSessionMetadataInput,
  type TranscriptChunk,
  type TmuxSession,
} from "./api";
import { AuditPanel } from "./AuditPanel";
import { Composer, type ComposerMode } from "./Composer";
import { CommandDraftPanel } from "./CommandDraftPanel";
import { HistoryPanel } from "./HistoryPanel";
import { HostActions } from "./HostActions";
import { MobileNavigation, type MobilePanel } from "./MobileNavigation";
import { NativeTerminal, type QueuedTerminalInput } from "./NativeTerminal";
import { SessionMetadataEditor } from "./SessionMetadataEditor";
import { SessionList } from "./SessionList";
import { Sidebar } from "./Sidebar";
import { GatewayUnlockPage } from "./GatewayUnlockPage";
import { useGatewayAccessToken } from "./useGatewayAccessToken";
import { useHostWorkspace } from "./useHostWorkspace";
import { useSessionNotifications } from "./useSessionNotifications";
import { useTerminalConnectionURL } from "./useTerminalConnectionURL";
import { useSSHCredentialToken } from "./useSSHCredentialToken";
import { type ConnectionStatus } from "./useTerminalSocket";
import { errorMessage } from "./view-utils";

export function App() {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [selectedSessionName, setSelectedSessionName] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("enter");
  const [composerValue, setComposerValue] = useState("");
  const [historyChunks, setHistoryChunks] = useState<TranscriptChunk[]>([]);
  const [historyText, setHistoryText] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("terminal");
  const [queuedInput, setQueuedInput] = useState<QueuedTerminalInput | null>(null);
  const [error, setError] = useState("");
  const autoConnectedHostRef = useRef("");
  const gatewayToken = useGatewayAccessToken(setError);
  const {
    handleCreateHost,
    handleDeleteHost,
    handleSelectHost,
    handleTogglePin,
    handleToggleShare,
    handleTrustHost,
    handleUpdateHost,
    hosts,
    refreshHosts,
    selectedHost,
    selectedHostId,
    setShowHostForm,
    showHostForm,
  } = useHostWorkspace({
    onAuditRefresh: () => void refreshAuditEvents(),
    onError: setError,
    onHostCreated: () => setMobilePanel("sessions"),
    onHostSelected: clearSelectedSession,
  });
  const sshCredential = useSSHCredentialToken(Boolean(selectedHost?.hasCredential));

  useEffect(() => {
    sshCredential.resetCredential();
    autoConnectedHostRef.current = "";
  }, [selectedHostId, selectedHost?.hasCredential, sshCredential.resetCredential]);

  useEffect(() => {
    if (!gatewayToken.ready) {
      return;
    }
    void refreshHosts();
    void refreshAuditEvents();
  }, [gatewayToken.ready]);

  useEffect(() => {
    if (!gatewayToken.ready || !selectedHostId || !selectedHost?.hasCredential) {
      return;
    }
    const autoConnectKey = `${selectedHostId}:${selectedHost.updatedAt}:${selectedHost.hasCredential}`;
    if (autoConnectedHostRef.current === autoConnectKey) {
      return;
    }
    autoConnectedHostRef.current = autoConnectKey;
    void handleListSessions();
  }, [gatewayToken.ready, selectedHost?.hasCredential, selectedHost?.updatedAt, selectedHostId]);

  async function refreshAuditEvents() {
    try {
      setAuditEvents(await listAuditEvents());
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function clearSelectedSession() {
    setSelectedSessionName("");
    sshCredential.resetCredential();
    setSessions([]);
    setHistoryChunks([]);
    setHistoryText("");
    setMobilePanel("sessions");
  }

  async function handleListSessions() {
    if (!selectedHostId || !sshCredential.ready) {
      return;
    }
    try {
      const credentialToken = await getSelectedHostCredentialToken();
      const nextSessions = await listTmuxSessions(selectedHostId, credentialToken);
      setSessions(nextSessions);
      setSelectedSessionName("");
      setHistoryChunks([]);
      setHistoryText("");
      void refreshAuditEvents();
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleOpenSession(sessionName: string, tokenOverride = "") {
    if (!selectedHostId) {
      return;
    }
    setSelectedSessionName(sessionName);
    setMobilePanel("terminal");
    try {
      const credentialToken = tokenOverride || await getSelectedHostCredentialToken();
      await refreshSessionHistory(sessionName, credentialToken);
      void refreshAuditEvents();
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }
  async function handleCreateSession() {
    if (!selectedHostId || !newSessionName) {
      return;
    }
    try {
      const credentialToken = await getSelectedHostCredentialToken();
      const session = await createTmuxSession(selectedHostId, credentialToken, newSessionName);
      setSessions((current) => [session, ...current.filter((item) => item.name !== session.name)]);
      setNewSessionName("");
      await handleOpenSession(session.name, credentialToken);
      void refreshAuditEvents();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function handleComposerSubmit(data: string) {
    setQueuedInput({ data, id: Date.now() });
    setComposerValue("");
  }
  async function refreshSessionHistory(sessionName: string, credentialToken: string) {
    if (!selectedHostId) {
      return;
    }
    const history = await captureTmuxHistory(selectedHostId, sessionName, credentialToken);
    setHistoryChunks(history.chunks);
    setHistoryText(history.text);
  }

  function handleTerminalConnectionReady(status: ConnectionStatus) {
    setError("");
    void refreshAuditEvents();
    if (status === "recovering") {
      void refreshRecoveredHistory();
    }
  }

  async function refreshRecoveredHistory() {
    if (!selectedHostId || !selectedSessionName) {
      return;
    }
    try {
      const credentialToken = await getSelectedHostCredentialToken();
      await refreshSessionHistory(selectedSessionName, credentialToken);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleSaveSessionMetadata(input: SaveSessionMetadataInput) {
    if (!selectedHostId || !selectedSessionName) {
      return;
    }
    try {
      const metadata = await saveSessionMetadata(selectedHostId, selectedSessionName, input);
      setSessions((current) => current.map((session) => (
        session.name === metadata.sessionName ? {
          ...session,
          collaborators: metadata.collaborators,
          owner: metadata.owner,
          shared: metadata.shared,
          tags: metadata.tags,
          title: metadata.title,
        } : session
      )));
      void refreshAuditEvents();
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const selectedSession = sessions.find((session) => session.name === selectedSessionName);
  const terminalSessionKey = selectedHostId && selectedSessionName ? `${selectedHostId}:${selectedSessionName}` : "";
  const getSelectedHostCredentialToken = useCallback(async () => {
    if (!selectedHostId) {
      throw new Error("Host is required");
    }
    return sshCredential.ensureSSHCredentialToken(selectedHostId);
  }, [selectedHostId, sshCredential.ensureSSHCredentialToken]);

  const refreshSelectedSessions = useCallback(async () => {
    if (!selectedHostId || !sshCredential.ready) {
      return [];
    }
    const credentialToken = await getSelectedHostCredentialToken();
    return listTmuxSessions(selectedHostId, credentialToken);
  }, [getSelectedHostCredentialToken, selectedHostId, sshCredential.ready]);

  const sessionNotifications = useSessionNotifications({
    hostId: selectedHostId,
    hostName: selectedHost?.name ?? "ChatMux",
    onError: setError,
    onSessionsChange: setSessions,
    refreshSessions: refreshSelectedSessions,
    sessions,
    sshReady: Boolean(selectedHostId && sshCredential.ready),
  });

  const createTerminalWebSocketURL = useTerminalConnectionURL({
    getCredentialToken: getSelectedHostCredentialToken,
    hostId: selectedHostId,
    sessionName: selectedSessionName,
  });

  if (!gatewayToken.ready) {
    return <GatewayUnlockPage error={error} tokenState={gatewayToken} />;
  }

  return (
    <main className="app-shell">
      <Sidebar
        error={error}
        gatewayToken={gatewayToken}
        hosts={hosts}
        mobileOpen={mobilePanel === "hosts"}
        selectedHostId={selectedHostId}
        showHostForm={showHostForm}
        onCreateHost={handleCreateHost}
        onDeleteHost={handleDeleteHost}
        onSelectHost={handleSelectHost}
        onShowHostForm={setShowHostForm}
        onUpdateHost={handleUpdateHost}
      />

      <SessionList
        credentialStatus={sshCredential.status}
        mobileOpen={mobilePanel === "sessions"}
        newSessionName={newSessionName}
        notificationsEnabled={sessionNotifications.enabled}
        notificationStatus={sessionNotifications.status}
        selectedSessionName={selectedSessionName}
        sessions={sessions}
        onCreateSession={() => void handleCreateSession()}
        onNewSessionNameChange={setNewSessionName}
        onNotificationsEnabledChange={(enabled) => void sessionNotifications.setEnabled(enabled)}
        onOpenSession={(sessionName) => void handleOpenSession(sessionName)}
      />

      <section className="conversation">
        <header className="conversation-header">
          <div>
            <p>{selectedHost?.name ?? "No host"}</p>
            <h2>{selectedSession?.title || selectedSession?.name || "Terminal"}</h2>
            <SessionMetadataEditor session={selectedSession} onSave={handleSaveSessionMetadata} />
          </div>
          <HostActions host={selectedHost} onTogglePin={handleTogglePin} onToggleShare={handleToggleShare} onTrustHost={handleTrustHost} />
        </header>

        <div className="terminal-workspace">
          <NativeTerminal
            createWebSocketURL={terminalSessionKey ? createTerminalWebSocketURL : null}
            queuedInput={queuedInput}
            sessionKey={terminalSessionKey}
            onConnectionError={setError}
            onConnectionReady={handleTerminalConnectionReady}
          />
          <div className="context-stack">
            <HistoryPanel chunks={historyChunks} query={historyQuery} summaryTarget={{ getCredentialToken: getSelectedHostCredentialToken, hostId: selectedHostId, sessionName: selectedSessionName, sshReady: sshCredential.ready }} text={historyText} onQueryChange={setHistoryQuery} onSummarized={() => void refreshAuditEvents()} />
            <AuditPanel events={auditEvents} />
          </div>
        </div>

        <Composer
          draftPanel={<CommandDraftPanel target={{ getCredentialToken: getSelectedHostCredentialToken, hostId: selectedHostId, sessionName: selectedSessionName, sshReady: sshCredential.ready }} onDrafted={() => void refreshAuditEvents()} onInsert={(command) => { setComposerMode("enter"); setComposerValue(command); }} />}
          mode={composerMode}
          value={composerValue}
          onModeChange={setComposerMode}
          onSubmit={handleComposerSubmit}
          onValueChange={setComposerValue}
        />
      </section>
      <MobileNavigation activePanel={mobilePanel} onPanelChange={setMobilePanel} />
    </main>
  );
}
