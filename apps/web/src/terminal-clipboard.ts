import { type IDisposable, type Terminal } from "@xterm/xterm";
import { errorMessage } from "./terminal-protocol";

type ClipboardWriter = {
  writeText: (data: string) => Promise<void>;
};

type ClipboardBindingOptions = {
  onError: (message: string) => void;
  writer?: ClipboardWriter;
};

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
  try {
    await clipboardWriter(options).writeText(decodeOsc52Clipboard(data));
  } catch (error) {
    options.onError(errorMessage(error));
  }
}

function clipboardWriter(options: ClipboardBindingOptions) {
  const writer = options.writer ?? globalThis.navigator?.clipboard;
  if (!writer?.writeText) {
    throw new Error("Browser clipboard API is not available");
  }
  return writer;
}

function decodeBase64Text(data: string) {
  try {
    const binary = atob(data);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch (error) {
    throw new Error("OSC 52 clipboard payload is not valid base64", { cause: error });
  }
}
