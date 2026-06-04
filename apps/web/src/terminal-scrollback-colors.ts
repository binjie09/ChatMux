import { type ITheme } from "@xterm/xterm";

export type TerminalColors = {
  ansi: string[];
  background: string;
  foreground: string;
};

const defaultAnsiColors = [
  "#2e3436",
  "#cc0000",
  "#4e9a06",
  "#c4a000",
  "#3465a4",
  "#75507b",
  "#06989a",
  "#d3d7cf",
  "#555753",
  "#ef2929",
  "#8ae234",
  "#fce94f",
  "#729fcf",
  "#ad7fa8",
  "#34e2e2",
  "#eeeeec",
] as const;

const ansiThemeKeys = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const satisfies readonly (keyof ITheme)[];

export function terminalColors(theme: ITheme | undefined): TerminalColors {
  const ansi = defaultAnsiColors.map((color, index) => theme?.[ansiThemeKeys[index]] || color);
  if (theme?.extendedAnsi) {
    ansi.push(...theme.extendedAnsi);
  }
  while (ansi.length < 256) {
    ansi.push(extendedAnsiColor(ansi.length));
  }
  return {
    ansi,
    background: theme?.background || "#000000",
    foreground: theme?.foreground || "#ffffff",
  };
}

function extendedAnsiColor(index: number) {
  if (index >= 16 && index <= 231) {
    return colorCubeAnsi(index - 16);
  }
  if (index >= 232 && index <= 255) {
    const channel = 8 + (index - 232) * 10;
    return rgbFromChannels(channel, channel, channel);
  }
  return defaultAnsiColors[index % defaultAnsiColors.length];
}

function colorCubeAnsi(index: number) {
  const values = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff];
  const red = values[Math.floor(index / 36) % 6];
  const green = values[Math.floor(index / 6) % 6];
  const blue = values[index % 6];
  return rgbFromChannels(red, green, blue);
}

function rgbFromChannels(red: number, green: number, blue: number) {
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
}

function channelHex(value: number) {
  return value.toString(16).padStart(2, "0");
}
