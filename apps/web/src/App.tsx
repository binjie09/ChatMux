import { useEffect, useState } from "react";
import { Activity, ChevronRight, KeyRound, Monitor, Plus, Send, Server, ShieldCheck, Smartphone, TerminalSquare } from "lucide-react";
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
import { HistoryPanel } from "./HistoryPanel";
import { HostActions } from "./HostActions";
import { HostForm } from "./HostForm";
import { NativeTerminal, type QueuedTerminalInput } from "./NativeTerminal";
import "./session-controls.css";
import { errorMessage, formatTime, sortHosts } from "./view-utils";

export function App() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [sessions, setSessions] = useState<TmuxSession[]>([]);
  const [selectedHostId, setSelectedHostId] = useState<string>("");
  const [selectedSessionName, setSelectedSessionName] = useState("");
  const [newSessionName, setNewSessionName] = useState("");
  const [sshPassword, setSSHPassword] = useState("");
  const [terminalURL, setTerminalURL] = useState("");
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
      setSelectedSessionName((current) => current || nextSessions[0]?.name || "");
      setTerminalURL("");
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
    try {
      const token = await createTerminalToken(selectedHostId, sessionName, sshPassword);
      const history = await captureTmuxHistory(selectedHostId, sessionName, sshPassword);
      setSelectedSessionName(sessionName);
      setTerminalURL(terminalWebSocketURL(token));
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

  const selectedHost = hosts.find((host) => host.id === selectedHostId);
  const selectedSession = sessions.find((session) => session.name === selectedSessionName);

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
              <button className="host-row" type="button" key={host.id} onClick={() => setSelectedHostId(host.id)}>
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

      <section className="session-list">
        <header>
          <div>
            <p>Remote tmux</p>
            <h1>Conversations</h1>
          </div>
          <button className="icon-button" type="button" aria-label="New session" onClick={() => void handleCreateSession()}>
            <Plus size={19} aria-hidden="true" />
          </button>
        </header>

        <form className="session-auth" onSubmit={(event) => {
          event.preventDefault();
          void handleListSessions();
        }}>
          <input
            aria-label="SSH password"
            placeholder="Password"
            type="password"
            value={sshPassword}
            onChange={(event) => setSSHPassword(event.target.value)}
          />
          <button type="submit" aria-label="Connect">
            <KeyRound size={17} aria-hidden="true" />
          </button>
        </form>

        <form className="session-create" onSubmit={(event) => {
          event.preventDefault();
          void handleCreateSession();
        }}>
          <input
            aria-label="New session name"
            placeholder="New session"
            value={newSessionName}
            onChange={(event) => setNewSessionName(event.target.value)}
          />
        </form>

        {sessions.map((session) => (
          <button className="session-row" type="button" key={session.id} onClick={() => void handleOpenSession(session.name)}>
            <Activity size={18} aria-hidden="true" />
            <span>
              <strong>{session.name}</strong>
              <small>{session.windows} windows · {formatTime(session.updatedAt)}</small>
            </span>
            <em className={session.status}>{session.status}</em>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
        {sessions.length === 0 ? <p className="session-empty">No sessions</p> : null}
      </section>

      <section className="conversation">
        <header className="conversation-header">
          <div>
            <p>{selectedHost?.name ?? "No host"}</p>
            <h2>{selectedSession?.name ?? "Terminal"}</h2>
          </div>
          <HostActions host={selectedHost} onTogglePin={handleTogglePin} onTrustHost={handleTrustHost} />
        </header>

        <div className="terminal-workspace">
          <NativeTerminal queuedInput={queuedInput} webSocketURL={terminalURL} />
          <div className="context-stack">
            <HistoryPanel query={historyQuery} text={historyText} onQueryChange={setHistoryQuery} />
            <AuditPanel events={auditEvents} />
          </div>
        </div>

        <form className="composer" onSubmit={(event) => {
          event.preventDefault();
          if (!composerValue) {
            return;
          }
          setQueuedInput({ id: Date.now(), text: composerValue });
          setComposerValue("");
        }}>
          <input
            aria-label="Command"
            placeholder="Send command or terminal input..."
            value={composerValue}
            onChange={(event) => setComposerValue(event.target.value)}
          />
          <button type="submit">
            <Send size={18} aria-hidden="true" />
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
