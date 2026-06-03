import { type ReactNode } from "react";
import { Clipboard, CornerDownLeft, Send, TextCursorInput } from "lucide-react";
import "./composer.css";

export type ComposerMode = "enter" | "paste" | "raw";

type ComposerProps = {
  draftPanel?: ReactNode;
  mode: ComposerMode;
  value: string;
  onModeChange: (mode: ComposerMode) => void;
  onSubmit: (data: string) => void;
  onValueChange: (value: string) => void;
};

const composerModes = [
  { icon: CornerDownLeft, label: "Enter", value: "enter" },
  { icon: Clipboard, label: "Paste", value: "paste" },
  { icon: TextCursorInput, label: "Raw", value: "raw" },
] as const;

export function Composer(props: ComposerProps) {
  return (
    <>
      {props.draftPanel}
      <form className="composer" onSubmit={(event) => {
        event.preventDefault();
        if (props.value) {
          props.onSubmit(composeTerminalInput(props.value, props.mode));
        }
      }}>
        <div className="composer-modes" role="group" aria-label="Send mode">
          {composerModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                aria-pressed={props.mode === mode.value}
                className={props.mode === mode.value ? "active" : ""}
                key={mode.value}
                type="button"
                onClick={() => props.onModeChange(mode.value)}
              >
                <Icon size={15} aria-hidden="true" />
                {mode.label}
              </button>
            );
          })}
        </div>
        <input
          aria-label="Command"
          placeholder="Send command or terminal input..."
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
        />
        <button type="submit">
          <Send size={18} aria-hidden="true" />
          Send
        </button>
      </form>
    </>
  );
}

function composeTerminalInput(value: string, mode: ComposerMode) {
  if (mode === "enter") {
    return `${value}\n`;
  }
  if (mode === "paste") {
    return `\x1b[200~${value}\x1b[201~`;
  }
  return value;
}
