import { useCallback, useEffect, useState } from "react";
import {
  captureTmuxHistory,
  createHost,
  createTmuxSession,
  createTerminalToken,
  listAuditEvents,
  listHosts,
  listTmuxSessions,
  saveSessionMetadata,
  setHostPinned,
  setHostShared,
  terminalWebSocketURL,
  trustHost,
  type Host,
  type AuditEvent,
  type TranscriptChunk,
  type TmuxSession,
} from "./api";
import { AuditPanel } from "./AuditPanel";
import { Composer, type ComposerMode } from "./Composer";
import { HistoryPanel } from "./HistoryPanel";
import { HostActions } from "./HostActions";
import { MobileNavigation, type MobilePanel } from "./MobileNavigation";
import { NativeTerminal, type QueuedTerminalInput } from "./NativeTerminal";
import { SessionMetadataEditor } from "./SessionMetadataEditor";
import { SessionList } from "./SessionList";
import { Sidebar } from "./Sidebar";
import { useGatewayAccessToken } from "./useGatewayAccessToken";
import { useSessionNotifications } from "./useSessionNotifications";
import { errorMessage, sortHosts } from "./view-utils";

export function App() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [selectedHostId, setSelectedHostId] = useState<string>("");
  const [selectedSessionName, setSelectedSessionName] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [sshPassword, setSSHPassword] = useState("");
  const [composerMode, setComposerMode] = useState<ComposerMode>("enter");
  const [composerValue, setComposerValue] = useState("");
  const [historyChunks, setHistoryChunks] = useState<TranscriptChunk[]>([]);
  const [historyText, setHistoryText] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("terminal");
  const [queuedInput, setQueuedInput] = useState<QueuedTerminalInput | null>(null);
  const [showHostForm, setShowHostForm] = useState(false);
  const [error, setError] = useState("");
  const gatewayToken = useGatewayAccessToken(setError);

  useEffect(() => {
    if (!gatewayToken.ready) {
      return;
    }
    void refreshHosts();
    void refreshAuditEvents();
  }, [gatewayToken.ready]);

  async function refreshHosts() {
    try {
      const nextHosts = await listHosts();
      setHosts(nextHosts);
      setSelectedHostId((current) => current || nextHosts[0]?.id || "");
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function refreshAuditEvents() {
    try {
      setAuditEvents(await listAuditEvents());
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleCreateHost(input: Parameters<typeof createHost>[0]) {
    const host = await createHost(input);
    setHosts((current) => sortHosts([host, ...current]));
    setSelectedHostId(host.id);
    setMobilePanel("sessions");
    setShowHostForm(false);
    void refreshAuditEvents();
  }

  function handleSelectHost(hostId: string) {
    setSelectedHostId(hostId);
    setSelectedSessionName("");
    setSessions([]);
    setHistoryChunks([]);
    setHistoryText("");
    setMobilePanel("sessions");
  }

  async function handleTrustHost() {
    if (!selectedHostId) {
      return;
    }
    const trusted = await trustHost(selectedHostId);
    setHosts((current) => current.map((host) => (host.id === trusted.id ? trusted : host)));
    void refreshAuditEvents();
  }

  async function handleTogglePin() {
    if (!selectedHost) {
      return;
    }
    try {
      const updated = await setHostPinned(selectedHost.id, !selectedHost.pinned);
      setHosts((current) => sortHosts(current.map((host) => (host.id === updated.id ? updated : host))));
      void refreshAuditEvents();
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleToggleShare() {
    if (!selectedHost) {
      return;
    }
    try {
      const updated = await setHostShared(selectedHost.id, !selectedHost.shared);
      setHosts((current) => sortHosts(current.map((host) => (host.id === updated.id ? updated : host))));
      void refreshAuditEvents();
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleListSessions() {
    if (!selectedHostId || !sshPassword) {
      return;
    }
    try {
      const nextSessions = await listTmuxSessions(selectedHostId, sshPassword);
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

  async function handleOpenSession(sessionName: string) {
    if (!selectedHostId || !sshPassword) {
      return;
    }
    setSelectedSessionName(sessionName);
    setMobilePanel("terminal");
    try {
      const history = await captureTmuxHistory(selectedHostId, sessionName, sshPassword);
      setHistoryChunks(history.chunks);
      setHistoryText(history.text);
      void refreshAuditEvents();
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleCreateSession() {
    if (!selectedHostId || !sshPassword || !newSessionName) {
      return;
    }
    try {
      const session = await createTmuxSession(selectedHostId, sshPassword, newSessionName);
      setSessions((current) => [session, ...current.filter((item) => item.name !== session.name)]);
      setNewSessionName("");
      await handleOpenSession(session.name);
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

  const selectedHost = hosts.find((host) => host.id === selectedHostId);
  const selectedSession = sessions.find((session) => session.name === selectedSessionName);
  const terminalSessionKey = selectedHostId && selectedSessionName ? `${selectedHostId}:${selectedSessionName}` : "";

  const refreshSelectedSessions = useCallback(async () => {
    if (!selectedHostId || !sshPassword) {
      return [];
    }
    return listTmuxSessions(selectedHostId, sshPassword);
  }, [selectedHostId, sshPassword]);

  const sessionNotifications = useSessionNotifications({
    hostId: selectedHostId,
    hostName: selectedHost?.name ?? "MuxChat",
    onError: setError,
    onSessionsChange: setSessions,
    refreshSessions: refreshSelectedSessions,
    sessions,
    sshReady: Boolean(selectedHostId && sshPassword),
  });

  const createTerminalWebSocketURL = useCallback(async () => {
    if (!selectedHostId || !selectedSessionName || !sshPassword) {
      throw new Error("Host, session, and password are required");
    }
    const token = await createTerminalToken(selectedHostId, selectedSessionName, sshPassword);
    return terminalWebSocketURL(token);
  }, [selectedHostId, selectedSessionName, sshPassword]);

  return (
    <main className="app-shell">
      <Sidebar
        error={error}
        gatewayToken={gatewayToken}
        hosts={hosts}
        mobileOpen={mobilePanel === "hosts"}
        showHostForm={showHostForm}
        onCreateHost={handleCreateHost}
        onSelectHost={handleSelectHost}
        onShowHostForm={setShowHostForm}
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
        onSSHPasswordChange={setSSHPassword}
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
            <HistoryPanel chunks={historyChunks} query={historyQuery} summaryTarget={{ hostId: selectedHostId, password: sshPassword, sessionName: selectedSessionName }} text={historyText} onQueryChange={setHistoryQuery} onSummarized={() => void refreshAuditEvents()} />
            <AuditPanel events={auditEvents} />
          </div>
        </div>

        <Composer
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
