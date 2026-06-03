import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
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

export function NativeTerminal(props: NativeTerminalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const connectorRef = useRef(props.createWebSocketURL);
  const handlersRef = useRef<TerminalHandlers>(props);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const reconnecting = status === "connecting" || status === "recovering";
  const canReconnect = Boolean(props.sessionKey && props.createWebSocketURL && !reconnecting);

  useEffect(() => {
    connectorRef.current = props.createWebSocketURL;
  }, [props.createWebSocketURL]);

  useEffect(() => {
    handlersRef.current = props;
  }, [props]);

  useTerminalMount(terminalRef, terminalInstanceRef, socketRef);
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
    sendTerminalInput(socketRef.current, data);
    terminalInstanceRef.current?.focus();
  }

  return (
    <div className="terminal-shell" aria-label="Terminal">
      <div className="terminal-toolbar">
        <span className={`terminal-connection ${status}`}>{statusLabel[status]}</span>
        <button type="button" disabled={!canReconnect} onClick={reconnect}>
          <RefreshCw size={14} aria-hidden="true" />
          Reconnect
        </button>
      </div>
      <div className="terminal-screen" ref={terminalRef} />
      <TerminalQuickKeys disabled={status !== "connected"} onSend={sendQuickKey} />
    </div>
  );
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

function useTerminalMount(
  terminalRef: MutableRefObject<HTMLDivElement | null>,
  terminalInstanceRef: MutableRefObject<Terminal | null>,
  socketRef: MutableRefObject<WebSocket | null>,
) {
  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    const terminal = createTerminal();
    const fit = mountTerminal(terminal, terminalRef.current);
    terminalInstanceRef.current = terminal;
    const resizeObserver = observeTerminalResize(terminal, fit, terminalRef.current, socketRef);
    const inputDisposable = bindTerminalInput(terminal, socketRef);

    return () => {
      socketRef.current?.close();
      socketRef.current = null;
      terminalInstanceRef.current = null;
      inputDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [socketRef, terminalInstanceRef, terminalRef]);
}

function createTerminal() {
  return new Terminal({
    allowProposedApi: false,
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
  fit.fit();
  return fit;
}

function observeTerminalResize(
  terminal: Terminal,
  fit: FitAddon,
  container: HTMLDivElement,
  socketRef: MutableRefObject<WebSocket | null>,
) {
  let lastSize = terminalSize(terminal);
  const resizeObserver = new ResizeObserver(() => {
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

function bindTerminalInput(terminal: Terminal, socketRef: MutableRefObject<WebSocket | null>) {
  return terminal.onData((data) => {
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
