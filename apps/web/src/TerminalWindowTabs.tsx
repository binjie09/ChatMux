import { useState } from "react";
import { Monitor, Plus, Terminal, Trash2 } from "lucide-react";
import { InlineNameEdit } from "./InlineNameEdit";
import { type TmuxWindow } from "./api";
import { type DisplayTmuxSession } from "./session-state-machine";
import { windowDisplayLabel, windowLabel } from "./session-window-utils";

type TerminalWindowTabsProps = {
  selectedWindowIndex: number | null;
  session: DisplayTmuxSession | undefined;
  tmuxFallbackActive: boolean;
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
            onEdit={() => {
              if (!props.tmuxFallbackActive) {
                setEditingWindowIndex(window.index);
              }
            }}
            onOpenWindow={props.onOpenWindow}
            onRenameWindow={props.onRenameWindow}
            showActions={!props.tmuxFallbackActive}
            onStopEditing={() => setEditingWindowIndex(null)}
          />
        ))}
        {!props.tmuxFallbackActive ? (
          <button className="terminal-window-add" type="button" aria-label="New window" onClick={() => props.onCreateWindow(session.name)}>
            <Plus size={16} aria-hidden="true" />
          </button>
        ) : null}
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
        {!props.tmuxFallbackActive ? (
          <>
            <button type="button" aria-label="New window" onClick={() => props.onCreateWindow(session.name)}>
              <Plus size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Delete selected window"
              disabled={props.selectedWindowIndex === null}
              onClick={() => {
                if (props.selectedWindowIndex !== null) {
                  props.onDeleteWindow(session.name, props.selectedWindowIndex);
                }
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
    </nav>
  );
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
    <div className={`terminal-window-tab ${props.isSelected ? "selected" : ""}`}>
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
        <span>{windowDisplayLabel(props.window)}</span>
      </button>
      {props.showActions ? (
        <button type="button" aria-label={`Delete ${windowLabel(props.window)}`} onClick={() => props.onDeleteWindow(props.sessionName, props.window.index)}>
          <Trash2 size={13} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
