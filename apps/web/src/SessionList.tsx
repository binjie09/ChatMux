import { Activity, Bell, ChevronRight, KeyRound, Plus } from "lucide-react";
import { type TmuxSession } from "./api";
import "./session-controls.css";
import { type SessionNotificationStatus } from "./useSessionNotifications";
import { formatTime } from "./view-utils";

type SessionListProps = {
  mobileOpen: boolean;
  newSessionName: string;
  notificationsEnabled: boolean;
  notificationStatus: SessionNotificationStatus;
  sessions: TmuxSession[];
  sshPassword: string;
  onCreateSession: () => void;
  onListSessions: () => void;
  onNewSessionNameChange: (value: string) => void;
  onNotificationsEnabledChange: (enabled: boolean) => void;
  onOpenSession: (sessionName: string) => void;
  onSSHPasswordChange: (value: string) => void;
};

export function SessionList(props: SessionListProps) {
  return (
    <section className={`session-list ${props.mobileOpen ? "mobile-open" : ""}`}>
      <header>
        <div>
          <p>Remote tmux</p>
          <h1>Conversations</h1>
        </div>
        <button className="icon-button" type="button" aria-label="New session" onClick={props.onCreateSession}>
          <Plus size={19} aria-hidden="true" />
        </button>
      </header>

      <SessionAuth
        sshPassword={props.sshPassword}
        onListSessions={props.onListSessions}
        onSSHPasswordChange={props.onSSHPasswordChange}
      />
      <SessionCreate
        newSessionName={props.newSessionName}
        onCreateSession={props.onCreateSession}
        onNewSessionNameChange={props.onNewSessionNameChange}
      />
      <SessionNotificationsToggle
        enabled={props.notificationsEnabled}
        status={props.notificationStatus}
        onEnabledChange={props.onNotificationsEnabledChange}
      />
      {props.sessions.map((session) => <SessionRow key={session.id} session={session} onOpenSession={props.onOpenSession} />)}
      {props.sessions.length === 0 ? <p className="session-empty">No sessions</p> : null}
    </section>
  );
}

function SessionAuth(props: Pick<SessionListProps, "sshPassword" | "onListSessions" | "onSSHPasswordChange">) {
  return (
    <form className="session-auth" onSubmit={(event) => {
      event.preventDefault();
      props.onListSessions();
    }}>
      <input
        aria-label="SSH password"
        placeholder="Password"
        type="password"
        value={props.sshPassword}
        onChange={(event) => props.onSSHPasswordChange(event.target.value)}
      />
      <button type="submit" aria-label="Connect">
        <KeyRound size={17} aria-hidden="true" />
      </button>
    </form>
  );
}

const notificationStatusLabels: Record<SessionNotificationStatus, string> = {
  denied: "Denied",
  enabling: "Enabling",
  off: "Off",
  watching: "On",
};

function SessionNotificationsToggle(props: {
  enabled: boolean;
  status: SessionNotificationStatus;
  onEnabledChange: (enabled: boolean) => void;
}) {
  return (
    <label className="session-notifications">
      <input
        checked={props.enabled}
        disabled={props.status === "enabling"}
        type="checkbox"
        onChange={(event) => props.onEnabledChange(event.target.checked)}
      />
      <Bell size={16} aria-hidden="true" />
      <span>Session alerts</span>
      <small>{notificationStatusLabels[props.status]}</small>
    </label>
  );
}

function SessionCreate(props: Pick<SessionListProps, "newSessionName" | "onCreateSession" | "onNewSessionNameChange">) {
  return (
    <form className="session-create" onSubmit={(event) => {
      event.preventDefault();
      props.onCreateSession();
    }}>
      <input
        aria-label="New session name"
        placeholder="New session"
        value={props.newSessionName}
        onChange={(event) => props.onNewSessionNameChange(event.target.value)}
      />
    </form>
  );
}

function SessionRow({ session, onOpenSession }: { session: TmuxSession; onOpenSession: (name: string) => void }) {
  return (
    <button className="session-row" type="button" onClick={() => onOpenSession(session.name)}>
      <Activity size={18} aria-hidden="true" />
      <span>
        <strong>{session.title || session.name}</strong>
        <small>{session.name} · {session.windows} windows · {sessionAccessLabel(session)} · {formatTime(session.updatedAt)}</small>
        {session.tags.length > 0 ? <i>{session.tags.join(", ")}</i> : null}
      </span>
      <em className={session.status}>{session.status}</em>
      <ChevronRight size={17} aria-hidden="true" />
    </button>
  );
}

function sessionAccessLabel(session: TmuxSession) {
  if (session.shared) {
    return "shared";
  }
  return session.owner || "private";
}
