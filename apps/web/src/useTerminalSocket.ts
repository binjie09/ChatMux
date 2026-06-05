import { type MutableRefObject, useEffect } from "react";
import { type Terminal } from "@xterm/xterm";
import { errorMessage, sendTerminalResize, writeTerminalMessage } from "./terminal-protocol";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "recovering" | "error";

export type TerminalHandlers = {
  onConnectionClosed: () => void;
  onConnectionError: (message: string) => void;
  onConnectionReady: (status: ConnectionStatus) => void;
  onConnectionBlocked?: (message: string) => boolean;
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

type SocketOpenResult = {
  blocked: boolean;
  socket: WebSocket | null;
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
      const result = await openTerminalSocket(options, () => active, nextStatus);
      if (result.blocked) {
        return;
      }
      socket = result.socket;
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
      return { blocked: false, socket: null };
    }
    const socket = new WebSocket(socketURL);
    options.socketRef.current = socket;
    return { blocked: false, socket };
  } catch (error) {
    if (isActive()) {
      options.setStatus("error");
      const message = errorMessage(error);
      if (options.handlersRef.current.onConnectionBlocked?.(message)) {
        return { blocked: true, socket: null };
      } else {
        options.handlersRef.current.onConnectionError(message);
      }
    }
    return { blocked: false, socket: null };
  }
}

function bindTerminalSocket(input: TerminalSocketBinding) {
  input.socket.addEventListener("open", () => handleSocketOpen(input));
  input.socket.addEventListener("message", (event) => handleSocketMessage(input, event.data));
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
    input.options.handlersRef.current.onConnectionClosed();
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

function handleSocketMessage(input: SocketOpenInput, data: unknown) {
  const terminal = input.options.terminalInstanceRef.current;
  if (!terminal) {
    return;
  }
  const error = writeTerminalMessage(terminal, data);
  if (error) {
    input.options.setStatus("error");
    if (input.options.handlersRef.current.onConnectionBlocked?.(error)) {
      input.options.socketRef.current = null;
      input.socket.close();
      return;
    }
    input.options.handlersRef.current.onConnectionError(error);
  }
}
