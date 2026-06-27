import { useState } from "react";
import { Monitor, Plus, Terminal, Trash2 } from "lucide-react";
import { InlineNameEdit } from "./InlineNameEdit";
import { type TmuxWindow } from "./api";
import { type DisplayTmuxSession } from "./session-state-machine";
import { windowDisplayLabel, windowLabel } from "./session-window-utils";
import { isSSHFallbackSession } from "./tmux-fallback";
import { OverflowText } from "./OverflowText";

type TerminalWindowTabsProps = {
  selectedWindowIndex: number | null;
  session: DisplayTmuxSession | undefined;
  onCreateWindow: (sessionName: string) => void;
  onDeleteWindow: (sessionName: string, windowIndex: number) => void;
  onOpenWindow: (sessionName: string, windowIndex: number) => void;
  onRenameWindow: (sessionName: string, windowIndex: number, name: string) => Promise<void> | void;
};

export function TerminalWindowTabs(props: TerminalWindowTabsProps) {
  const [editingWindowIndex, setEditingWindowIndex] = useState<number | null>(null);
  const session = props.session;
  if (!session) {
    return null;
  }
  const selectedWindow = session.windowList.find((window) => window.index === props.selectedWindowIndex);
  return (
    <nav className="terminal-window-tabs" aria-label="Terminal windows">
      <div className="terminal-window-tab-strip">
        {session.windowList.map((window) => (
          <WindowTab
            editing={editingWindowIndex === window.index}
            isSelected={window.index === props.selectedWindowIndex}
            key={window.id || window.index}
            sessionName={session.name}
            window={window}
            onDeleteWindow={props.onDeleteWindow}
            onEdit={() => setEditingWindowIndex(window.index)}
            onOpenWindow={props.onOpenWindow}
            onRenameWindow={props.onRenameWindow}
            showActions={canDeleteWindow(session)}
            onStopEditing={() => setEditingWindowIndex(null)}
          />
        ))}
        <button className="terminal-window-add" type="button" aria-label="New window" onClick={() => props.onCreateWindow(session.name)}>
          <Plus size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="terminal-window-picker">
        <select
          aria-label="Select terminal window"
          value={props.selectedWindowIndex ?? selectedWindow?.index ?? ""}
          onChange={(event) => props.onOpenWindow(session.name, Number(event.target.value))}
        >
          {session.windowList.map((window) => (
            <option key={window.id || window.index} value={window.index}>
              #{window.index} {windowDisplayLabel(window)}
            </option>
          ))}
        </select>
        <button type="button" aria-label="New window" onClick={() => props.onCreateWindow(session.name)}>
          <Plus size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Delete selected window"
          disabled={props.selectedWindowIndex === null || !canDeleteWindow(session)}
          onClick={() => {
            if (props.selectedWindowIndex !== null) {
              props.onDeleteWindow(session.name, props.selectedWindowIndex);
            }
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

function canDeleteWindow(session: DisplayTmuxSession | undefined) {
  // Normal tmux sessions may delete any window (the last one takes the session
  // with it). Only the gateway-managed SSH fallback's last window is protected,
  // because the backend rejects emptying it.
  if (isSSHFallbackSession(session)) {
    return (session?.windowList.length ?? 0) > 1;
  }
  return true;
}

function WindowTab(props: {
  editing: boolean;
  isSelected: boolean;
  sessionName: string;
  window: TmuxWindow;
  onDeleteWindow: (sessionName: string, windowIndex: number) => void;
  onEdit: () => void;
  onOpenWindow: (sessionName: string, windowIndex: number) => void;
  onRenameWindow: (sessionName: string, windowIndex: number, name: string) => Promise<void> | void;
  showActions: boolean;
  onStopEditing: () => void;
}) {
  if (props.editing) {
    return (
      <div className="terminal-window-tab editing">
        <InlineNameEdit
          ariaLabel="Rename window"
          initialName={windowLabel(props.window)}
          onCancel={props.onStopEditing}
          onSave={(name) => props.onRenameWindow(props.sessionName, props.window.index, name)}
        />
      </div>
    );
  }
  return (
    <div className={`terminal-window-tab ${props.isSelected ? "selected" : ""} ${props.showActions ? "" : "no-actions"}`}>
      <button
        type="button"
        aria-current={props.isSelected ? "true" : undefined}
        onClick={() => props.onOpenWindow(props.sessionName, props.window.index)}
        onDoubleClick={(event) => {
          event.preventDefault();
          props.onEdit();
        }}
      >
        {props.window.active ? <Terminal size={14} aria-hidden="true" /> : <Monitor size={14} aria-hidden="true" />}
        <OverflowText>{windowDisplayLabel(props.window)}</OverflowText>
      </button>
      {props.showActions ? (
        <button
          className="terminal-window-delete"
          type="button"
          aria-label={`Delete ${windowLabel(props.window)}`}
          onClick={() => props.onDeleteWindow(props.sessionName, props.window.index)}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
