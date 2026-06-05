import { useRef, type RefObject } from "react";
import { Bell, ChevronLeft, KeyRound, Plus, RefreshCw } from "lucide-react";
import "./session-controls.css";
import { SessionGroup } from "./SessionGroup";
import { SessionWindowList } from "./SessionWindowList";
import { type DisplayTmuxSession } from "./session-state-machine";
import { isSSHFallbackSession } from "./tmux-fallback";
import { windowCountLabel } from "./session-window-utils";
import { type SessionNotificationStatus } from "./useSessionNotifications";
import { type SSHCredentialStatus } from "./useSSHCredentialToken";

type SessionListProps = {
  credentialStatus: SSHCredentialStatus;
  expandedSessionNames: ReadonlySet<string>;
  mobileOpen: boolean;
  mobileWindowList: boolean;
  newSessionName: string;
  notificationsEnabled: boolean;
  notificationStatus: SessionNotificationStatus;
  selectedSessionName: string;
  selectedWindowIndex: number | null;
  sessions: DisplayTmuxSession[];
  tmuxFallbackActive: boolean;
  windowListSessionName: string;
  onCreateSession: () => void;
  onDeleteWindow: (sessionName: string, windowIndex: number) => void;
  onExpandSession: (sessionName: string) => void;
  onListSessions: () => void;
  onNewSessionNameChange: (value: string) => void;
  onNotificationsEnabledChange: (enabled: boolean) => void;
  onOpenWindow: (sessionName: string, windowIndex: number) => void;
  onRenameSession: (sessionName: string, name: string) => Promise<void> | void;
  onRenameWindow: (sessionName: string, windowIndex: number, name: string) => Promise<void> | void;
};

export function SessionList(props: SessionListProps) {
  const newSessionInputRef = useRef<HTMLInputElement>(null);
  const handleNewSessionClick = () => {
    if (props.newSessionName.trim()) {
      props.onCreateSession();
      return;
    }
    newSessionInputRef.current?.focus();
  };

  const windowListSession = props.mobileWindowList
    ? props.sessions.find((session) => session.name === props.windowListSessionName)
    : undefined;

  return (
    <section className={`session-list ${props.mobileOpen ? "mobile-open" : ""}`}>
      <SessionListHeader
        inWindowList={Boolean(windowListSession)}
        onBack={() => props.onExpandSession("")}
        onNewSessionClick={handleNewSessionClick}
        showNewSession={!props.tmuxFallbackActive}
      />

      <div className="session-list-content">
        {windowListSession ? (
          <MobileWindowListView
            selectedWindowIndex={props.selectedSessionName === windowListSession.name ? props.selectedWindowIndex : null}
            session={windowListSession}
            onDeleteWindow={(windowIndex) => props.onDeleteWindow(windowListSession.name, windowIndex)}
            onOpenWindow={(windowIndex) => props.onOpenWindow(windowListSession.name, windowIndex)}
            onRenameWindow={(windowIndex, name) => props.onRenameWindow(windowListSession.name, windowIndex, name)}
          />
        ) : (
          <SessionListBody {...props} inputRef={newSessionInputRef} />
        )}
      </div>
    </section>
  );
}

function SessionListHeader(props: {
  inWindowList: boolean;
  onBack: () => void;
  onNewSessionClick: () => void;
  showNewSession: boolean;
}) {
  return (
    <header className={`session-list-header ${props.inWindowList ? "window-list" : "conversation-list"}`}>
      {props.inWindowList ? (
        <button className="icon-button" type="button" aria-label="Back to conversations" onClick={props.onBack}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      ) : null}
      <div>
        <p>Remote tmux</p>
        <h1>{props.inWindowList ? "Windows" : "Conversations"}</h1>
      </div>
      {props.showNewSession ? (
        <button className="icon-button" type="button" aria-label="New session" onClick={props.onNewSessionClick}>
          <Plus size={19} aria-hidden="true" />
        </button>
      ) : null}
    </header>
  );
}

function SessionListBody(props: SessionListProps & { inputRef: RefObject<HTMLInputElement | null> }) {
  return (
    <>
      <SessionConnectionStatus credentialStatus={props.credentialStatus} onListSessions={props.onListSessions} />
      <TmuxFallbackNotice visible={props.tmuxFallbackActive} />
      {!props.tmuxFallbackActive ? (
        <SessionCreate
          inputRef={props.inputRef}
          newSessionName={props.newSessionName}
          onCreateSession={props.onCreateSession}
          onNewSessionNameChange={props.onNewSessionNameChange}
        />
      ) : null}
      <SessionNotificationsToggle
        enabled={props.notificationsEnabled}
        status={props.notificationStatus}
        onEnabledChange={props.onNotificationsEnabledChange}
      />
      <SessionNotificationPrompt status={props.notificationStatus} />
      {props.sessions.map((session) => (
        <SessionGroup
          isExpanded={!props.mobileWindowList && props.expandedSessionNames.has(session.name)}
          isSelected={props.selectedSessionName === session.name}
          key={session.id}
          selectedWindowIndex={props.selectedSessionName === session.name ? props.selectedWindowIndex : null}
          session={session}
          onDeleteWindow={isSSHFallbackSession(session) ? undefined : props.onDeleteWindow}
          onExpandSession={props.onExpandSession}
          onOpenWindow={props.onOpenWindow}
          onRenameSession={isSSHFallbackSession(session) ? undefined : props.onRenameSession}
          onRenameWindow={isSSHFallbackSession(session) ? undefined : props.onRenameWindow}
        />
      ))}
      {props.sessions.length === 0 ? <p className="session-empty">No sessions</p> : null}
    </>
  );
}

function TmuxFallbackNotice(props: { visible: boolean }) {
  if (!props.visible) {
    return null;
  }
  return (
    <div className="session-tmux-fallback">
      <strong>tmux unavailable</strong>
      <span>Connected with a single SSH shell. Install tmux and reconnect for sessions and windows.</span>
    </div>
  );
}

function MobileWindowListView(props: {
  selectedWindowIndex: number | null;
  session: DisplayTmuxSession;
  onDeleteWindow: (windowIndex: number) => void;
  onOpenWindow: (windowIndex: number) => void;
  onRenameWindow: (windowIndex: number, name: string) => Promise<void> | void;
}) {
  return (
    <div className="session-mobile-windows">
      <div className="session-window-heading">
        <div>
          <strong>{props.session.title || props.session.name}</strong>
          <small>{props.session.name} · {windowCountLabel(props.session.windowList.length)}</small>
        </div>
      </div>
      <SessionWindowList
        selectedWindowIndex={props.selectedWindowIndex}
        windows={props.session.windowList}
        onDeleteWindow={isSSHFallbackSession(props.session) ? undefined : props.onDeleteWindow}
        onOpenWindow={props.onOpenWindow}
        onRenameWindow={isSSHFallbackSession(props.session) ? undefined : props.onRenameWindow}
      />
    </div>
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

function SessionCreate(props: Pick<SessionListProps, "newSessionName" | "onCreateSession" | "onNewSessionNameChange"> & {
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <form className="session-create" onSubmit={(event) => {
      event.preventDefault();
      props.onCreateSession();
    }}>
      <input
        aria-label="New session name"
        placeholder="New session"
        ref={props.inputRef}
        value={props.newSessionName}
        onChange={(event) => props.onNewSessionNameChange(event.target.value)}
      />
    </form>
  );
}
