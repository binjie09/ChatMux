import { useState } from "react";
import { Monitor, Terminal, Trash2 } from "lucide-react";
import { InlineNameEdit } from "./InlineNameEdit";
import { type TmuxWindow } from "./api";
import { windowLabel } from "./session-window-utils";
import { formatTime } from "./view-utils";

type SessionWindowListProps = {
  selectedWindowIndex: number | null;
  windows: TmuxWindow[];
  onDeleteWindow?: (windowIndex: number) => void;
  onOpenWindow: (windowIndex: number) => void;
  onRenameWindow?: (windowIndex: number, name: string) => Promise<void> | void;
};

export function SessionWindowList(props: SessionWindowListProps) {
  const [editingWindowIndex, setEditingWindowIndex] = useState<number | null>(null);
  if (props.windows.length === 0) {
    return <p className="session-empty">No windows</p>;
  }
  return (
    <div className="session-window-list">
      {props.windows.map((window) => (
        <WindowRow
          isSelected={props.selectedWindowIndex === window.index}
          key={window.id || window.index}
          editing={editingWindowIndex === window.index}
          window={window}
          onDeleteWindow={props.onDeleteWindow}
          onRenameWindow={props.onRenameWindow}
          onStopEditing={() => setEditingWindowIndex(null)}
          onStartEditing={() => setEditingWindowIndex(window.index)}
          onOpenWindow={props.onOpenWindow}
        />
      ))}
    </div>
  );
}

function WindowRow({
  editing,
  isSelected,
  window,
  onDeleteWindow,
  onOpenWindow,
  onRenameWindow,
  onStartEditing,
  onStopEditing,
}: {
  editing: boolean;
  isSelected: boolean;
  window: TmuxWindow;
  onDeleteWindow?: (windowIndex: number) => void;
  onOpenWindow: (windowIndex: number) => void;
  onRenameWindow?: (windowIndex: number, name: string) => Promise<void> | void;
  onStartEditing: () => void;
  onStopEditing: () => void;
}) {
  if (editing && onRenameWindow) {
    return (
      <div className={`session-window-row editing ${isSelected ? "selected" : ""}`}>
        <InlineNameEdit
          ariaLabel="Rename window"
          initialName={windowLabel(window)}
          onCancel={onStopEditing}
          onSave={(name) => onRenameWindow(window.index, name)}
        />
      </div>
    );
  }
  return (
    <div className={`session-window-row ${isSelected ? "selected" : ""}`}>
      <button
        aria-current={isSelected ? "true" : undefined}
        type="button"
        onClick={() => onOpenWindow(window.index)}
        onDoubleClick={(event) => {
          event.preventDefault();
          onStartEditing();
        }}
      >
        {window.active ? <Terminal size={16} aria-hidden="true" /> : <Monitor size={16} aria-hidden="true" />}
        <span>
          <strong>{windowLabel(window)}</strong>
          <small>
            #{window.index}
            {window.processName ? ` · ${window.processName}` : ""}
            {" · "}
            {formatTime(window.updatedAt)}
          </small>
        </span>
        <em className={window.status}>{window.status}</em>
      </button>
      {onDeleteWindow ? (
        <button className="session-window-delete" type="button" aria-label={`Delete ${windowLabel(window)}`} onClick={() => onDeleteWindow(window.index)}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
