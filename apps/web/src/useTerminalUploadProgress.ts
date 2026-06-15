import { useCallback, useEffect, useRef, useState } from "react";

export type TerminalUploadStage = "reading" | "uploading" | "complete" | "error";

export type TerminalUploadProgressState = {
  fileName: string;
  hidden: boolean;
  message: string;
  percent: number;
  stage: TerminalUploadStage;
};

const uploadCompleteHideDelayMs = 1600;

export function useTerminalUploadProgress() {
  const [progress, setProgress] = useState<TerminalUploadProgressState | null>(null);
  const hideTimerRef = useRef(0);

  const clearHideTimer = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = 0;
  }, []);

  const startUpload = useCallback((fileName: string) => {
    clearHideTimer();
    setProgress({
      fileName: fileName || "clipboard-file",
      hidden: false,
      message: "Preparing upload",
      percent: 0,
      stage: "reading",
    });
  }, [clearHideTimer]);

  const updateUpload = useCallback((next: Partial<Omit<TerminalUploadProgressState, "fileName" | "hidden">>) => {
    setProgress((current) => current ? { ...current, ...next } : current);
  }, []);

  const finishUpload = useCallback((message: string) => {
    updateUpload({ message, percent: 100, stage: "complete" });
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setProgress(null);
      hideTimerRef.current = 0;
    }, uploadCompleteHideDelayMs);
  }, [clearHideTimer, updateUpload]);

  const failUpload = useCallback((message: string) => {
    clearHideTimer();
    updateUpload({ message, stage: "error" });
  }, [clearHideTimer, updateUpload]);

  const hideUpload = useCallback(() => {
    setProgress((current) => current ? { ...current, hidden: true } : current);
  }, []);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  return { failUpload, finishUpload, hideUpload, progress, startUpload, updateUpload };
}
