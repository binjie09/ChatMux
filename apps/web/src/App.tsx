import { useEffect, useState } from "react";
import {
  Activity,
  Bot,
  ChevronRight,
  KeyRound,
  Monitor,
  Plus,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  TerminalSquare,
} from "lucide-react";
import { createHost, listHosts, trustHost, type Host } from "./api";
import { HostForm } from "./HostForm";
import { NativeTerminal } from "./NativeTerminal";

type Session = {
  id: string;
  name: string;
  host: string;
  status: "running" | "waiting" | "idle";
  updatedAt: string;
};

const sessions: Session[] = [
  { id: "deploy", name: "deploy-check", host: "prod-api-01", status: "waiting", updatedAt: "2 min ago" },
  { id: "train", name: "train-run-42", host: "gpu-worker", status: "running", updatedAt: "12 min ago" },
  { id: "logs", name: "nginx-logs", host: "edge-cache", status: "idle", updatedAt: "1 hr ago" },
];

export function App() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHostId, setSelectedHostId] = useState<string>("");
  const [showHostForm, setShowHostForm] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void refreshHosts();
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

  async function handleCreateHost(input: Parameters<typeof createHost>[0]) {
    const host = await createHost(input);
    setHosts((current) => [host, ...current]);
    setSelectedHostId(host.id);
    setShowHostForm(false);
  }

  async function handleTrustHost() {
    if (!selectedHostId) {
      return;
    }
    const trusted = await trustHost(selectedHostId);
    setHosts((current) => current.map((host) => (host.id === trusted.id ? trusted : host)));
  }

  const selectedHost = hosts.find((host) => host.id === selectedHostId);

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
          <button className="icon-button" type="button" aria-label="New session">
            <Plus size={19} aria-hidden="true" />
          </button>
        </header>

        {sessions.map((session) => (
          <button className="session-row" type="button" key={session.id}>
            <Activity size={18} aria-hidden="true" />
            <span>
              <strong>{session.name}</strong>
              <small>{session.host} · {session.updatedAt}</small>
            </span>
            <em className={session.status}>{session.status}</em>
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        ))}
      </section>

      <section className="conversation">
        <header className="conversation-header">
          <div>
            <p>{selectedHost?.name ?? "No host"}</p>
            <h2>{sessions[0]?.name ?? "Terminal"}</h2>
          </div>
          <div className="header-actions">
            <button className="utility-button" type="button" onClick={handleTrustHost}>
              <KeyRound size={17} aria-hidden="true" />
              Trust host
            </button>
            <button className="utility-button" type="button">
              <Bot size={17} aria-hidden="true" />
              Summarize
            </button>
          </div>
        </header>

        <NativeTerminal />

        <form className="composer" onSubmit={(event) => event.preventDefault()}>
          <input aria-label="Command" placeholder="Send command or terminal input..." />
          <button type="submit">
            <Send size={18} aria-hidden="true" />
            Send
          </button>
        </form>
      </section>
    </main>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
