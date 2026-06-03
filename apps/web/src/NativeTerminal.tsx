import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";

type NativeTerminalProps = {
  queuedInput: QueuedTerminalInput | null;
  webSocketURL: string;
};

export type QueuedTerminalInput = {
  id: number;
  text: string;
};

type TerminalMessage = {
  type: "output" | "error";
  data?: string;
};

export function NativeTerminal({ queuedInput, webSocketURL }: NativeTerminalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
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
    const fit = new FitAddon();
    terminalInstanceRef.current = terminal;
    terminal.loadAddon(fit);
    terminal.open(terminalRef.current);
    fit.fit();
    if (!webSocketURL) {
      terminal.write("$ ");
    }

    const socket = webSocketURL ? new WebSocket(webSocketURL) : null;
    socketRef.current = socket;
    socket?.addEventListener("open", () => sendResize(socket, terminal.cols, terminal.rows));
    socket?.addEventListener("message", (event) => writeSocketMessage(terminal, event.data));
    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      if (socket?.readyState === WebSocket.OPEN) {
        sendResize(socket, terminal.cols, terminal.rows);
      }
    });
    resizeObserver.observe(terminalRef.current);
    const inputDisposable = terminal.onData((data) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
        return;
      }
      terminal.write(data);
    });

    return () => {
      socket?.close();
      socketRef.current = null;
      terminalInstanceRef.current = null;
      inputDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [webSocketURL]);

  useEffect(() => {
    if (!queuedInput?.text) {
      return;
    }
    sendInput(socketRef.current, terminalInstanceRef.current, queuedInput.text + "\n");
  }, [queuedInput]);

  return <div className="terminal-shell" ref={terminalRef} aria-label="Terminal" />;
}

function sendResize(socket: WebSocket, cols: number, rows: number) {
  socket.send(JSON.stringify({ type: "resize", cols, rows }));
}

function writeSocketMessage(terminal: Terminal, data: string) {
  const message = JSON.parse(data) as TerminalMessage;
  if (message.data) {
    terminal.write(message.data);
  }
}

function sendInput(socket: WebSocket | null, terminal: Terminal | null, data: string) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "input", data }));
    return;
  }
  terminal?.write(data);
}
