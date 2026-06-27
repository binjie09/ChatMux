import { useRef, useState, type RefObject } from "react";
import { Bell, ChevronLeft, KeyRound, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RefreshCw } from "lucide-react";
import "./session-controls.css";
import { InlineNameEdit } from "./InlineNameEdit";
import { SessionGroup } from "./SessionGroup";
import { SessionWindowList } from "./SessionWindowList";
import { type DisplayTmuxSession } from "./session-state-machine";
import { isSSHFallbackSession } from "./tmux-fallback";
import { windowCountLabel } from "./session-window-utils";
import { arrayMove, DraggableItem, SortableList } from "./drag-reorder";
import { OverflowText } from "./OverflowText";
import { useIsMobileLayout } from "./useIsMobileLayout";
import { type SessionNotificationStatus } from "./useSessionNotifications";
import { type SSHCredentialStatus } from "./useSSHCredentialToken";

type SessionListProps = {
  credentialStatus: SSHCredentialStatus;
  desktopCollapsed: boolean;
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
  onCreateWindow: (sessionName: string) => void;
  onDeleteWindow: (sessionName: string, windowIndex: number) => void;
  onDeleteSession: (sessionName: string) => void;
  onDesktopCollapsedChange: (collapsed: boolean) => void;
  onExpandSession: (sessionName: string) => void;
  onListSessions: () => void;
  onMoveWindow: (sessionName: string, fromWindowIndex: number, toWindowIndex: number) => void;
  onNewSessionNameChange: (value: string) => void;
  onNotificationsEnabledChange: (enabled: boolean) => void;
  onOpenWindow: (sessionName: string, windowIndex: number) => void;
  onReorderSessions: (orderedNames: string[]) => void;
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
  const handleCreateClick = () => {
    if (windowListSession) {
      props.onCreateWindow(windowListSession.name);
      return;
    }
    handleNewSessionClick();
  };

  return (
    <section className={`session-list ${props.desktopCollapsed ? "desktop-collapsed" : ""} ${props.mobileOpen ? "mobile-open" : ""}`}>
      <SessionListHeader
        createLabel={windowListSession ? "New window" : "New session"}
        desktopCollapsed={props.desktopCollapsed}
        inWindowList={Boolean(windowListSession)}
        onBack={() => props.onExpandSession("")}
        onCreateClick={handleCreateClick}
        onDesktopCollapsedChange={props.onDesktopCollapsedChange}
        showNewSession={!props.tmuxFallbackActive || Boolean(windowListSession)}
      />

      <div className="session-list-content">
        {windowListSession ? (
          <MobileWindowListView
          selectedWindowIndex={props.selectedSessionName === windowListSession.name ? props.selectedWindowIndex : null}
          session={windowListSession}
          onDeleteWindow={canDeleteWindow(windowListSession) ? (windowIndex) => props.onDeleteWindow(windowListSession.name, windowIndex) : undefined}
          onMoveWindow={(fromWindowIndex, toWindowIndex) => props.onMoveWindow(windowListSession.name, fromWindowIndex, toWindowIndex)}
          onOpenWindow={(windowIndex) => props.onOpenWindow(windowListSession.name, windowIndex)}
          onRenameSession={props.onRenameSession}
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
  createLabel: string;
  desktopCollapsed: boolean;
  inWindowList: boolean;
  onBack: () => void;
  onCreateClick: () => void;
  onDesktopCollapsedChange: (collapsed: boolean) => void;
  showNewSession: boolean;
}) {
  return (
    <header className={`session-list-header ${props.inWindowList ? "window-list" : "conversation-list"}`}>
      {props.inWindowList ? (
        <button className="icon-button" type="button" aria-label="Back to conversations" onClick={props.onBack}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      ) : null}
      <div className="session-list-title">
        <p>Remote tmux</p>
        <h1>{props.inWindowList ? "Windows" : "Conversations"}</h1>
      </div>
      <button
        className="desktop-collapse-button session-list-collapse-button"
        type="button"
        aria-label={props.desktopCollapsed ? "Expand conversations sidebar" : "Collapse conversations sidebar"}
        title={props.desktopCollapsed ? "Expand conversations sidebar" : "Collapse conversations sidebar"}
        onClick={() => props.onDesktopCollapsedChange(!props.desktopCollapsed)}
      >
        {props.desktopCollapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
      </button>
      {props.showNewSession ? (
        <button className="icon-button" type="button" aria-label={props.createLabel} onClick={props.onCreateClick}>
          <Plus size={19} aria-hidden="true" />
        </button>
      ) : null}
    </header>
  );
}

function SessionListBody(props: SessionListProps & { inputRef: RefObject<HTMLInputElement | null> }) {
  const isMobile = useIsMobileLayout();
  const sessionIds = props.sessions.map((session) => session.id);
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
      <SortableList
        items={props.sessions}
        ids={sessionIds}
        orientation="vertical"
        onReorder={(from, to) => props.onReorderSessions(arrayMove(props.sessions.map((session) => session.name), from, to))}
      >
        {(session, _index, sortable) => (
          <DraggableItem sortable={sortable} isMobile={isMobile} className="session-drag-item">
            <SessionGroup
              isExpanded={!props.mobileWindowList && props.expandedSessionNames.has(session.name)}
              isSelected={props.selectedSessionName === session.name}
              selectedWindowIndex={props.selectedSessionName === session.name ? props.selectedWindowIndex : null}
              session={session}
              onDeleteWindow={canDeleteWindow(session) ? props.onDeleteWindow : undefined}
              onDeleteSession={isSSHFallbackSession(session) ? undefined : props.onDeleteSession}
              onExpandSession={props.onExpandSession}
              onMoveWindow={props.onMoveWindow}
              onOpenWindow={props.onOpenWindow}
              onRenameSession={isSSHFallbackSession(session) ? undefined : props.onRenameSession}
              onRenameWindow={props.onRenameWindow}
            />
          </DraggableItem>
        )}
      </SortableList>
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
      <span>SSH tabs stay alive in the gateway across refreshes. Install tmux for remote sessions and history.</span>
    </div>
  );
}

type MobileWindowListViewProps = {
  selectedWindowIndex: number | null;
  session: DisplayTmuxSession;
  onDeleteWindow?: (windowIndex: number) => void;
  onMoveWindow?: (fromWindowIndex: number, toWindowIndex: number) => void;
  onOpenWindow: (windowIndex: number) => void;
  onRenameSession: (sessionName: string, name: string) => Promise<void> | void;
  onRenameWindow: (windowIndex: number, name: string) => Promise<void> | void;
};

function MobileWindowListView(props: MobileWindowListViewProps) {
  const [editingSession, setEditingSession] = useState(false);
  if (editingSession) {
    return (
      <div className="session-mobile-windows">
        <div className="session-window-heading editing">
          <InlineNameEdit
            ariaLabel="Rename session"
            initialName={props.session.name}
            onCancel={() => setEditingSession(false)}
            onSave={(name) => props.onRenameSession(props.session.name, name)}
          />
        </div>
        <MobileWindowRows {...props} />
      </div>
    );
  }
  return (
    <div className="session-mobile-windows">
      <div className="session-window-heading">
        <div>
          <OverflowText as="strong">{props.session.title || props.session.name}</OverflowText>
          <OverflowText as="small">{`${props.session.name} · ${windowCountLabel(props.session.windowList.length)}`}</OverflowText>
        </div>
        {!isSSHFallbackSession(props.session) ? (
          <button className="session-window-action" type="button" aria-label={`Rename ${props.session.name}`} onClick={() => setEditingSession(true)}>
            <Pencil size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <MobileWindowRows {...props} />
    </div>
  );
}

function MobileWindowRows(props: Pick<MobileWindowListViewProps, "onDeleteWindow" | "onMoveWindow" | "onOpenWindow" | "onRenameWindow" | "selectedWindowIndex" | "session">) {
  return (
    <SessionWindowList
      selectedWindowIndex={props.selectedWindowIndex}
      windows={props.session.windowList}
      onDeleteWindow={canDeleteWindow(props.session) ? props.onDeleteWindow : undefined}
      onMoveWindow={props.onMoveWindow}
      onOpenWindow={props.onOpenWindow}
      onRenameWindow={props.onRenameWindow}
      showRenameButton
    />
  );
}

function canDeleteWindow(session: DisplayTmuxSession) {
  // Normal tmux sessions may delete any window; killing the last window simply
  // destroys the session. The gateway-managed SSH fallback keeps one shell
  // alive, and the backend rejects deleting its last window (errFallbackLastWindow),
  // so guard it here rather than surfacing that rejection.
  if (isSSHFallbackSession(session)) {
    return session.windowList.length > 1;
  }
  return true;
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
