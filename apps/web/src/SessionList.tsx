import { Activity, ChevronRight, KeyRound, Plus } from "lucide-react";
import { type TmuxSession } from "./api";
import "./session-controls.css";
import { formatTime } from "./view-utils";

type SessionListProps = {
  newSessionName: string;
  sessions: TmuxSession[];
  sshPassword: string;
  onCreateSession: () => void;
  onListSessions: () => void;
  onNewSessionNameChange: (value: string) => void;
  onOpenSession: (sessionName: string) => void;
  onSSHPasswordChange: (value: string) => void;
};

export function SessionList(props: SessionListProps) {
  return (
    <section className="session-list">
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
        <strong>{session.name}</strong>
        <small>{session.windows} windows · {formatTime(session.updatedAt)}</small>
      </span>
      <em className={session.status}>{session.status}</em>
      <ChevronRight size={17} aria-hidden="true" />
    </button>
  );
}
