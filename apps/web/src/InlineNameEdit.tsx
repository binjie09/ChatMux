import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";

type InlineNameEditProps = {
  ariaLabel: string;
  className?: string;
  initialName: string;
  onCancel: () => void;
  onSave: (name: string) => Promise<void> | void;
};

export function InlineNameEdit(props: InlineNameEditProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(props.initialName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName === props.initialName) {
      props.onCancel();
      return;
    }
    setSaving(true);
    await props.onSave(nextName);
    setSaving(false);
    props.onCancel();
  }

  return (
    <form className={`inline-name-edit ${props.className ?? ""}`} onSubmit={submit}>
      <input
        aria-label={props.ariaLabel}
        disabled={saving}
        ref={inputRef}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            props.onCancel();
          }
        }}
      />
      <button type="submit" disabled={saving || !name.trim()} aria-label="Save name">
        <Check size={14} aria-hidden="true" />
      </button>
      <button type="button" disabled={saving} aria-label="Cancel rename" onClick={props.onCancel}>
        <X size={14} aria-hidden="true" />
      </button>
    </form>
  );
}
