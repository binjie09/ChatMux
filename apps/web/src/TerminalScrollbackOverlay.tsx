import { useEffect, useRef, useState } from "react";
import { type Terminal } from "@xterm/xterm";
import { terminalScrollbackLines, terminalScrollbackLinesFromText, type ScrollbackLine } from "./terminal-scrollback-lines";
import "./terminal-scrollback.css";

type TerminalScrollbackOverlayProps = {
  loadEarlier?: ((lines: number) => Promise<string>) | null;
  terminal: Terminal;
};

const initialHistoryLines = 5000;
const historyLineStep = 5000;
const topLoadThresholdPx = 48;

export function TerminalScrollbackOverlay({ loadEarlier, terminal }: TerminalScrollbackOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const exhaustedRef = useRef(false);
  const historyTextRef = useRef("");
  const loadingRef = useRef(false);
  const loadedHistoryLinesRef = useRef(0);
  const usingHistoryRef = useRef(false);
  const [lines, setLines] = useState(() => terminalScrollbackLines(terminal));
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    terminal.blur();
    const update = () => {
      if (!usingHistoryRef.current) {
        setLines(terminalScrollbackLines(terminal));
      }
    };
    update();
    const disposable = terminal.onWriteParsed(update);
    return () => disposable.dispose();
  }, [terminal]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) {
      return;
    }
    overlay.scrollTop = overlay.scrollHeight;
    if (overlay.scrollTop <= topLoadThresholdPx) {
      void loadEarlierHistory();
    }
  }, []);

  async function loadEarlierHistory() {
    const overlay = overlayRef.current;
    if (!overlay || !loadEarlier || loadingRef.current || exhaustedRef.current) {
      return;
    }
    const nextLineCount = nextHistoryLineCount(loadedHistoryLinesRef.current);
    loadingRef.current = true;
    setLoading(true);
    const previousScrollHeight = overlay.scrollHeight;
    const previousScrollTop = overlay.scrollTop;
    try {
      const historyText = await loadEarlier(nextLineCount);
      exhaustedRef.current = loadedHistoryLinesRef.current > 0 && historyText === historyTextRef.current;
      historyTextRef.current = historyText;
      const parsedLines = await terminalScrollbackLinesFromText(historyText, terminal, nextLineCount);
      loadedHistoryLinesRef.current = nextLineCount;
      usingHistoryRef.current = true;
      setLoadError("");
      setLines(parsedLines);
      window.requestAnimationFrame(() => {
        overlay.scrollTop = overlay.scrollHeight - previousScrollHeight + previousScrollTop;
        loadingRef.current = false;
        setLoading(false);
        if (overlay.scrollTop <= topLoadThresholdPx && !exhaustedRef.current) {
          void loadEarlierHistory();
        }
      });
    } catch (error) {
      loadingRef.current = false;
      setLoading(false);
      setLoadError(errorMessage(error));
    }
  }

  function handleScroll() {
    const overlay = overlayRef.current;
    if (overlay && overlay.scrollTop <= topLoadThresholdPx) {
      void loadEarlierHistory();
    }
  }

  return (
    <div
      className="terminal-scrollback-overlay"
      ref={overlayRef}
      aria-label="Scrollable terminal output"
      onScroll={handleScroll}
      onTouchEnd={handleScroll}
      onWheel={handleScroll}
    >
      {loading ? <div className="terminal-scrollback-loading">Loading earlier output...</div> : null}
      {loadError ? <div className="terminal-scrollback-error">{loadError}</div> : null}
      {lines.length ? lines.map((line) => <ScrollbackRow key={line.key} line={line} />) : <div>No terminal output yet.</div>}
    </div>
  );
}

function ScrollbackRow({ line }: { line: ScrollbackLine }) {
  return (
    <div className="terminal-scrollback-row">
      {line.segments.map((segment) => (
        <span key={segment.key} style={segment.style}>
          {segment.text}
        </span>
      ))}
    </div>
  );
}

function nextHistoryLineCount(current: number) {
  if (current <= 0) {
    return initialHistoryLines;
  }
  return current + historyLineStep;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
