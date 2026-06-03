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

type Host = {
  id: string;
  name: string;
  address: string;
  status: "online" | "offline" | "error";
};

type Session = {
  id: string;
  name: string;
  host: string;
  status: "running" | "waiting" | "idle";
  updatedAt: string;
};

const hosts: Host[] = [
  { id: "prod", name: "prod-api-01", address: "ubuntu@10.0.8.21", status: "online" },
  { id: "gpu", name: "gpu-worker", address: "deploy@gpu.internal", status: "online" },
  { id: "edge", name: "edge-cache", address: "root@edge-03", status: "offline" },
];

const sessions: Session[] = [
  { id: "deploy", name: "deploy-check", host: "prod-api-01", status: "waiting", updatedAt: "2 min ago" },
  { id: "train", name: "train-run-42", host: "gpu-worker", status: "running", updatedAt: "12 min ago" },
  { id: "logs", name: "nginx-logs", host: "edge-cache", status: "idle", updatedAt: "1 hr ago" },
];

const transcript = [
  { kind: "system", text: "Attached to tmux session prod-api-01:deploy-check" },
  { kind: "command", text: "kubectl rollout status deployment/api -n prod" },
  { kind: "output", text: "Waiting for deployment \"api\" rollout to finish: 2 of 6 updated replicas are available..." },
  { kind: "output", text: "deployment \"api\" successfully rolled out" },
];

export function App() {
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

        <button className="primary-action" type="button">
          <Plus size={18} aria-hidden="true" />
          Add host
        </button>

        <section className="nav-section">
          <h2>Hosts</h2>
          <div className="host-list">
            {hosts.map((host) => (
              <button className="host-row" type="button" key={host.id}>
                <Server size={18} aria-hidden="true" />
                <span>
                  <strong>{host.name}</strong>
                  <small>{host.address}</small>
                </span>
                <i className={`status-dot ${host.status}`} />
              </button>
            ))}
          </div>
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
            <p>prod-api-01</p>
            <h2>deploy-check</h2>
          </div>
          <div className="header-actions">
            <button className="utility-button" type="button">
              <KeyRound size={17} aria-hidden="true" />
              Trust host
            </button>
            <button className="utility-button" type="button">
              <Bot size={17} aria-hidden="true" />
              Summarize
            </button>
          </div>
        </header>

        <div className="transcript">
          {transcript.map((entry, index) => (
            <article className={`message ${entry.kind}`} key={`${entry.kind}-${index}`}>
              <span>{entry.kind}</span>
              <pre>{entry.text}</pre>
            </article>
          ))}
        </div>

        <form className="composer">
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
