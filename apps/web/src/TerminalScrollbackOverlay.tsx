import { type CSSProperties, useEffect, useRef, useState } from "react";
import { type IBufferCell, type Terminal } from "@xterm/xterm";
import { terminalColors, type TerminalColors } from "./terminal-scrollback-colors";
import "./terminal-scrollback.css";

type TerminalScrollbackOverlayProps = {
  terminal: Terminal;
};

type ScrollbackLine = {
  key: number;
  segments: ScrollbackSegment[];
};

type ScrollbackSegment = {
  key: number;
  style: CSSProperties;
  text: string;
};

type CellStyle = {
  backgroundColor?: string;
  color?: string;
  fontStyle?: CSSProperties["fontStyle"];
  fontWeight?: CSSProperties["fontWeight"];
  opacity?: number;
  textDecorationLine?: CSSProperties["textDecorationLine"];
};

export function TerminalScrollbackOverlay({ terminal }: TerminalScrollbackOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [lines, setLines] = useState(() => terminalScrollbackLines(terminal));

  useEffect(() => {
    terminal.blur();
    const update = () => setLines(terminalScrollbackLines(terminal));
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
  }, []);

  return (
    <div className="terminal-scrollback-overlay" ref={overlayRef} aria-label="Scrollable terminal output">
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

function terminalScrollbackLines(terminal: Terminal) {
  const buffer = terminal.buffer.active;
  const colors = terminalColors(terminal.options.theme);
  const lines: ScrollbackLine[] = [];

  for (let y = 0; y < buffer.length; y += 1) {
    const line = buffer.getLine(y);
    if (!line) {
      continue;
    }
    lines.push({
      key: y,
      segments: lineSegments(line, terminal.cols, colors),
    });
  }

  return trimTrailingBlankLines(lines);
}

function lineSegments(
  line: NonNullable<ReturnType<Terminal["buffer"]["active"]["getLine"]>>,
  cols: number,
  colors: TerminalColors,
) {
  const cell = line.getCell(0);
  if (!cell) {
    return blankSegment();
  }

  const segments: ScrollbackSegment[] = [];
  const scratchCell = cell;
  let currentStyle: CellStyle | null = null;
  let currentText = "";
  const endColumn = trimmedLineEnd(line, cols);

  for (let x = 0; x < endColumn; x += 1) {
    const currentCell = line.getCell(x, scratchCell);
    if (!currentCell || currentCell.getWidth() === 0) {
      continue;
    }
    const text = currentCell.isInvisible() ? " " : currentCell.getChars() || " ";
    const style = cellStyle(currentCell, colors);
    if (currentStyle && sameCellStyle(currentStyle, style)) {
      currentText += text;
      continue;
    }
    pushSegment(segments, currentText, currentStyle);
    currentText = text;
    currentStyle = style;
  }

  pushSegment(segments, currentText, currentStyle);
  return segments.length ? segments : blankSegment();
}

function trimmedLineEnd(
  line: NonNullable<ReturnType<Terminal["buffer"]["active"]["getLine"]>>,
  cols: number,
) {
  const lineLength = Math.min(line.length, cols);
  for (let x = lineLength - 1; x >= 0; x -= 1) {
    const cell = line.getCell(x);
    if (cell?.getChars()) {
      return x + 1;
    }
  }
  return 0;
}

function pushSegment(segments: ScrollbackSegment[], text: string, style: CellStyle | null) {
  if (!text) {
    return;
  }
  segments.push({
    key: segments.length,
    style: style || {},
    text,
  });
}

function blankSegment() {
  return [{ key: 0, style: {}, text: "" }];
}

function trimTrailingBlankLines(lines: ScrollbackLine[]) {
  let end = lines.length;
  while (end > 0 && blankLine(lines[end - 1])) {
    end -= 1;
  }
  return lines.slice(0, end);
}

function blankLine(line: ScrollbackLine) {
  return line.segments.every((segment) => segment.text.trim() === "");
}

function sameCellStyle(a: CellStyle, b: CellStyle) {
  return (
    a.backgroundColor === b.backgroundColor &&
    a.color === b.color &&
    a.fontStyle === b.fontStyle &&
    a.fontWeight === b.fontWeight &&
    a.opacity === b.opacity &&
    a.textDecorationLine === b.textDecorationLine
  );
}

function cellStyle(cell: IBufferCell, colors: TerminalColors): CellStyle {
  const style: CellStyle = {};
  const inverse = Boolean(cell.isInverse());
  const foreground = cellColor(cell, "foreground", colors);
  const background = cellColor(cell, "background", colors);

  style.color = inverse ? background || colors.background : foreground || colors.foreground;
  if (inverse || background) {
    style.backgroundColor = inverse ? foreground || colors.foreground : background;
  }
  if (cell.isBold()) {
    style.fontWeight = 700;
  }
  if (cell.isItalic()) {
    style.fontStyle = "italic";
  }
  if (cell.isDim()) {
    style.opacity = 0.6;
  }

  const decorations = textDecorations(cell);
  if (decorations) {
    style.textDecorationLine = decorations;
  }
  return style;
}

function textDecorations(cell: IBufferCell) {
  const decorations: string[] = [];
  if (cell.isUnderline()) {
    decorations.push("underline");
  }
  if (cell.isStrikethrough()) {
    decorations.push("line-through");
  }
  if (cell.isOverline()) {
    decorations.push("overline");
  }
  return decorations.join(" ") || undefined;
}

function cellColor(cell: IBufferCell, target: "background" | "foreground", colors: TerminalColors) {
  if (target === "foreground") {
    return foregroundColor(cell, colors.ansi);
  }
  return colorFromMode(cell.isBgRGB(), cell.isBgPalette(), cell.getBgColor(), colors.ansi);
}

function foregroundColor(cell: IBufferCell, ansi: string[]) {
  const color = cell.getFgColor();
  if (cell.isFgPalette() && cell.isBold() && color < 8) {
    return ansi[color + 8];
  }
  return colorFromMode(cell.isFgRGB(), cell.isFgPalette(), color, ansi);
}

function colorFromMode(rgb: boolean, palette: boolean, value: number, ansi: string[]) {
  if (rgb) {
    return rgbHex(value);
  }
  if (palette) {
    return ansi[value];
  }
  return undefined;
}

function rgbHex(value: number) {
  return `#${(value >>> 0).toString(16).padStart(6, "0")}`;
}
