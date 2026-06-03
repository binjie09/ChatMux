import { type FormEvent, useEffect, useState } from "react";
import { Save, Tags } from "lucide-react";
import { type TmuxSession } from "./api";
import "./session-metadata.css";

type SessionMetadataEditorProps = {
  session: TmuxSession | undefined;
  onSave: (title: string, tags: string[]) => Promise<void>;
};

export function SessionMetadataEditor({ session, onSave }: SessionMetadataEditorProps) {
  const [saving, setSaving] = useState(false);
  const [tagsText, setTagsText] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    setTitle(session?.title || "");
    setTagsText(session?.tags.join(", ") || "");
  }, [session]);

  if (!session) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(title, parseTags(tagsText));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="session-metadata" onSubmit={handleSubmit}>
      <input aria-label="Session title" placeholder="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
      <label>
        <Tags size={14} aria-hidden="true" />
        <input aria-label="Session tags" placeholder="Tags" value={tagsText} onChange={(event) => setTagsText(event.target.value)} />
      </label>
      <button type="submit" disabled={saving} aria-label="Save session metadata">
        <Save size={15} aria-hidden="true" />
      </button>
    </form>
  );
}

function parseTags(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}
