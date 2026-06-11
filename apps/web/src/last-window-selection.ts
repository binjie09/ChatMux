export type LastWindowSelection = Readonly<{
  hostId: string;
  sessionName: string;
  windowIndex: number;
}>;

const storageKey = "chatmux:last-window-selection";

export function loadLastWindowSelection() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }
  const parsed = parseLastWindowSelection(raw);
  if (!isLastWindowSelection(parsed)) {
    localStorage.removeItem(storageKey);
    return null;
  }
  return parsed;
}

export function saveLastWindowSelection(selection: LastWindowSelection) {
  localStorage.setItem(storageKey, JSON.stringify(selection));
}

export function clearLastWindowSelection() {
  localStorage.removeItem(storageKey);
}

function isLastWindowSelection(value: unknown): value is LastWindowSelection {
  if (!value || typeof value !== "object") {
    return false;
  }
  const selection = value as Partial<LastWindowSelection>;
  const windowIndex = selection.windowIndex;
  return isNonEmptyString(selection.hostId)
    && isNonEmptyString(selection.sessionName)
    && typeof windowIndex === "number"
    && Number.isInteger(windowIndex)
    && windowIndex >= 0;
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.length > 0;
}

function parseLastWindowSelection(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
