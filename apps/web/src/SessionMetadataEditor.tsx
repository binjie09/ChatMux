import { type FormEvent, useEffect, useState } from "react";
import { Save, Share2, Tags, Users } from "lucide-react";
import { type SaveSessionMetadataInput, type TmuxSession } from "./api";
import "./session-metadata.css";

type SessionMetadataEditorProps = {
  session: TmuxSession | undefined;
  onSave: (input: SaveSessionMetadataInput) => Promise<void>;
};

export function SessionMetadataEditor({ session, onSave }: SessionMetadataEditorProps) {
  const [collaboratorsText, setCollaboratorsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState(false);
  const [tagsText, setTagsText] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    setCollaboratorsText((session?.collaborators ?? []).join(", "));
    setShared(session?.shared ?? false);
    setTitle(session?.title || "");
    setTagsText((session?.tags ?? []).join(", "));
  }, [session]);

  if (!session) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        collaborators: parseCommaList(collaboratorsText),
        shared,
        tags: parseCommaList(tagsText),
        title,
      });
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
      <label>
        <Users size={14} aria-hidden="true" />
        <input aria-label="Session collaborators" placeholder="Collaborators" value={collaboratorsText} onChange={(event) => setCollaboratorsText(event.target.value)} />
      </label>
      <label className="session-share-toggle" title={session.owner ? `Owner: ${session.owner}` : "Session visibility"}>
        <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
        <Share2 size={14} aria-hidden="true" />
        <span>{shared ? "Shared" : "Private"}</span>
      </label>
      <button type="submit" disabled={saving} aria-label="Save session metadata">
        <Save size={15} aria-hidden="true" />
      </button>
    </form>
  );
}

function parseCommaList(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}
