import { ArrowLeft, Bot, ListTree, Plus, Search, X } from "lucide-react";
import { type ReactNode } from "react";
import { type TmuxWindow } from "./api";
import { windowLabel } from "./session-window-utils";
import "./mobile-terminal.css";

export type MobileTerminalSheet = "context" | "draft";

type MobileTerminalBarProps = {
  hostName: string;
  selectedWindowIndex: number | null;
  sessionName: string;
  title: string;
  windowName: string;
  windows: TmuxWindow[];
  onBack: () => void;
  onCreateWindow: () => void;
  onOpenSheet: (sheet: MobileTerminalSheet) => void;
  onOpenWindow: (windowIndex: number) => void;
};

type MobileTerminalSheetPanelProps = {
  children: ReactNode;
  open: boolean;
  title: string;
  onClose: () => void;
};

export function MobileTerminalBar(props: MobileTerminalBarProps) {
  return (
    <header className="mobile-terminal-bar">
      <button type="button" aria-label="Back to sessions" onClick={props.onBack}>
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <div className="mobile-terminal-title">
        <strong>{props.title}</strong>
        <span>{terminalSubtitle(props.hostName, props.sessionName, props.windowName)}</span>
      </div>
      <div className="mobile-terminal-window-picker">
        <select
          aria-label="Select terminal window"
          value={props.selectedWindowIndex ?? ""}
          onChange={(event) => props.onOpenWindow(Number(event.target.value))}
        >
          {props.windows.map((window) => (
            <option key={window.id || window.index} value={window.index}>
              #{window.index} {windowLabel(window)}
            </option>
          ))}
        </select>
        <button type="button" aria-label="New window" onClick={props.onCreateWindow}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <button type="button" aria-label="Open context" onClick={() => props.onOpenSheet("context")}>
        <Search size={19} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Draft command" onClick={() => props.onOpenSheet("draft")}>
        <Bot size={19} aria-hidden="true" />
      </button>
    </header>
  );
}

function terminalSubtitle(hostName: string, sessionName: string, windowName: string) {
  if (windowName) {
    return `${hostName} · ${sessionName} · ${windowName}`;
  }
  return `${hostName} · ${sessionName}`;
}

export function MobileTerminalSheetPanel(props: MobileTerminalSheetPanelProps) {
  if (!props.open) {
    return null;
  }
  return (
    <div className="mobile-terminal-sheet-layer">
      <button className="mobile-terminal-sheet-scrim" type="button" aria-label="Close panel" onClick={props.onClose} />
      <section className="mobile-terminal-sheet" aria-label={props.title}>
        <header>
          <ListTree size={18} aria-hidden="true" />
          <strong>{props.title}</strong>
          <button type="button" aria-label="Close panel" onClick={props.onClose}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="mobile-terminal-sheet-body">{props.children}</div>
      </section>
    </div>
  );
}
