import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { MousePointer2, RefreshCw, TextCursorInput } from "lucide-react";
import { TerminalQuickKeys } from "./TerminalQuickKeys";
import { TerminalScrollbackOverlay } from "./TerminalScrollbackOverlay";
import { bindTerminalClipboard } from "./terminal-clipboard";
import { bindTerminalPaste, type TerminalPasteHandlers } from "./terminal-image-paste";
import { sendTerminalInput, sendTerminalResize, terminalSize } from "./terminal-protocol";
import { terminalTheme } from "./terminal-theme";
import { useExternalReconnect } from "./useExternalReconnect";
import { type ConnectionStatus, type TerminalHandlers, useTerminalSocket } from "./useTerminalSocket";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";

type NativeTerminalProps = {
  createWebSocketURL: ((status: ConnectionStatus) => Promise<string>) | null;
  loadScrollbackHistory?: ((lines: number) => Promise<string>) | null;
  onConnectionClosed: () => void;
  onConnectionBlocked?: (message: string) => boolean;
  onConnectionError: (message: string) => void;
  onConnectionReady: (status: ConnectionStatus) => void;
  onPasteImage?: ((file: File) => Promise<string>) | null;
  queuedInput: QueuedTerminalInput | null;
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
  const reconnecting = status === "connecting" || status === "recovering";
  const canReconnect = Boolean(props.sessionKey && props.createWebSocketURL && !reconnecting);

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
  useSessionReset(props.sessionKey, terminalInstanceRef);
  useTerminalSocket({
    connectorRef,
    handlersRef,
    reconnectAttempt,
    sessionKey: props.sessionKey,
    setStatus,
    socketRef,
    terminalInstanceRef,
  });
  useQueuedInput(props.queuedInput, socketRef);
  useExternalReconnect(props.reconnectSignal, reconnect);

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

  return (
    <div className={`terminal-shell terminal-${mobileInteractionMode}-mode`} aria-label="Terminal">
      <div className="terminal-toolbar">
        <span className={`terminal-connection ${status}`}>{statusLabel[status]}</span>
        <div className="terminal-toolbar-actions">
          <MobileInteractionToggle mode={mobileInteractionMode} onModeChange={setMobileInteractionMode} />
          <button type="button" disabled={!canReconnect} onClick={reconnect}>
            <RefreshCw size={14} aria-hidden="true" />
            Reconnect
          </button>
        </div>
      </div>
      <div className="terminal-screen" ref={terminalRef}>
        {mobileInteractionMode === "select" && terminalReady && terminalInstanceRef.current ? (
          <TerminalScrollbackOverlay loadEarlier={props.loadScrollbackHistory} terminal={terminalInstanceRef.current} />
        ) : null}
      </div>
      <TerminalQuickKeys disabled={status !== "connected"} onSend={sendQuickKey} />
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

function useSessionReset(sessionKey: string, terminalRef: MutableRefObject<Terminal | null>) {
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    terminal.reset();
    if (!sessionKey) {
      terminal.write("$ ");
    }
  }, [sessionKey, terminalRef]);
}

function useQueuedInput(queuedInput: QueuedTerminalInput | null, socketRef: MutableRefObject<WebSocket | null>) {
  useEffect(() => {
    if (!queuedInput?.data) {
      return;
    }
    sendTerminalInput(socketRef.current, queuedInput.data, queuedInput.source ?? "composer");
  }, [queuedInput, socketRef]);
}
