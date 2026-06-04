import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { ArrowDown, ArrowUp, MousePointer2, RefreshCw, TextCursorInput } from "lucide-react";
import { bindTerminalClipboard } from "./terminal-clipboard";
import { sendTerminalInput, sendTerminalResize, terminalSize } from "./terminal-protocol";
import { type ConnectionStatus, type TerminalHandlers, useTerminalSocket } from "./useTerminalSocket";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";

type NativeTerminalProps = {
  createWebSocketURL: ((status: ConnectionStatus) => Promise<string>) | null;
  onConnectionError: (message: string) => void;
  onConnectionReady: (status: ConnectionStatus) => void;
  queuedInput: QueuedTerminalInput | null;
  sessionKey: string;
};

export type QueuedTerminalInput = {
  data: string;
  id: number;
};

const statusLabel: Record<ConnectionStatus, string> = {
  idle: "Idle",
  connecting: "Connecting",
  connected: "Live",
  recovering: "Recovering",
  error: "Disconnected",
};

const terminalQuickKeys = [
  { data: "\x1b", label: "Esc" },
  { data: "\t", label: "Tab" },
  { data: "\x03", label: "^C" },
  { data: "\x04", label: "^D" },
  { data: "\x1b[A", icon: "up", label: "Up" },
  { data: "\x1b[B", icon: "down", label: "Down" },
] as const;

type MobileTerminalInteractionMode = "input" | "select";

export function NativeTerminal(props: NativeTerminalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const scrollbackRef = useRef("");
  const connectorRef = useRef(props.createWebSocketURL);
  const handlersRef = useRef<TerminalHandlers>(props);
  const [scrollbackText, setScrollbackText] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [mobileInteractionMode, setMobileInteractionMode] = useState<MobileTerminalInteractionMode>("input");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const reconnecting = status === "connecting" || status === "recovering";
  const canReconnect = Boolean(props.sessionKey && props.createWebSocketURL && !reconnecting);

  useEffect(() => {
    connectorRef.current = props.createWebSocketURL;
  }, [props.createWebSocketURL]);

  useEffect(() => {
    handlersRef.current = {
      ...props,
      onTerminalOutput: appendScrollback,
    };
  }, [props]);

  useTerminalMount({
    handlersRef,
    mode: mobileInteractionMode,
    scrollbackRef,
    setScrollbackText,
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

  function appendScrollback(data: string) {
    const nextText = trimScrollback(scrollbackRef.current + data);
    scrollbackRef.current = nextText;
    setScrollbackText(nextText);
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
        {mobileInteractionMode === "select" ? <TerminalScrollbackOverlay text={scrollbackText} /> : null}
      </div>
      <TerminalQuickKeys disabled={status !== "connected"} onSend={sendQuickKey} />
    </div>
  );
}

function TerminalScrollbackOverlay({ text }: { text: string }) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }
    overlay.scrollTop = overlay.scrollHeight;
  }, []);

  return (
    <div className="terminal-scrollback-overlay" ref={overlayRef} aria-label="Scrollable terminal output">
      <pre>{text || "No terminal output yet."}</pre>
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

function TerminalQuickKeys(props: { disabled: boolean; onSend: (data: string) => void }) {
  return (
    <div className="terminal-quick-keys" aria-label="Terminal quick keys">
      {terminalQuickKeys.map((key) => (
        <button
          key={key.label}
          disabled={props.disabled}
          type="button"
          aria-label={`Send ${key.label}`}
          onClick={() => props.onSend(key.data)}
        >
          {quickKeyContent(key)}
        </button>
      ))}
    </div>
  );
}

function quickKeyContent(key: (typeof terminalQuickKeys)[number]) {
  if (!("icon" in key)) {
    return key.label;
  }
  if (key.icon === "up") {
    return <ArrowUp size={15} aria-hidden="true" />;
  }
  return <ArrowDown size={15} aria-hidden="true" />;
}

type TerminalMountOptions = {
  terminalRef: MutableRefObject<HTMLDivElement | null>;
  terminalInstanceRef: MutableRefObject<Terminal | null>;
  socketRef: MutableRefObject<WebSocket | null>;
  handlersRef: MutableRefObject<TerminalHandlers>;
  mode: MobileTerminalInteractionMode;
  scrollbackRef: MutableRefObject<string>;
  setScrollbackText: (text: string) => void;
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
    const resizeObserver = observeTerminalResize(terminal, fit, options.terminalRef.current, options.socketRef);
    const clipboardDisposable = bindTerminalClipboard(terminal, {
      onError: (message) => options.handlersRef.current.onConnectionError(message),
    });
    const inputDisposable = bindTerminalInput(terminal, options.socketRef, modeRef);

    return () => {
      options.socketRef.current?.close();
      options.socketRef.current = null;
      options.terminalInstanceRef.current = null;
      options.scrollbackRef.current = "";
      options.setScrollbackText("");
      clipboardDisposable.dispose();
      inputDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [
    options.handlersRef,
    options.scrollbackRef,
    options.setScrollbackText,
    options.socketRef,
    options.terminalInstanceRef,
    options.terminalRef,
  ]);
}

function trimScrollback(text: string) {
  const maxLength = 120_000;
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(text.length - maxLength);
}

function createTerminal() {
  return new Terminal({
    allowProposedApi: false,
    scrollback: 5000,
    cursorBlink: true,
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 13,
    theme: {
      background: "#101713",
      cursor: "#8fd5b2",
      foreground: "#e6ece8",
      selectionBackground: "#355244",
    },
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
    sendTerminalInput(socketRef.current, queuedInput.data, "composer");
  }, [queuedInput, socketRef]);
}
