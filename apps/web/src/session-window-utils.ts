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

/**
 * Whether the window name is tmux's automatic rename (not manually set by the
 * user or by tools like Claude Code). ChatMux's default `window-N` names also
 * count as automatic, since the user has not given the window a real name.
 */
export function isWindowAutoNamed(window: TmuxWindow) {
  if (!window.name) {
    return true;
  }
  if (window.autoRename === true) {
    return true;
  }
  return /^window-\d+$/.test(window.name);
}

/**
 * Display label for a window. An automatically-named window shows only the
 * pane's process name; a renamed window shows both its custom name and the
 * process name.
 */
export function windowDisplayLabel(window: TmuxWindow) {
  if (isWindowAutoNamed(window)) {
    return window.processName || windowLabel(window);
  }
  if (window.processName) {
    return `${window.name} · ${window.processName}`;
  }
  return window.name;
}

export function windowCountLabel(count: number) {
  return count === 1 ? "1 window" : `${count} windows`;
}
