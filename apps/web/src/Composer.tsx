import { type ReactNode, useState } from "react";
import { CircleHelp, Clipboard, CornerDownLeft, Maximize2, Send, TextCursorInput, X } from "lucide-react";
import { ComposerImageUploadButton } from "./ComposerImageUploadButton";
import { bracketedPaste } from "./terminal-protocol";
import "./composer.css";
import "./composer-dialog.css";

export type ComposerMode = "enter" | "paste" | "raw";

type ComposerProps = {
  draftPanel?: ReactNode;
  mode: ComposerMode;
  value: string;
  onModeChange: (mode: ComposerMode) => void;
  onSubmit: (data: string) => void;
  onUploadImage?: ((file: File) => Promise<void>) | null;
  onValueChange: (value: string) => void;
};

const composerModes = [
  {
    description: "Sends the text followed by a newline, like typing it in the terminal and pressing Enter.",
    icon: CornerDownLeft,
    label: "Enter",
    value: "enter",
  },
  {
    description: "Wraps the text in bracketed paste markers so shells and editors receive it as pasted input.",
    icon: Clipboard,
    label: "Paste",
    value: "paste",
  },
  {
    description: "Sends exactly the text you typed, without adding a newline or paste markers.",
    icon: TextCursorInput,
    label: "Raw",
    value: "raw",
  },
] as const;

export function Composer(props: ComposerProps) {
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [helpMode, setHelpMode] = useState<ComposerMode | null>(null);
  const helpModeDetail = findComposerMode(helpMode);

  function submitValue() {
    if (!props.value) {
      return false;
    }
    props.onSubmit(composeTerminalInput(props.value, props.mode));
    return true;
  }

  return (
    <>
      {props.draftPanel}
      <ComposerForm
        mode={props.mode}
        value={props.value}
        onModeChange={props.onModeChange}
        onRequestFullScreen={() => setFullScreenOpen(true)}
        onRequestHelp={setHelpMode}
        onSubmit={submitValue}
        onUploadImage={props.onUploadImage}
        onValueChange={props.onValueChange}
      />
      {fullScreenOpen ? (
        <FullScreenEditor
          value={props.value}
          onClose={() => setFullScreenOpen(false)}
          onSubmit={() => {
            if (submitValue()) {
              setFullScreenOpen(false);
            }
          }}
          onValueChange={props.onValueChange}
        />
      ) : null}
      {helpModeDetail ? <ModeHelpDialog mode={helpModeDetail} onClose={() => setHelpMode(null)} /> : null}
    </>
  );
}

type ComposerFormProps = Omit<ComposerProps, "draftPanel" | "onSubmit"> & {
  onRequestFullScreen: () => void;
  onRequestHelp: (mode: ComposerMode) => void;
  onSubmit: () => void;
};

function ComposerForm(props: ComposerFormProps) {
  return (
    <form className="composer" onSubmit={(event) => event.preventDefault()}>
      <ModeButtons
        mode={props.mode}
        onModeChange={props.onModeChange}
        onRequestHelp={props.onRequestHelp}
      />
      <ComposerTextArea
        value={props.value}
        onRequestFullScreen={props.onRequestFullScreen}
        onUploadImage={props.onUploadImage}
        onValueChange={props.onValueChange}
      />
      <button className="composer-send-button" type="button" onClick={props.onSubmit}>
        <Send size={18} aria-hidden="true" />
        Send
      </button>
    </form>
  );
}

function ModeButtons(props: {
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  onRequestHelp: (mode: ComposerMode) => void;
}) {
  return (
    <div className="composer-modes" role="group" aria-label="Send mode">
      {composerModes.map((mode) => {
        const Icon = mode.icon;
        const active = props.mode === mode.value;
        return (
          <div className={active ? "composer-mode active" : "composer-mode"} key={mode.value}>
            <button
              aria-pressed={active}
              className="composer-mode-choice"
              type="button"
              onClick={() => props.onModeChange(mode.value)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{mode.label}</span>
            </button>
            <button
              aria-label={`${mode.label} mode help`}
              className="composer-mode-help"
              type="button"
              onClick={() => props.onRequestHelp(mode.value)}
            >
              <CircleHelp size={13} aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ComposerTextArea(props: {
  onUploadImage?: ((file: File) => Promise<void>) | null;
  value: string;
  onRequestFullScreen: () => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className={`composer-input-shell ${props.onUploadImage ? "has-image-upload" : ""}`}>
      <textarea
        aria-label="Command"
        placeholder="Send command or terminal input..."
        rows={1}
        value={props.value}
        onChange={(event) => props.onValueChange(event.target.value)}
      />
      {props.onUploadImage ? <ComposerImageUploadButton onUpload={props.onUploadImage} /> : null}
      <button
        aria-label="Open full screen editor"
        className="composer-expand-button"
        type="button"
        onClick={props.onRequestFullScreen}
      >
        <Maximize2 size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

function FullScreenEditor(props: {
  value: string;
  onClose: () => void;
  onSubmit: () => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="composer-modal-backdrop" onMouseDown={props.onClose}>
      <section
        aria-labelledby="composer-fullscreen-title"
        aria-modal="true"
        className="composer-fullscreen-editor"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="composer-fullscreen-title">Terminal Input</h2>
          <button aria-label="Close full screen editor" type="button" onClick={props.onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <textarea
          aria-label="Full screen command editor"
          autoFocus
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
        />
        <footer>
          <button className="composer-secondary-button" type="button" onClick={props.onClose}>
            Close
          </button>
          <button className="composer-primary-button" type="button" onClick={props.onSubmit}>
            <Send size={18} aria-hidden="true" />
            Send
          </button>
        </footer>
      </section>
    </div>
  );
}

function ModeHelpDialog(props: { mode: (typeof composerModes)[number]; onClose: () => void }) {
  const title = `${props.mode.label} Mode`;
  return (
    <div className="composer-modal-backdrop" onMouseDown={props.onClose}>
      <section
        aria-labelledby="composer-help-title"
        aria-modal="true"
        className="composer-help-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="composer-help-title">{title}</h2>
          <button aria-label="Close mode help" type="button" onClick={props.onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <p>{props.mode.description}</p>
      </section>
    </div>
  );
}

function findComposerMode(mode: ComposerMode | null) {
  return composerModes.find((item) => item.value === mode);
}

function composeTerminalInput(value: string, mode: ComposerMode) {
  if (mode === "enter") {
    return `${value}\n`;
  }
  if (mode === "paste") {
    return bracketedPaste(value);
  }
  return value;
}
