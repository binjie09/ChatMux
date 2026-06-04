import { Activity, Bell, ChevronRight, KeyRound, Plus, RefreshCw } from "lucide-react";
import { type TmuxSession } from "./api";
import "./session-controls.css";
import { type SessionNotificationStatus } from "./useSessionNotifications";
import { type SSHCredentialStatus } from "./useSSHCredentialToken";
import { formatTime } from "./view-utils";

type SessionListProps = {
  credentialStatus: SSHCredentialStatus;
  mobileOpen: boolean;
  newSessionName: string;
  notificationsEnabled: boolean;
  notificationStatus: SessionNotificationStatus;
  selectedSessionName: string;
  sessions: TmuxSession[];
  onCreateSession: () => void;
  onListSessions: () => void;
  onNewSessionNameChange: (value: string) => void;
  onNotificationsEnabledChange: (enabled: boolean) => void;
  onOpenSession: (sessionName: string) => void;
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

      <SessionConnectionStatus credentialStatus={props.credentialStatus} onListSessions={props.onListSessions} />
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
      <SessionNotificationPrompt status={props.notificationStatus} />
      {props.sessions.map((session) => (
        <SessionRow
          key={session.id}
          isSelected={props.selectedSessionName === session.name}
          session={session}
          onOpenSession={props.onOpenSession}
        />
      ))}
      {props.sessions.length === 0 ? <p className="session-empty">No sessions</p> : null}
    </section>
  );
}

function SessionConnectionStatus(props: Pick<SessionListProps, "credentialStatus" | "onListSessions">) {
  return (
    <div className="session-connection" aria-label="Connection status">
      <KeyRound size={17} aria-hidden="true" />
      <small className={`credential-status ${props.credentialStatus.tone}`}>{props.credentialStatus.label}</small>
      <button type="button" aria-label="Refresh sessions" onClick={props.onListSessions}>
        <RefreshCw size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

const notificationStatusLabels: Record<SessionNotificationStatus, string> = {
  "credential-error": "Check SSH credential",
  "credential-needed": "SSH credential needed",
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

function SessionNotificationPrompt(props: { status: SessionNotificationStatus }) {
  if (props.status !== "credential-needed" && props.status !== "credential-error") {
    return null;
  }
  return (
    <div className="session-notification-prompt">
      <span>{notificationPromptLabel(props.status)}</span>
    </div>
  );
}

function notificationPromptLabel(status: SessionNotificationStatus) {
  if (status === "credential-error") {
    return "Session alerts need a valid saved SSH credential.";
  }
  return "Session alerts need a saved SSH credential.";
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

function SessionRow({
  isSelected,
  session,
  onOpenSession,
}: {
  isSelected: boolean;
  session: TmuxSession;
  onOpenSession: (name: string) => void;
}) {
  return (
    <button
      aria-current={isSelected ? "true" : undefined}
      className={`session-row ${isSelected ? "selected" : ""}`}
      type="button"
      onClick={() => onOpenSession(session.name)}
    >
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
