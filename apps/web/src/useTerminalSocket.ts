import { type MutableRefObject, useEffect } from "react";
import { type Terminal } from "@xterm/xterm";
import { errorMessage, sendTerminalResize, writeTerminalMessage } from "./terminal-protocol";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "recovering" | "error";

export type TerminalHandlers = {
  onConnectionError: (message: string) => void;
  onConnectionReady: (status: ConnectionStatus) => void;
};

type TerminalSocketOptions = {
  connectorRef: MutableRefObject<((status: ConnectionStatus) => Promise<string>) | null>;
  handlersRef: MutableRefObject<TerminalHandlers>;
  reconnectAttempt: number;
  sessionKey: string;
  setStatus: (status: ConnectionStatus) => void;
  socketRef: MutableRefObject<WebSocket | null>;
  terminalInstanceRef: MutableRefObject<Terminal | null>;
};

type TerminalSocketBinding = {
  connect: (status: ConnectionStatus) => Promise<void>;
  isActive: () => boolean;
  options: TerminalSocketOptions;
  readyStatus: ConnectionStatus;
  setReconnectTimer: (timer: number) => void;
  socket: WebSocket;
};

type SocketOpenInput = Pick<TerminalSocketBinding, "isActive" | "options" | "readyStatus" | "socket">;

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
        bindTerminalSocket({
          connect,
          isActive: () => active,
          options,
          readyStatus: nextStatus,
          setReconnectTimer: (timer) => {
            reconnectTimer = timer;
          },
          socket,
        });
        return;
      }
      reconnectTimer = scheduleReconnect(() => active, connect);
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

function scheduleReconnect(
  isActive: () => boolean,
  connect: (status: ConnectionStatus) => Promise<void>,
) {
  if (!isActive()) {
    return 0;
  }
  return window.setTimeout(() => void connect("recovering"), reconnectDelayMs);
}

async function openTerminalSocket(
  options: TerminalSocketOptions,
  isActive: () => boolean,
  nextStatus: ConnectionStatus,
) {
  options.setStatus(nextStatus);
  try {
    const socketURL = await options.connectorRef.current?.(nextStatus);
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

function bindTerminalSocket(input: TerminalSocketBinding) {
  input.socket.addEventListener("open", () => handleSocketOpen(input));
  input.socket.addEventListener("message", (event) => handleSocketMessage(input.options, event.data));
  input.socket.addEventListener("error", () => {
    if (input.isActive() && input.options.socketRef.current === input.socket) {
      input.options.setStatus("recovering");
    }
  });
  input.socket.addEventListener("close", () => {
    if (!input.isActive() || input.options.socketRef.current !== input.socket) {
      return;
    }
    input.options.socketRef.current = null;
    input.options.setStatus("recovering");
    input.setReconnectTimer(scheduleReconnect(input.isActive, input.connect));
  });
}

function handleSocketOpen(input: SocketOpenInput) {
  if (!input.isActive() || input.options.socketRef.current !== input.socket) {
    return;
  }
  input.options.setStatus("connected");
  input.options.handlersRef.current.onConnectionReady(input.readyStatus);
  const terminal = input.options.terminalInstanceRef.current;
  if (terminal) {
    sendTerminalResize(input.socket, terminal.cols, terminal.rows);
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
