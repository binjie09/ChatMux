import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { draftTmuxCommand, type CommandDraft } from "./api";
import { errorMessage } from "./view-utils";
import "./command-draft.css";

type CommandDraftTarget = {
  getCredentialToken: () => Promise<string>;
  hostId: string;
  sessionName: string;
  sshReady: boolean;
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
  const canDraft = Boolean(target.hostId && target.sessionName && target.sshReady && prompt.trim());

  async function handleDraft() {
    if (!canDraft) {
      return;
    }
    try {
      setDrafting(true);
      const credentialToken = await target.getCredentialToken();
      setDraft(await draftTmuxCommand(target.hostId, target.sessionName, credentialToken, prompt));
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
      {draft ? <CommandDraftResult draft={draft} onInsert={onInsert} /> : null}
    </section>
  );
}

function CommandDraftResult({ draft, onInsert }: { draft: CommandDraft; onInsert: (command: string) => void }) {
  return (
    <article className={`command-draft-result ${draft.risk}`}>
      <header>
        <strong>{draft.risk}</strong>
        <small>{draft.model}</small>
      </header>
      <pre>{draft.command}</pre>
      <p>{draft.explanation}</p>
      <button type="button" onClick={() => onInsert(draft.command)}>
        <Check size={14} aria-hidden="true" />
        Insert
      </button>
    </article>
  );
}
