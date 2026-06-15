import { X } from "lucide-react";
import { type TerminalUploadProgressState } from "./useTerminalUploadProgress";
import "./terminal-upload-progress.css";

type TerminalUploadProgressToastProps = {
  progress: TerminalUploadProgressState | null;
  onHide: () => void;
};

export function TerminalUploadProgressToast(props: TerminalUploadProgressToastProps) {
  if (!props.progress || props.progress.hidden) {
    return null;
  }
  const percent = Math.max(0, Math.min(100, props.progress.percent));
  return (
    <aside className={`terminal-upload-toast ${props.progress.stage}`} role="status" aria-live="polite">
      <header>
        <div>
          <strong>{uploadTitle(props.progress.stage)}</strong>
          <span>{props.progress.fileName}</span>
        </div>
        <button type="button" aria-label="Hide upload progress" onClick={props.onHide}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="terminal-upload-progress-track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <footer>
        <span>{props.progress.message}</span>
        <b>{Math.round(percent)}%</b>
      </footer>
    </aside>
  );
}

function uploadTitle(stage: TerminalUploadProgressState["stage"]) {
  if (stage === "complete") {
    return "Upload complete";
  }
  if (stage === "error") {
    return "Upload failed";
  }
  if (stage === "reading") {
    return "Reading file";
  }
  return "Uploading file";
}
