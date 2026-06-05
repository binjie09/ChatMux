import { useState } from "react";

type OpenWindowInput = {
  isMobileLayout: boolean;
  sessionName: string;
  windowIndex: number;
};

export function useSessionWindowSelection() {
  const [expandedSessionName, setExpandedSessionName] = useState("");
  const [selectedSessionName, setSelectedSessionName] = useState("");
  const [selectedWindowIndex, setSelectedWindowIndex] = useState<number | null>(null);

  function clearSelection() {
    setSelectedSessionName("");
    setSelectedWindowIndex(null);
    setExpandedSessionName("");
  }

  function expandSession(sessionName: string) {
    setExpandedSessionName(sessionName);
  }

  function openWindow(input: OpenWindowInput) {
    setSelectedSessionName(input.sessionName);
    setSelectedWindowIndex(input.windowIndex);
    if (input.isMobileLayout) {
      setExpandedSessionName("");
    }
  }

  return {
    clearSelection,
    expandSession,
    expandedSessionName,
    openWindow,
    selectedSessionName,
    selectedWindowIndex,
  };
}
