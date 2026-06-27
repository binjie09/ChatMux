import { useState } from "react";
import { Activity, ChevronRight, Trash2 } from "lucide-react";
import { InlineNameEdit } from "./InlineNameEdit";
import { SessionWindowList } from "./SessionWindowList";
import { type DisplayTmuxSession } from "./session-state-machine";
import { firstSessionWindowIndex, sessionHasMultipleWindows, windowCountLabel } from "./session-window-utils";
import { formatTime } from "./view-utils";

type SessionGroupProps = {
  isExpanded: boolean;
  isSelected: boolean;
  selectedWindowIndex: number | null;
  session: DisplayTmuxSession;
  onDeleteWindow?: (sessionName: string, windowIndex: number) => void;
  onDeleteSession?: (sessionName: string) => void;
  onExpandSession: (name: string) => void;
  onMoveWindow?: (sessionName: string, fromWindowIndex: number, toWindowIndex: number) => void;
  onOpenWindow: (name: string, windowIndex: number) => void;
  onRenameSession?: (sessionName: string, name: string) => Promise<void> | void;
  onRenameWindow?: (sessionName: string, windowIndex: number, name: string) => Promise<void> | void;
};

export function SessionGroup(props: SessionGroupProps) {
  const [editingSession, setEditingSession] = useState(false);
  const handleSessionClick = () => {
    if (sessionHasMultipleWindows(props.session)) {
      props.onExpandSession(props.session.name);
      return;
    }
    const windowIndex = firstSessionWindowIndex(props.session);
    if (windowIndex !== null) {
      props.onOpenWindow(props.session.name, windowIndex);
    }
  };

  return (
    <div className={`session-group ${props.isExpanded ? "expanded" : ""}`}>
      <SessionRow
        editing={editingSession}
        isExpanded={props.isExpanded}
        isSelected={props.isSelected}
        session={props.session}
        onCancelEditing={() => setEditingSession(false)}
        onClick={handleSessionClick}
        onDeleteSession={props.onDeleteSession}
        onRenameSession={props.onRenameSession}
        onStartEditing={() => {
          if (props.onRenameSession) {
            setEditingSession(true);
          }
        }}
      />
      {props.isExpanded ? (
        <SessionWindowList
          selectedWindowIndex={props.selectedWindowIndex}
          windows={props.session.windowList}
          onDeleteWindow={props.onDeleteWindow ? (windowIndex) => props.onDeleteWindow?.(props.session.name, windowIndex) : undefined}
          onMoveWindow={props.onMoveWindow ? (fromWindowIndex, toWindowIndex) => props.onMoveWindow?.(props.session.name, fromWindowIndex, toWindowIndex) : undefined}
          onOpenWindow={(windowIndex) => props.onOpenWindow(props.session.name, windowIndex)}
          onRenameWindow={props.onRenameWindow ? (windowIndex, name) => props.onRenameWindow?.(props.session.name, windowIndex, name) : undefined}
        />
      ) : null}
    </div>
  );
}

function SessionRow({
  editing,
  isExpanded,
  isSelected,
  session,
  onCancelEditing,
  onClick,
  onDeleteSession,
  onRenameSession,
  onStartEditing,
}: {
  editing: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  session: DisplayTmuxSession;
  onCancelEditing: () => void;
  onClick: () => void;
  onDeleteSession?: (sessionName: string) => void;
  onRenameSession?: (sessionName: string, name: string) => Promise<void> | void;
  onStartEditing: () => void;
}) {
  if (editing && onRenameSession) {
    return (
      <div className={`session-row editing ${isSelected ? "selected" : ""}`}>
        <Activity size={18} aria-hidden="true" />
        <InlineNameEdit
          ariaLabel="Rename session"
          initialName={session.name}
          onCancel={onCancelEditing}
          onSave={(name) => onRenameSession(session.name, name)}
        />
      </div>
    );
  }
  return (
    <div className={`session-row ${isSelected ? "selected" : ""}`}>
      <button
        aria-current={isSelected ? "true" : undefined}
        aria-expanded={sessionHasMultipleWindows(session) ? isExpanded : undefined}
        className="session-row-main"
        type="button"
        onClick={onClick}
        onDoubleClick={(event) => {
          event.preventDefault();
          onStartEditing();
        }}
      >
        <Activity size={18} aria-hidden="true" />
        <span>
          <strong>{session.title || session.name}</strong>
          <small>
            {session.name}
            {session.processName ? ` · ${session.processName}` : ""}
            {" · "}
            {windowCountLabel(session.windowList.length)} · {session.owner || "local"} · {formatTime(session.updatedAt)}
          </small>
          {session.tags.length > 0 ? <i>{session.tags.join(", ")}</i> : null}
        </span>
        <em className={session.displayStatus}>{session.statusLabel}</em>
        <ChevronRight className={isExpanded ? "expanded" : ""} size={17} aria-hidden="true" />
      </button>
      {onDeleteSession ? (
        <button
          className="session-window-action delete"
          type="button"
          aria-label={`Delete ${session.name}`}
          onClick={() => {
            if (confirmSessionDeletion(session)) {
              onDeleteSession(session.name);
            }
          }}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function confirmSessionDeletion(session: DisplayTmuxSession) {
  return window.confirm(
    `Delete session "${session.name}"?\n\nThis permanently closes ${windowCountLabel(session.windowList.length)} in the session and cannot be undone.`,
  );
}
