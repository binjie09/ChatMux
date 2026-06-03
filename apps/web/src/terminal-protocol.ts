import { type Terminal } from "@xterm/xterm";

type TerminalMessage = {
  type: "output" | "error";
  data?: string;
};

export type TerminalInputSource = "composer" | "terminal";

export function sendTerminalInput(socket: WebSocket | null, data: string, source: TerminalInputSource = "terminal") {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "input", data, source }));
  }
}

export function sendTerminalResize(socket: WebSocket, cols: number, rows: number) {
  socket.send(JSON.stringify({ type: "resize", cols, rows }));
}

export function terminalSize(terminal: Terminal) {
  return { cols: terminal.cols, rows: terminal.rows };
}

export function writeTerminalMessage(terminal: Terminal, data: unknown) {
  if (typeof data !== "string") {
    return "Terminal message must be text";
  }
  const message = parseTerminalMessage(data);
  if (typeof message === "string") {
    return message;
  }
  if (message.type === "error") {
    return message.data || "Terminal stream failed";
  }
  if (message.type === "output" && message.data) {
    terminal.write(message.data);
  }
  return "";
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function parseTerminalMessage(data: string) {
  try {
    return JSON.parse(data) as TerminalMessage;
  } catch (error) {
    return errorMessage(error);
  }
}
