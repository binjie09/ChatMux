import { type ITheme } from "@xterm/xterm";
import { type Theme } from "./useTheme";

/* Dark terminal: deep neutral charcoal shell, emerald cursor. */
const darkTerminalTheme = {
  background: "#0b0f0d",
  cursor: "#34d399",
  foreground: "#d5e0da",
  selectionBackground: "#1f3d32",
} satisfies ITheme;

/* Light terminal: clean off-white shell, dark ink text, emerald cursor.
   ANSI accents are tuned for legibility on a light background. */
const lightTerminalTheme = {
  background: "#f7f8f6",
  cursor: "#059669",
  cursorAccent: "#f7f8f6",
  foreground: "#1c2420",
  selectionBackground: "#cdebdd",
  black: "#1c2420",
  red: "#b91c1c",
  green: "#047857",
  yellow: "#a16207",
  blue: "#1d4ed8",
  magenta: "#7c3aed",
  cyan: "#0e7490",
  white: "#5f6a66",
  brightBlack: "#4b5563",
  brightRed: "#dc2626",
  brightGreen: "#059669",
  brightYellow: "#ca8a04",
  brightBlue: "#2563eb",
  brightMagenta: "#8b5cf6",
  brightCyan: "#0891b2",
  brightWhite: "#111827",
} satisfies ITheme;

const terminalThemes: Record<Theme, ITheme> = {
  dark: darkTerminalTheme,
  light: lightTerminalTheme,
};

export function terminalTheme(theme: Theme): ITheme {
  return terminalThemes[theme];
}
