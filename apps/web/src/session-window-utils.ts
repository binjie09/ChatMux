import { type TmuxSession, type TmuxWindow } from "./api";

export function firstSessionWindowIndex(session: TmuxSession | undefined) {
  return session?.windowList[0]?.index ?? null;
}

export function sessionHasMultipleWindows(session: TmuxSession) {
  return session.windowList.length > 1;
}

export function findSessionWindow(session: TmuxSession | undefined, windowIndex: number | null) {
  if (!session || windowIndex === null) {
    return undefined;
  }
  return session.windowList.find((window) => window.index === windowIndex);
}

export function windowLabel(window: TmuxWindow) {
  return window.name || `Window ${window.index}`;
}

export function windowCountLabel(count: number) {
  return count === 1 ? "1 window" : `${count} windows`;
}
