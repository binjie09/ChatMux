import { useCallback, useEffect, useState } from "react";
import {
  captureTmuxHistory,
  createSSHCredential,
  createTmuxSession,
  createTerminalToken,
  listAuditEvents,
  listTmuxSessions,
  saveSessionMetadata,
  terminalWebSocketURL,
  type AuditEvent,
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
import { useGatewayAccessToken } from "./useGatewayAccessToken";
import { useHostWorkspace } from "./useHostWorkspace";
import { useSessionNotifications } from "./useSessionNotifications";
import { errorMessage } from "./view-utils";

export function App() {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [selectedSessionName, setSelectedSessionName] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [sshCredentialToken, setSSHCredentialToken] = useState("");
  const [sshPassword, setSSHPassword] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("enter");
  const [composerValue, setComposerValue] = useState("");
  const [historyChunks, setHistoryChunks] = useState<TranscriptChunk[]>([]);
  const [historyText, setHistoryText] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("terminal");
  const [queuedInput, setQueuedInput] = useState<QueuedTerminalInput | null>(null);
  const [error, setError] = useState("");
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

  useEffect(() => {
    if (!gatewayToken.ready) {
      return;
    }
    void refreshHosts();
    void refreshAuditEvents();
  }, [gatewayToken.ready]);

  async function refreshAuditEvents() {
    try {
      setAuditEvents(await listAuditEvents());
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function clearSelectedSession() {
    setSelectedSessionName("");
    setSSHCredentialToken("");
    setSessions([]);
    setHistoryChunks([]);
    setHistoryText("");
    setMobilePanel("sessions");
  }

  async function handleListSessions() {
    if (!selectedHostId || !sshPassword) {
      return;
    }
    try {
      const credentialToken = await issueSSHCredentialToken();
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
      const credentialToken = tokenOverride || await ensureSSHCredentialToken();
      const history = await captureTmuxHistory(selectedHostId, sessionName, credentialToken);
      setHistoryChunks(history.chunks);
      setHistoryText(history.text);
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
      const credentialToken = await ensureSSHCredentialToken();
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

  async function handleSaveSessionMetadata(title: string, tags: string[]) {
    if (!selectedHostId || !selectedSessionName) {
      return;
    }
    try {
      const metadata = await saveSessionMetadata(selectedHostId, selectedSessionName, title, tags);
      setSessions((current) => current.map((session) => (
        session.name === metadata.sessionName ? { ...session, tags: metadata.tags, title: metadata.title } : session
      )));
      void refreshAuditEvents();
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function ensureSSHCredentialToken() {
    if (sshCredentialToken) {
      return sshCredentialToken;
    }
    return issueSSHCredentialToken();
  }

  async function issueSSHCredentialToken() {
    if (!selectedHostId || !sshPassword) {
      throw new Error("Host and password are required");
    }
    const credential = await createSSHCredential(selectedHostId, sshPassword);
    setSSHCredentialToken(credential.token);
    return credential.token;
  }

  const selectedSession = sessions.find((session) => session.name === selectedSessionName);
  const terminalSessionKey = selectedHostId && selectedSessionName ? `${selectedHostId}:${selectedSessionName}` : "";
  const refreshSelectedSessions = useCallback(async () => {
    if (!selectedHostId || (!sshCredentialToken && !sshPassword)) {
      return [];
    }
    const credentialToken = await ensureSSHCredentialToken();
    return listTmuxSessions(selectedHostId, credentialToken);
  }, [selectedHostId, sshCredentialToken, sshPassword]);

  const sessionNotifications = useSessionNotifications({
    hostId: selectedHostId,
    hostName: selectedHost?.name ?? "MuxChat",
    onError: setError,
    onSessionsChange: setSessions,
    refreshSessions: refreshSelectedSessions,
    sessions,
    sshReady: Boolean(selectedHostId && (sshCredentialToken || sshPassword)),
  });

  const createTerminalWebSocketURL = useCallback(async () => {
    if (!selectedHostId || !selectedSessionName) {
      throw new Error("Host and session are required");
    }
    const credentialToken = await ensureSSHCredentialToken();
    const token = await createTerminalToken(selectedHostId, selectedSessionName, credentialToken);
    return terminalWebSocketURL(token);
  }, [selectedHostId, selectedSessionName, sshCredentialToken, sshPassword]);

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
        mobileOpen={mobilePanel === "sessions"}
        newSessionName={newSessionName}
        notificationsEnabled={sessionNotifications.enabled}
        notificationStatus={sessionNotifications.status}
        sessions={sessions}
        sshPassword={sshPassword}
        onCreateSession={() => void handleCreateSession()}
        onListSessions={() => void handleListSessions()}
        onNewSessionNameChange={setNewSessionName}
        onNotificationsEnabledChange={(enabled) => void sessionNotifications.setEnabled(enabled)}
        onOpenSession={(sessionName) => void handleOpenSession(sessionName)}
        onSSHPasswordChange={(value) => {
          setSSHPassword(value);
          setSSHCredentialToken("");
        }}
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
            onConnectionReady={() => {
              setError("");
              void refreshAuditEvents();
            }}
          />
          <div className="context-stack">
            <HistoryPanel chunks={historyChunks} query={historyQuery} summaryTarget={{ credentialToken: sshCredentialToken, hostId: selectedHostId, sessionName: selectedSessionName }} text={historyText} onQueryChange={setHistoryQuery} onSummarized={() => void refreshAuditEvents()} />
            <AuditPanel events={auditEvents} />
          </div>
        </div>

        <Composer
          draftPanel={<CommandDraftPanel target={{ credentialToken: sshCredentialToken, hostId: selectedHostId, sessionName: selectedSessionName }} onDrafted={() => void refreshAuditEvents()} onInsert={(command) => { setComposerMode("enter"); setComposerValue(command); }} />}
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
