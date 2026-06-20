import { ArrowLeft, Bot, Download, Files, ListTree, Plus, X } from "lucide-react";
import { type ReactNode } from "react";
import { type TmuxWindow } from "./api";
import { windowDisplayLabel } from "./session-window-utils";
import { OverflowText } from "./OverflowText";
import { TerminalFileUploadButton } from "./TerminalFileUploadButton";
import "./mobile-terminal.css";

export type MobileTerminalSheet = "draft" | "files";

type MobileTerminalBarProps = {
  hostName: string;
  loading: boolean;
  selectedWindowIndex: number | null;
  sessionName: string;
  title: string;
  tmuxFallbackActive: boolean;
  tmuxInstallPending: boolean;
  windowName: string;
  windows: TmuxWindow[];
  onBack: () => void;
  onCreateWindow: () => void;
  onInstallTmux: () => void;
  onOpenSheet: (sheet: MobileTerminalSheet) => void;
  onOpenWindow: (windowIndex: number) => void;
  onUploadFile: ((file: File) => Promise<void>) | null;
};

type MobileTerminalSheetPanelProps = {
  action?: ReactNode;
  children: ReactNode;
  open: boolean;
  title: string;
  onClose: () => void;
};

export function MobileTerminalBar(props: MobileTerminalBarProps) {
  return (
    <header className={mobileTerminalBarClassName(props.loading, props.tmuxFallbackActive)}>
      <button type="button" aria-label="Back to sessions" onClick={props.onBack}>
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <div className="mobile-terminal-title">
        <OverflowText as="strong">{props.title}</OverflowText>
        <OverflowText as="span">{terminalSubtitle(props.hostName, props.sessionName, props.windowName)}</OverflowText>
      </div>
      {props.loading ? null : props.tmuxFallbackActive ? (
        <>
          <button
            className="mobile-terminal-install"
            type="button"
            aria-label="Install tmux"
            disabled={props.tmuxInstallPending}
            onClick={props.onInstallTmux}
          >
            <Download size={18} aria-hidden="true" />
            <span>{props.tmuxInstallPending ? "Installing" : "Install tmux"}</span>
          </button>
          {props.onUploadFile ? <TerminalFileUploadButton onUpload={props.onUploadFile} /> : null}
        </>
      ) : (
        <>
          <div className="mobile-terminal-window-picker">
            <select
              aria-label="Select terminal window"
              value={props.selectedWindowIndex ?? ""}
              onChange={(event) => props.onOpenWindow(Number(event.target.value))}
            >
              {props.windows.map((window) => (
                <option key={window.id || window.index} value={window.index}>
                  #{window.index} {windowDisplayLabel(window)}
                </option>
              ))}
            </select>
            <button type="button" aria-label="New window" onClick={props.onCreateWindow}>
              <Plus size={18} aria-hidden="true" />
            </button>
            {props.onUploadFile ? <TerminalFileUploadButton onUpload={props.onUploadFile} /> : null}
          </div>
          <button type="button" aria-label="Open files" onClick={() => props.onOpenSheet("files")}>
            <Files size={19} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Draft command" onClick={() => props.onOpenSheet("draft")}>
            <Bot size={19} aria-hidden="true" />
          </button>
        </>
      )}
    </header>
  );
}

function mobileTerminalBarClassName(loading: boolean, tmuxFallbackActive: boolean) {
  return [
    "mobile-terminal-bar",
    loading ? "loading" : "",
    tmuxFallbackActive ? "tmux-fallback" : "",
  ].filter(Boolean).join(" ");
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
        <header className={props.action ? "has-action" : ""}>
          <ListTree size={18} aria-hidden="true" />
          <strong>{props.title}</strong>
          {props.action}
          <button type="button" aria-label="Close panel" onClick={props.onClose}>
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="mobile-terminal-sheet-body">{props.children}</div>
      </section>
    </div>
  );
}
