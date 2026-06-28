import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { MousePointer2, RefreshCw, TextCursorInput } from "lucide-react";
import { TerminalQuickKeys } from "./TerminalQuickKeys";
import { TerminalScrollbackOverlay } from "./TerminalScrollbackOverlay";
import { bindTerminalClipboard } from "./terminal-clipboard";
import { bindTerminalPaste, type TerminalPasteHandlers } from "./terminal-file-paste";
import { sendTerminalInput, sendTerminalResize, terminalSize } from "./terminal-protocol";
import { terminalTheme } from "./terminal-theme";
import { useExternalReconnect } from "./useExternalReconnect";
import { type ConnectionStatus, type TerminalHandlers, useTerminalSocket } from "./useTerminalSocket";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";

type NativeTerminalProps = {
  createWebSocketURL: ((status: ConnectionStatus) => Promise<string>) | null;
  loadScrollbackHistory?: ((lines: number) => Promise<string>) | null;
  loading: boolean;
  onConnectionClosed: () => void;
  onConnectionBlocked?: (message: string) => boolean;
  onConnectionError: (message: string) => void;
  onConnectionReady: (status: ConnectionStatus) => void;
  onPasteFile?: ((file: File) => Promise<string>) | null;
  queuedInput: QueuedTerminalInput | null;
  onQueuedInputSent: (inputId: number) => void;
  reconnectSignal: number;
  sessionKey: string;
};

type NativeTerminalHandlers = TerminalHandlers & TerminalPasteHandlers;

export type QueuedTerminalInput = {
  data: string;
  id: number;
  source?: "composer" | "installer" | "terminal";
};

const statusLabel: Record<ConnectionStatus, string> = {
  idle: "Idle",
  connecting: "Connecting",
  connected: "Live",
  recovering: "Recovering",
  error: "Disconnected",
};

type MobileTerminalInteractionMode = "input" | "select";

export function NativeTerminal(props: NativeTerminalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const connectorRef = useRef(props.createWebSocketURL);
  const handlersRef = useRef<NativeTerminalHandlers>(props);
  const [terminalReady, setTerminalReady] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [mobileInteractionMode, setMobileInteractionMode] = useState<MobileTerminalInteractionMode>("input");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const reconnecting = status === "connecting" || status === "recovering";
  const canReconnect = Boolean(props.sessionKey && props.createWebSocketURL && !reconnecting);
  const terminalStatus = props.loading ? "loading" : status;

  useEffect(() => {
    connectorRef.current = props.createWebSocketURL;
  }, [props.createWebSocketURL]);

  useEffect(() => {
    handlersRef.current = props;
  }, [props]);

  useTerminalMount({
    handlersRef,
    mode: mobileInteractionMode,
    setTerminalReady,
    socketRef,
    terminalInstanceRef,
    terminalRef,
  });
  useSessionReset(props.sessionKey, props.loading, terminalInstanceRef);
  useTerminalSocket({
    connectorRef,
    handlersRef,
    reconnectAttempt,
    sessionKey: props.sessionKey,
    setStatus,
    socketRef,
    terminalInstanceRef,
  });
  useQueuedInput(props.queuedInput, socketRef, status, props.onQueuedInputSent);
  useExternalReconnect(props.reconnectSignal, reconnect);
  useTerminalFocusEvents(terminalInstanceRef, terminalReady, setTerminalFocused);
  useTerminalFocusShortcut(terminalInstanceRef);

  function reconnect() {
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close();
    setReconnectAttempt((current) => current + 1);
  }

  function sendQuickKey(data: string) {
    setMobileInteractionMode("input");
    sendTerminalInput(socketRef.current, data);
    terminalInstanceRef.current?.focus();
  }

  function focusTerminal() {
    terminalInstanceRef.current?.focus();
  }

  return (
    <div className={`terminal-shell terminal-${mobileInteractionMode}-mode ${props.loading ? "loading" : ""}`} aria-label="Terminal">
      <div className="terminal-toolbar">
        <div className="terminal-status-group">
          <span className={`terminal-connection ${terminalStatus}`}>{props.loading ? "Loading" : statusLabel[status]}</span>
          {props.loading ? null : (
            <TerminalFocusHint focused={terminalFocused} onFocus={focusTerminal} />
          )}
        </div>
        {props.loading ? null : (
          <div className="terminal-toolbar-actions">
            <MobileInteractionToggle mode={mobileInteractionMode} onModeChange={setMobileInteractionMode} />
            <button type="button" disabled={!canReconnect} onClick={reconnect}>
              <RefreshCw size={14} aria-hidden="true" />
              Reconnect
            </button>
          </div>
        )}
      </div>
      <div className="terminal-screen" ref={terminalRef}>
        <TerminalLoadingState active={props.loading} />
        {mobileInteractionMode === "select" && terminalReady && terminalInstanceRef.current ? (
          <TerminalScrollbackOverlay loadEarlier={props.loadScrollbackHistory} terminal={terminalInstanceRef.current} />
        ) : null}
      </div>
      <TerminalQuickKeys disabled={props.loading || status !== "connected"} onSend={sendQuickKey} />
    </div>
  );
}

function TerminalLoadingState(props: { active: boolean }) {
  if (!props.active) {
    return null;
  }
  return (
    <div className="terminal-loading-state" role="status" aria-live="polite">
      <span aria-hidden="true" />
      <strong>Loading terminal</strong>
      <small>Restoring last window...</small>
    </div>
  );
}

function MobileInteractionToggle(props: {
  mode: MobileTerminalInteractionMode;
  onModeChange: (mode: MobileTerminalInteractionMode) => void;
}) {
  const selectMode = props.mode === "select";
  return (
    <button
      className={`terminal-touch-mode ${selectMode ? "active" : ""}`}
      type="button"
      aria-pressed={selectMode}
      onClick={() => {
        if (!selectMode) {
          blurFocusedInput();
        }
        props.onModeChange(selectMode ? "input" : "select");
      }}
    >
      {selectMode ? <MousePointer2 size={14} aria-hidden="true" /> : <TextCursorInput size={14} aria-hidden="true" />}
      {selectMode ? "Scroll" : "Input"}
    </button>
  );
}

function blurFocusedInput() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function TerminalFocusHint(props: { focused: boolean; onFocus: () => void }) {
  return (
    <button
      type="button"
      className={`terminal-focus-hint ${props.focused ? "focused" : ""}`}
      aria-pressed={props.focused}
      title={props.focused ? "Terminal is focused" : "Focus the terminal with the / key"}
      onClick={props.onFocus}
    >
      {props.focused ? (
        <>
          <span className="terminal-focus-hint-dot" aria-hidden="true" />
          Focused
        </>
      ) : (
        <>
          <kbd aria-hidden="true">/</kbd>
          Focus
        </>
      )}
    </button>
  );
}

function useTerminalFocusEvents(
  terminalRef: MutableRefObject<Terminal | null>,
  ready: boolean,
  onFocusChange: (focused: boolean) => void,
) {
  useEffect(() => {
    const textarea = terminalRef.current?.textarea;
    if (!textarea) {
      return;
    }
    const handleFocus = () => onFocusChange(true);
    const handleBlur = () => onFocusChange(false);
    textarea.addEventListener("focus", handleFocus);
    textarea.addEventListener("blur", handleBlur);
    return () => {
      textarea.removeEventListener("focus", handleFocus);
      textarea.removeEventListener("blur", handleBlur);
    };
  }, [terminalRef, ready, onFocusChange]);
}

function useTerminalFocusShortcut(terminalRef: MutableRefObject<Terminal | null>) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (isEditableElement(document.activeElement)) {
        return;
      }
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }
      event.preventDefault();
      terminal.focus();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [terminalRef]);
}

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

type TerminalMountOptions = {
  terminalRef: MutableRefObject<HTMLDivElement | null>;
  terminalInstanceRef: MutableRefObject<Terminal | null>;
  socketRef: MutableRefObject<WebSocket | null>;
  handlersRef: MutableRefObject<NativeTerminalHandlers>;
  mode: MobileTerminalInteractionMode;
  setTerminalReady: (ready: boolean) => void;
};

function useTerminalMount(options: TerminalMountOptions) {
  const modeRef = useRef(options.mode);
  useEffect(() => {
    modeRef.current = options.mode;
  }, [options.mode]);

  useEffect(() => {
    if (!options.terminalRef.current) {
      return;
    }

    const terminal = createTerminal();
    const fit = mountTerminal(terminal, options.terminalRef.current);
    options.terminalInstanceRef.current = terminal;
    options.setTerminalReady(true);
    const resizeObserver = observeTerminalResize(terminal, fit, options.terminalRef.current, options.socketRef);
    const clipboardDisposable = bindTerminalClipboard(terminal, {
      onError: (message) => options.handlersRef.current.onConnectionError(message),
    });
    const inputDisposable = bindTerminalInput(terminal, options.socketRef, modeRef);
    const pasteDisposable = bindTerminalPaste({
      container: options.terminalRef.current,
      handlersRef: options.handlersRef,
      socketRef: options.socketRef,
      terminal,
    });

    return () => {
      options.socketRef.current?.close();
      options.socketRef.current = null;
      options.terminalInstanceRef.current = null;
      options.setTerminalReady(false);
      clipboardDisposable.dispose();
      inputDisposable.dispose();
      pasteDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [
    options.handlersRef,
    options.setTerminalReady,
    options.socketRef,
    options.terminalInstanceRef,
    options.terminalRef,
  ]);
}

function createTerminal() {
  return new Terminal({
    allowProposedApi: false,
    scrollback: 5000,
    cursorBlink: true,
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    theme: terminalTheme,
  });
}

function mountTerminal(terminal: Terminal, container: HTMLDivElement) {
  const fit = new FitAddon();
  terminal.loadAddon(fit);
  terminal.open(container);
  fitTerminalWhenVisible(fit, container);
  return fit;
}

function fitTerminalWhenVisible(fit: FitAddon, container: HTMLDivElement) {
  if (container.clientWidth > 0 && container.clientHeight > 0) {
    fit.fit();
    return;
  }
  window.requestAnimationFrame(() => {
    if (container.clientWidth > 0 && container.clientHeight > 0) {
      fit.fit();
    }
  });
}

function observeTerminalResize(
  terminal: Terminal,
  fit: FitAddon,
  container: HTMLDivElement,
  socketRef: MutableRefObject<WebSocket | null>,
) {
  let lastSize = terminalSize(terminal);
  const resizeObserver = new ResizeObserver(() => {
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      return;
    }
    fit.fit();
    const nextSize = terminalSize(terminal);
    if (nextSize.cols === lastSize.cols && nextSize.rows === lastSize.rows) {
      return;
    }
    lastSize = nextSize;
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      sendTerminalResize(socket, nextSize.cols, nextSize.rows);
    }
  });
  resizeObserver.observe(container);
  return resizeObserver;
}

function bindTerminalInput(
  terminal: Terminal,
  socketRef: MutableRefObject<WebSocket | null>,
  modeRef: MutableRefObject<MobileTerminalInteractionMode>,
) {
  return terminal.onData((data) => {
    if (modeRef.current === "select") {
      return;
    }
    sendTerminalInput(socketRef.current, data);
  });
}

function useSessionReset(sessionKey: string, loading: boolean, terminalRef: MutableRefObject<Terminal | null>) {
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    terminal.reset();
    if (loading) {
      return;
    }
    if (!sessionKey) {
      terminal.write("$ ");
    }
  }, [loading, sessionKey, terminalRef]);
}

function useQueuedInput(
  queuedInput: QueuedTerminalInput | null,
  socketRef: MutableRefObject<WebSocket | null>,
  status: ConnectionStatus,
  onQueuedInputSent: (inputId: number) => void,
) {
  const lastSentIdRef = useRef(0);

  useEffect(() => {
    if (!queuedInput?.data || queuedInput.id === lastSentIdRef.current) {
      return;
    }
    const socket = socketRef.current;
    if (status !== "connected" || socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    sendTerminalInput(socket, queuedInput.data, queuedInput.source ?? "composer");
    lastSentIdRef.current = queuedInput.id;
    onQueuedInputSent(queuedInput.id);
  }, [onQueuedInputSent, queuedInput, socketRef, status]);
}
