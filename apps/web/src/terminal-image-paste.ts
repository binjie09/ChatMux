import { type MutableRefObject } from "react";
import { type Terminal } from "@xterm/xterm";
import { bracketedPaste, errorMessage, sendTerminalInput } from "./terminal-protocol";

export type TerminalPasteHandlers = {
  onConnectionError: (message: string) => void;
  onPasteImage?: ((file: File) => Promise<string>) | null;
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
    const file = firstPastedImage(event.clipboardData);
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

function firstPastedImage(data: DataTransfer | null) {
  const items = Array.from(data?.items ?? []);
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
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
    const imageFile = await readClipboardImage(clipboard);
    if (imageFile) {
      await pasteTerminalClipboard({ file: imageFile, text: "" }, target);
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

async function readClipboardImage(clipboard: Clipboard) {
  const items = await clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith("image/"));
    if (!imageType) {
      continue;
    }
    const blob = await item.getType(imageType);
    return new File([blob], `clipboard.${extensionForMimeType(imageType)}`, { type: imageType });
  }
  return null;
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
    await pasteTerminalImage(clipboard.file, socket, target.handlersRef);
    return;
  }
  if (clipboard.text) {
    sendTerminalInput(socket, bracketedPaste(clipboard.text));
  }
}

async function pasteTerminalImage(
  file: File,
  socket: WebSocket,
  handlersRef: MutableRefObject<TerminalPasteHandlers>,
) {
  const upload = handlersRef.current.onPasteImage;
  if (!upload) {
    handlersRef.current.onConnectionError("Terminal image paste is not available");
    return;
  }
  try {
    const remotePath = await upload(file);
    sendTerminalInput(socket, bracketedPaste(remotePath));
  } catch (error) {
    handlersRef.current.onConnectionError(errorMessage(error));
  }
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
    default:
      return "png";
  }
}

function clearKeyboardPasteFallback(timer: number) {
  window.clearTimeout(timer);
  return 0;
}
