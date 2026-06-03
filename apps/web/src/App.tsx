import { useCallback, useEffect, useState } from "react";
import { Monitor, Plus, Server, ShieldCheck, Smartphone, TerminalSquare } from "lucide-react";
import {
  captureTmuxHistory,
  createHost,
  createTmuxSession,
  createTerminalToken,
  listAuditEvents,
  listHosts,
  listTmuxSessions,
  setHostPinned,
  terminalWebSocketURL,
  trustHost,
  type Host,
  type AuditEvent,
  type TmuxSession,
} from "./api";
import { AuditPanel } from "./AuditPanel";
import { Composer, type ComposerMode } from "./Composer";
import { HistoryPanel } from "./HistoryPanel";
import { HostActions } from "./HostActions";
import { HostForm } from "./HostForm";
import { NativeTerminal, type QueuedTerminalInput } from "./NativeTerminal";
import { SessionList } from "./SessionList";
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
  const [historyText, setHistoryText] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [queuedInput, setQueuedInput] = useState<QueuedTerminalInput | null>(null);
  const [showHostForm, setShowHostForm] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void refreshHosts();
    void refreshAuditEvents();
  }, []);

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
    setShowHostForm(false);
    void refreshAuditEvents();
  }

  function handleSelectHost(hostId: string) {
    setSelectedHostId(hostId);
    setSelectedSessionName("");
    setSessions([]);
    setHistoryText("");
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

  async function handleListSessions() {
    if (!selectedHostId || !sshPassword) {
      return;
    }
    try {
      const nextSessions = await listTmuxSessions(selectedHostId, sshPassword);
      setSessions(nextSessions);
      setSelectedSessionName("");
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
    try {
      const history = await captureTmuxHistory(selectedHostId, sessionName, sshPassword);
      setHistoryText(history);
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

  const selectedHost = hosts.find((host) => host.id === selectedHostId);
  const selectedSession = sessions.find((session) => session.name === selectedSessionName);
  const terminalSessionKey = selectedHostId && selectedSessionName ? `${selectedHostId}:${selectedSessionName}` : "";

  const createTerminalWebSocketURL = useCallback(async () => {
    if (!selectedHostId || !selectedSessionName || !sshPassword) {
      throw new Error("Host, session, and password are required");
    }
    const token = await createTerminalToken(selectedHostId, selectedSessionName, sshPassword);
    return terminalWebSocketURL(token);
  }, [selectedHostId, selectedSessionName, sshPassword]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <TerminalSquare aria-hidden="true" />
          <div>
            <strong>MuxChat</strong>
            <span>SSH tmux workspaces</span>
          </div>
        </div>

        <button className="primary-action" type="button" onClick={() => setShowHostForm(true)}>
          <Plus size={18} aria-hidden="true" />
          Add host
        </button>
        {showHostForm ? <HostForm onCancel={() => setShowHostForm(false)} onSubmit={handleCreateHost} /> : null}

        <section className="nav-section">
          <h2>Hosts</h2>
          <div className="host-list">
            {hosts.map((host) => (
              <button className="host-row" type="button" key={host.id} onClick={() => handleSelectHost(host.id)}>
                <Server size={18} aria-hidden="true" />
                <span>
                  <strong>{host.name}</strong>
                  <small>{host.username}@{host.hostname}:{host.port}</small>
                </span>
                <i className={`status-dot ${host.status}`} />
              </button>
            ))}
          </div>
          {error ? <p className="sidebar-error">{error}</p> : null}
        </section>

        <section className="platforms">
          <h2>Targets</h2>
          <div>
            <Monitor size={16} aria-hidden="true" />
            Web, macOS, Windows
          </div>
          <div>
            <Smartphone size={16} aria-hidden="true" />
            iOS, Android
          </div>
          <div>
            <ShieldCheck size={16} aria-hidden="true" />
            Gateway secured SSH
          </div>
        </section>
      </aside>

      <SessionList
        newSessionName={newSessionName}
        sessions={sessions}
        sshPassword={sshPassword}
        onCreateSession={() => void handleCreateSession()}
        onListSessions={() => void handleListSessions()}
        onNewSessionNameChange={setNewSessionName}
        onOpenSession={(sessionName) => void handleOpenSession(sessionName)}
        onSSHPasswordChange={setSSHPassword}
      />

      <section className="conversation">
        <header className="conversation-header">
          <div>
            <p>{selectedHost?.name ?? "No host"}</p>
            <h2>{selectedSession?.name ?? "Terminal"}</h2>
          </div>
          <HostActions host={selectedHost} onTogglePin={handleTogglePin} onTrustHost={handleTrustHost} />
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
            <HistoryPanel query={historyQuery} text={historyText} onQueryChange={setHistoryQuery} />
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
    </main>
  );
}
