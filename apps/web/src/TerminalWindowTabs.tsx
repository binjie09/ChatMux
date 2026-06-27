import { useState } from "react";
import { Monitor, Plus, Terminal, Trash2 } from "lucide-react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  onMoveWindow: (sessionName: string, fromWindowIndex: number, toWindowIndex: number) => void;
  onOpenWindow: (sessionName: string, windowIndex: number) => void;
  onRenameWindow: (sessionName: string, windowIndex: number, name: string) => Promise<void> | void;
};

function windowSortId(window: TmuxWindow) {
  return window.id || String(window.index);
}

export function TerminalWindowTabs(props: TerminalWindowTabsProps) {
  const [editingWindowIndex, setEditingWindowIndex] = useState<number | null>(null);
  const session = props.session;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !session) {
      return;
    }
    const list = session.windowList;
    const from = list.findIndex((window) => windowSortId(window) === String(active.id));
    const to = list.findIndex((window) => windowSortId(window) === String(over.id));
    if (from !== -1 && to !== -1) {
      props.onMoveWindow(session.name, list[from].index, list[to].index);
    }
  };

  if (!session) {
    return null;
  }
  const selectedWindow = session.windowList.find((window) => window.index === props.selectedWindowIndex);
  return (
    <nav className="terminal-window-tabs" aria-label="Terminal windows">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={session.windowList.map(windowSortId)} strategy={horizontalListSortingStrategy}>
          <div className="terminal-window-tab-strip">
            {session.windowList.map((window) => (
              <WindowTab
                key={windowSortId(window)}
                id={windowSortId(window)}
                editing={editingWindowIndex === window.index}
                isSelected={window.index === props.selectedWindowIndex}
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
        </SortableContext>
      </DndContext>
      <div className="terminal-window-picker">
        <select
          aria-label="Select terminal window"
          value={props.selectedWindowIndex ?? selectedWindow?.index ?? ""}
          onChange={(event) => props.onOpenWindow(session.name, Number(event.target.value))}
        >
          {session.windowList.map((window) => (
            <option key={windowSortId(window)} value={window.index}>
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
  id: string;
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  if (props.editing) {
    return (
      <div className="terminal-window-tab editing" ref={setNodeRef} style={style}>
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
    <div
      ref={setNodeRef}
      style={style}
      className={`terminal-window-tab ${props.isSelected ? "selected" : ""} ${props.showActions ? "" : "no-actions"} ${isDragging ? "dragging" : ""}`}
      {...attributes}
      {...listeners}
    >
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
