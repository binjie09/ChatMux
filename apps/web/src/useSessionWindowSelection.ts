import { useState } from "react";

type OpenWindowInput = {
  isMobileLayout: boolean;
  sessionName: string;
  windowIndex: number;
};

export function useSessionWindowSelection() {
  const [expandedSessionNames, setExpandedSessionNames] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedSessionName, setSelectedSessionName] = useState("");
  const [selectedWindowIndex, setSelectedWindowIndex] = useState<number | null>(null);
  const [windowListSessionName, setWindowListSessionName] = useState("");

  function clearSelection() {
    setSelectedSessionName("");
    setSelectedWindowIndex(null);
    setExpandedSessionNames(new Set());
    setWindowListSessionName("");
  }

  function renameSession(oldName: string, newName: string) {
    setExpandedSessionNames((current) => renameExpandedSession(current, oldName, newName));
    setWindowListSessionName((current) => current === oldName ? newName : current);
  }

  function showWindowList(sessionName: string) {
    setWindowListSessionName(sessionName);
  }

  function toggleExpandedSession(sessionName: string) {
    if (!sessionName) {
      return;
    }
    setExpandedSessionNames((current) => {
      const next = new Set(current);
      if (next.has(sessionName)) {
        next.delete(sessionName);
      } else {
        next.add(sessionName);
      }
      return next;
    });
  }

  function openWindow(input: OpenWindowInput) {
    setSelectedSessionName(input.sessionName);
    setSelectedWindowIndex(input.windowIndex);
    if (input.isMobileLayout) {
      setWindowListSessionName("");
    }
  }

  return {
    clearSelection,
    expandedSessionNames,
    openWindow,
    renameSession,
    selectedSessionName,
    selectedWindowIndex,
    showWindowList,
    toggleExpandedSession,
    windowListSessionName,
  };
}

function renameExpandedSession(current: ReadonlySet<string>, oldName: string, newName: string) {
  if (!current.has(oldName)) {
    return current;
  }
  const next = new Set(current);
  next.delete(oldName);
  next.add(newName);
  return next;
}
