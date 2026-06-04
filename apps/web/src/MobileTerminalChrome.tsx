import { ArrowLeft, Bot, ListTree, Search, X } from "lucide-react";
import { type ReactNode } from "react";
import "./mobile-terminal.css";

export type MobileTerminalSheet = "context" | "draft";

type MobileTerminalBarProps = {
  hostName: string;
  sessionName: string;
  title: string;
  onBack: () => void;
  onOpenSheet: (sheet: MobileTerminalSheet) => void;
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
      <div>
        <strong>{props.title}</strong>
        <span>{props.hostName} · {props.sessionName}</span>
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
