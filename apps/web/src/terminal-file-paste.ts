import { type MutableRefObject } from "react";
import { type Terminal } from "@xterm/xterm";
import { bracketedPaste, errorMessage, sendTerminalInput } from "./terminal-protocol";

export type TerminalPasteHandlers = {
  onConnectionError: (message: string) => void;
  onPasteFile?: ((file: File) => Promise<string>) | null;
};

const keyboardPasteFallbackDelayMs = 100;

type TerminalPasteOptions = {
  container: HTMLDivElement;
  handlersRef: MutableRefObject<TerminalPasteHandlers>;
  socketRef: MutableRefObject<WebSocket | null>;
  terminal: Terminal;
};

type PasteTarget = Pick<TerminalPasteOptions, "handlersRef" | "socketRef">;

export function bindTerminalPaste(options: TerminalPasteOptions) {
  let keyboardPasteFallbackTimer = 0;
  const onPaste = (event: ClipboardEvent) => {
    keyboardPasteFallbackTimer = clearKeyboardPasteFallback(keyboardPasteFallbackTimer);
    const file = firstPastedFile(event.clipboardData);
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!file && !text) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void pasteTerminalClipboard({ file, text }, options);
  };
  options.terminal.attachCustomKeyEventHandler((event) => {
    const result = handleTerminalKeyEvent(event, () => {
      keyboardPasteFallbackTimer = clearKeyboardPasteFallback(keyboardPasteFallbackTimer);
      keyboardPasteFallbackTimer = window.setTimeout(() => {
        keyboardPasteFallbackTimer = 0;
        void pasteFromBrowserClipboard(options);
      }, keyboardPasteFallbackDelayMs);
    });
    return result;
  });
  options.container.addEventListener("paste", onPaste, true);
  return {
    dispose: () => {
      clearKeyboardPasteFallback(keyboardPasteFallbackTimer);
      options.terminal.attachCustomKeyEventHandler(() => true);
      options.container.removeEventListener("paste", onPaste, true);
    },
  };
}

function firstPastedFile(data: DataTransfer | null) {
  const items = Array.from(data?.items ?? []);
  for (const item of items) {
    if (item.kind === "file") {
      return item.getAsFile();
    }
  }
  return null;
}

function handleTerminalKeyEvent(event: KeyboardEvent, scheduleFallback: () => void) {
  if (!isKeyboardPaste(event)) {
    return true;
  }
  if (event.type === "keydown") {
    scheduleFallback();
  }
  return false;
}

function isKeyboardPaste(event: KeyboardEvent) {
  return event.key.toLowerCase() === "v" && (event.ctrlKey || event.metaKey);
}

async function pasteFromBrowserClipboard(target: PasteTarget) {
  try {
    const clipboard = navigator.clipboard;
    const file = await readClipboardFile(clipboard);
    if (file) {
      await pasteTerminalClipboard({ file, text: "" }, target);
      return;
    }
    const text = await clipboard.readText();
    if (text) {
      await pasteTerminalClipboard({ file: null, text }, target);
    }
  } catch (error) {
    target.handlersRef.current.onConnectionError(errorMessage(error));
  }
}

async function readClipboardFile(clipboard: Clipboard) {
  const items = await clipboard.read();
  for (const item of items) {
    const fileType = clipboardFileType(item);
    if (!fileType) {
      continue;
    }
    const blob = await item.getType(fileType);
    return new File([blob], clipboardFileName(fileType), { type: fileType });
  }
  return null;
}

function clipboardFileType(item: ClipboardItem) {
  const imageType = item.types.find((type) => type.startsWith("image/"));
  if (imageType) {
    return imageType;
  }
  if (item.types.some((type) => type.startsWith("text/"))) {
    return "";
  }
  return item.types.find((type) => type !== "text/plain") ?? "";
}

async function pasteTerminalClipboard(
  clipboard: { file: File | null; text: string },
  target: PasteTarget,
) {
  const socket = target.socketRef.current;
  if (socket?.readyState !== WebSocket.OPEN) {
    target.handlersRef.current.onConnectionError("Terminal is not connected");
    return;
  }
  if (clipboard.file) {
    await pasteTerminalFile(clipboard.file, socket, target.handlersRef);
    return;
  }
  if (clipboard.text) {
    sendTerminalInput(socket, bracketedPaste(clipboard.text));
  }
}

async function pasteTerminalFile(
  file: File,
  socket: WebSocket,
  handlersRef: MutableRefObject<TerminalPasteHandlers>,
) {
  const upload = handlersRef.current.onPasteFile;
  if (!upload) {
    handlersRef.current.onConnectionError("Terminal file paste is not available");
    return;
  }
  try {
    const remotePath = await upload(file);
    sendTerminalInput(socket, bracketedPaste(remotePath));
  } catch (error) {
    handlersRef.current.onConnectionError(errorMessage(error));
  }
}

function clipboardFileName(mimeType: string) {
  return `clipboard.${extensionForMimeType(mimeType)}`;
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "application/json":
      return "json";
    case "text/csv":
      return "csv";
    case "text/html":
      return "html";
    case "text/markdown":
      return "md";
    case "text/plain":
      return "txt";
    default:
      return "bin";
  }
}

function clearKeyboardPasteFallback(timer: number) {
  window.clearTimeout(timer);
  return 0;
}
