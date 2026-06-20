import { useState } from "react";
import { Monitor, Pencil, Terminal, Trash2 } from "lucide-react";
import { InlineNameEdit } from "./InlineNameEdit";
import { type TmuxWindow } from "./api";
import { windowDisplayLabel, windowLabel } from "./session-window-utils";
import { OverflowText } from "./OverflowText";
import { formatTime } from "./view-utils";

type SessionWindowListProps = {
  selectedWindowIndex: number | null;
  windows: TmuxWindow[];
  onDeleteWindow?: (windowIndex: number) => void;
  onOpenWindow: (windowIndex: number) => void;
  onRenameWindow?: (windowIndex: number, name: string) => Promise<void> | void;
  showRenameButton?: boolean;
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
          showRenameButton={Boolean(props.showRenameButton)}
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
  showRenameButton,
  onStartEditing,
  onStopEditing,
}: {
  editing: boolean;
  isSelected: boolean;
  window: TmuxWindow;
  onDeleteWindow?: (windowIndex: number) => void;
  onOpenWindow: (windowIndex: number) => void;
  onRenameWindow?: (windowIndex: number, name: string) => Promise<void> | void;
  showRenameButton: boolean;
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
  const canRename = showRenameButton && Boolean(onRenameWindow);
  const actionCount = (canRename ? 1 : 0) + (onDeleteWindow ? 1 : 0);
  return (
    <div className={`session-window-row ${isSelected ? "selected" : ""} ${actionCount > 1 ? "has-two-actions" : ""}`}>
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
          <OverflowText as="strong">{windowDisplayLabel(window)}</OverflowText>
          <small>
            #{window.index}
            {" · "}
            {formatTime(window.updatedAt)}
          </small>
        </span>
        <em className={window.status}>{window.status}</em>
      </button>
      {canRename ? (
        <button className="session-window-action" type="button" aria-label={`Rename ${windowLabel(window)}`} onClick={onStartEditing}>
          <Pencil size={14} aria-hidden="true" />
        </button>
      ) : null}
      {onDeleteWindow ? (
        <button className="session-window-action delete" type="button" aria-label={`Delete ${windowLabel(window)}`} onClick={() => onDeleteWindow(window.index)}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
