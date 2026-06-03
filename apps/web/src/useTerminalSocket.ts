import { type MutableRefObject, useEffect } from "react";
import { type Terminal } from "@xterm/xterm";
import { errorMessage, sendTerminalResize, writeTerminalMessage } from "./terminal-protocol";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "recovering" | "error";

export type TerminalHandlers = {
  onConnectionError: (message: string) => void;
  onConnectionReady: () => void;
};

type TerminalSocketOptions = {
  connectorRef: MutableRefObject<(() => Promise<string>) | null>;
  handlersRef: MutableRefObject<TerminalHandlers>;
  reconnectAttempt: number;
  sessionKey: string;
  setStatus: (status: ConnectionStatus) => void;
  socketRef: MutableRefObject<WebSocket | null>;
  terminalInstanceRef: MutableRefObject<Terminal | null>;
};

const reconnectDelayMs = 1200;

export function useTerminalSocket(options: TerminalSocketOptions) {
  useEffect(() => {
    if (!options.sessionKey || !options.connectorRef.current) {
      options.setStatus("idle");
      return;
    }

    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    const connect = async (nextStatus: ConnectionStatus) => {
      socket = await openTerminalSocket(options, () => active, nextStatus);
      if (socket) {
        bindTerminalSocket(options, socket, () => active, connect, (timer) => {
          reconnectTimer = timer;
        });
      }
    };

    void connect("connecting");
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
      if (options.socketRef.current === socket) {
        options.socketRef.current = null;
      }
    };
  }, [options.reconnectAttempt, options.sessionKey]);
}

async function openTerminalSocket(
  options: TerminalSocketOptions,
  isActive: () => boolean,
  nextStatus: ConnectionStatus,
) {
  options.setStatus(nextStatus);
  try {
    const socketURL = await options.connectorRef.current?.();
    if (!isActive() || !socketURL) {
      return null;
    }
    const socket = new WebSocket(socketURL);
    options.socketRef.current = socket;
    return socket;
  } catch (error) {
    if (isActive()) {
      options.setStatus("error");
      options.handlersRef.current.onConnectionError(errorMessage(error));
    }
    return null;
  }
}

function bindTerminalSocket(
  options: TerminalSocketOptions,
  socket: WebSocket,
  isActive: () => boolean,
  connect: (status: ConnectionStatus) => Promise<void>,
  setReconnectTimer: (timer: number) => void,
) {
  socket.addEventListener("open", () => handleSocketOpen(options, socket, isActive));
  socket.addEventListener("message", (event) => handleSocketMessage(options, event.data));
  socket.addEventListener("error", () => {
    if (isActive() && options.socketRef.current === socket) {
      options.setStatus("recovering");
    }
  });
  socket.addEventListener("close", () => {
    if (!isActive() || options.socketRef.current !== socket) {
      return;
    }
    options.socketRef.current = null;
    options.setStatus("recovering");
    setReconnectTimer(window.setTimeout(() => void connect("recovering"), reconnectDelayMs));
  });
}

function handleSocketOpen(options: TerminalSocketOptions, socket: WebSocket, isActive: () => boolean) {
  if (!isActive() || options.socketRef.current !== socket) {
    return;
  }
  options.setStatus("connected");
  options.handlersRef.current.onConnectionReady();
  const terminal = options.terminalInstanceRef.current;
  if (terminal) {
    sendTerminalResize(socket, terminal.cols, terminal.rows);
  }
}

function handleSocketMessage(options: TerminalSocketOptions, data: unknown) {
  const terminal = options.terminalInstanceRef.current;
  if (!terminal) {
    return;
  }
  const error = writeTerminalMessage(terminal, data);
  if (error) {
    options.setStatus("error");
    options.handlersRef.current.onConnectionError(error);
  }
}
