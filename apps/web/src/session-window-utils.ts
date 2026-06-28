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

/**
 * Build the chain of adjacent swap-window pairs that move the window at
 * fromIndex into toIndex's slot. Each pair uses the *real* tmux window indices
 * of neighbouring list entries, so it never references an index that has been
 * left empty by a deleted window (which would make tmux fail with
 * "can't find window"). Returns [] for a no-op move or when either index can no
 * longer be located in the list.
 */
export function buildWindowSwaps(windows: TmuxWindow[], fromIndex: number, toIndex: number): Array<[number, number]> {
  const swaps: Array<[number, number]> = [];
  const fromPosition = windows.findIndex((window) => window.index === fromIndex);
  const toPosition = windows.findIndex((window) => window.index === toIndex);
  if (fromPosition === -1 || toPosition === -1 || fromPosition === toPosition) {
    return swaps;
  }
  let movedIndex = fromIndex;
  if (fromPosition < toPosition) {
    for (let position = fromPosition; position < toPosition; position += 1) {
      const nextIndex = windows[position + 1].index;
      swaps.push([movedIndex, nextIndex]);
      movedIndex = nextIndex;
    }
  } else {
    for (let position = fromPosition; position > toPosition; position -= 1) {
      const nextIndex = windows[position - 1].index;
      swaps.push([movedIndex, nextIndex]);
      movedIndex = nextIndex;
    }
  }
  return swaps;
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

const SHELL_PROCESS_NAMES = new Set(["zsh", "bash", "sh", "fish", "dash", "ksh", "csh", "tcsh"]);

function isShellProcess(processName: string) {
  return SHELL_PROCESS_NAMES.has(processName);
}

/**
 * The pane-level label for a window. We prefer the terminal title (pane_title)
 * that tools like Claude Code or Codex write, since it carries the real session
 * topic (e.g. "⠂ tmux-window-pane-display"). Titles set by a shell are noise
 * (typically the user name or cwd), so shell panes fall back to the process
 * name; empty or duplicate titles fall back too.
 */
export function paneLabel(window: TmuxWindow) {
  const title = window.paneTitle?.trim() ?? "";
  const processName = window.processName;
  if (!title || isShellProcess(processName) || title === processName || title === window.name) {
    return processName;
  }
  return title;
}

/**
 * Display label for a window. An automatically-named window shows only its pane
 * label; a renamed window shows both its custom name and the pane label.
 */
export function windowDisplayLabel(window: TmuxWindow) {
  const pane = paneLabel(window);
  if (isWindowAutoNamed(window)) {
    return pane || windowLabel(window);
  }
  if (pane) {
    return `${window.name} · ${pane}`;
  }
  return window.name;
}

export function windowCountLabel(count: number) {
  return count === 1 ? "1 window" : `${count} windows`;
}
