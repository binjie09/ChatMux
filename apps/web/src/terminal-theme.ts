import { type ITheme } from "@xterm/xterm";
import { type Theme } from "./useTheme";

const darkTerminalTheme = {
  background: "#101713",
  cursor: "#8fd5b2",
  foreground: "#e6ece8",
  selectionBackground: "#355244",
} satisfies ITheme;

const lightTerminalTheme = {
  background: "#fffdf8",
  cursor: "#2c8f5a",
  cursorAccent: "#fffdf8",
  foreground: "#25332b",
  selectionBackground: "#c9e8d7",
  black: "#25332b",
  red: "#a63d38",
  green: "#286f4a",
  yellow: "#7a5b12",
  blue: "#2c6192",
  magenta: "#6d4b82",
  cyan: "#18706f",
  white: "#647269",
  brightBlack: "#526158",
  brightRed: "#c84b45",
  brightGreen: "#2f8053",
  brightYellow: "#947019",
  brightBlue: "#3977ad",
  brightMagenta: "#865fa0",
  brightCyan: "#207f7e",
  brightWhite: "#344139",
} satisfies ITheme;

const terminalThemes: Record<Theme, ITheme> = {
  dark: darkTerminalTheme,
  light: lightTerminalTheme,
};

export function terminalTheme(theme: Theme): ITheme {
  return terminalThemes[theme];
}
