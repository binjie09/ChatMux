import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { draftTmuxCommand, type CommandDraft } from "./api";
import { errorMessage } from "./view-utils";
import "./command-draft.css";

type CommandDraftTarget = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  sshReady: boolean;
  windowIndex: number | null;
};

type CommandDraftPanelProps = {
  target: CommandDraftTarget;
  onDrafted: () => void;
  onInsert: (command: string) => void;
};

export function CommandDraftPanel({ target, onDrafted, onInsert }: CommandDraftPanelProps) {
  const [draft, setDraft] = useState<CommandDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState("");
  const [prompt, setPrompt] = useState("");
  const canDraft = Boolean(target.hostId && target.sessionName && target.windowIndex !== null && target.sshReady && prompt.trim());

  async function handleDraft() {
    if (!canDraft) {
      return;
    }
    try {
      setDrafting(true);
      const credentialToken = await target.getCredentialToken();
      setDraft(await draftTmuxCommand(target.hostId, target.sessionName, credentialToken, prompt, {
        windowIndex: target.windowIndex ?? undefined,
      }));
      setError("");
      onDrafted();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDrafting(false);
    }
  }

  return (
    <section className="command-draft-panel">
      <form onSubmit={(event) => {
        event.preventDefault();
        void handleDraft();
      }}>
        <input
          aria-label="AI command goal"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Draft command..."
        />
        <button type="submit" disabled={!canDraft || drafting}>
          <Sparkles size={15} aria-hidden="true" />
          {drafting ? "Drafting" : "Draft"}
        </button>
      </form>
      {error ? <p className="command-draft-error">{error}</p> : null}
      {draft ? <CommandDraftResult draft={draft} onClose={() => setDraft(null)} onInsert={onInsert} /> : null}
    </section>
  );
}

function CommandDraftResult(props: {
  draft: CommandDraft;
  onClose: () => void;
  onInsert: (command: string) => void;
}) {
  return (
    <article className={`command-draft-result ${props.draft.risk}`}>
      <header>
        <strong>{props.draft.risk}</strong>
        <small>{props.draft.model}</small>
      </header>
      <pre>{props.draft.command}</pre>
      <p>{props.draft.explanation}</p>
      <div className="command-draft-result-actions">
        <button type="button" onClick={() => props.onInsert(props.draft.command)}>
          <Check size={14} aria-hidden="true" />
          Insert
        </button>
        <button className="command-draft-close-button" type="button" onClick={props.onClose}>
          <X size={14} aria-hidden="true" />
          Close
        </button>
      </div>
    </article>
  );
}
