import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import "./terminal.css";

export function NativeTerminal() {
  const terminalRef = useRef<HTMLDivElement | null>(null);

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
    terminal.loadAddon(fit);
    terminal.open(terminalRef.current);
    fit.fit();
    terminal.write("$ ");

    const resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(terminalRef.current);
    const inputDisposable = terminal.onData((data) => terminal.write(data));

    return () => {
      inputDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, []);

  return <div className="terminal-shell" ref={terminalRef} aria-label="Terminal" />;
}
