import { type IDisposable, type Terminal } from "@xterm/xterm";
import { errorMessage } from "./terminal-protocol";

type ClipboardWriter = {
  writeText: (data: string) => Promise<void>;
};

type ClipboardBindingOptions = {
  onError: (message: string) => void;
  onCopyRequest?: (data: string) => void;
  document?: Document;
  writer?: ClipboardWriter;
};

type ClipboardWriteOptions = Pick<ClipboardBindingOptions, "document" | "writer">;

const osc52SelectionSeparator = ";";

export function bindTerminalClipboard(terminal: Terminal, options: ClipboardBindingOptions): IDisposable {
  return terminal.parser.registerOscHandler(52, (data) => {
    void writeOsc52Clipboard(data, options);
    return true;
  });
}

export function decodeOsc52Clipboard(data: string) {
  const separatorIndex = data.indexOf(osc52SelectionSeparator);
  if (separatorIndex < 0) {
    throw new Error("OSC 52 clipboard payload is invalid");
  }
  const encoded = data.slice(separatorIndex + 1);
  if (encoded === "?") {
    throw new Error("OSC 52 clipboard read requests are not supported");
  }
  return decodeBase64Text(encoded);
}

async function writeOsc52Clipboard(data: string, options: ClipboardBindingOptions) {
  let decoded: string;
  try {
    decoded = decodeOsc52Clipboard(data);
  } catch (error) {
    options.onError(errorMessage(error));
    return;
  }
  try {
    await writeTerminalClipboardText(decoded, options);
  } catch (error) {
    if (options.onCopyRequest) {
      options.onCopyRequest(decoded);
      return;
    }
    options.onError(errorMessage(error));
  }
}

export async function writeTerminalClipboardText(data: string, options: ClipboardWriteOptions = {}) {
  const writer = options.writer ?? browserClipboardWriter();
  if (writer) {
    await writer.writeText(data);
    return;
  }
  copyTextWithDocument(options.document ?? globalThis.document, data);
}

function browserClipboardWriter() {
  const writer = globalThis.navigator?.clipboard as Partial<ClipboardWriter> | undefined;
  return typeof writer?.writeText === "function" ? (writer as ClipboardWriter) : undefined;
}

function copyTextWithDocument(document: Document | undefined, data: string) {
  if (!document?.body || typeof document.execCommand !== "function") {
    throw new Error("Browser clipboard API is not available");
  }
  const activeElement = document.activeElement;
  const selection = document.getSelection();
  const ranges = selection ? selectedRanges(selection) : [];
  const textarea = createCopyTextarea(document, data);
  document.body.appendChild(textarea);
  try {
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    if (!document.execCommand("copy")) {
      throw new Error("Browser rejected the clipboard write");
    }
  } finally {
    textarea.remove();
    restoreSelection(selection, ranges);
    restoreFocus(activeElement);
  }
}

function createCopyTextarea(document: Document, data: string) {
  const textarea = document.createElement("textarea");
  textarea.value = data;
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.setAttribute("aria-hidden", "true");
  Object.assign(textarea.style, {
    left: "-9999px",
    opacity: "0",
    position: "fixed",
    top: "0",
  });
  return textarea;
}

function selectedRanges(selection: Selection) {
  return Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index));
}

function restoreSelection(selection: Selection | null, ranges: Range[]) {
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  ranges.forEach((range) => selection.addRange(range));
}

function restoreFocus(element: Element | null) {
  if (element instanceof HTMLElement) {
    element.focus({ preventScroll: true });
  }
}

function decodeBase64Text(data: string) {
  try {
    const binary = atob(data);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch (error) {
    throw new Error("OSC 52 clipboard payload is not valid base64", { cause: error });
  }
}
