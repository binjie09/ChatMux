import { type FormEvent, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { type CreateHostInput } from "./api";
import "./host-form.css";

type HostFormProps = {
  initialValue?: CreateHostInput;
  onCancel: () => void;
  onSubmit: (input: CreateHostInput) => Promise<void>;
};

const initialForm = {
  name: "",
  hostname: "",
  port: 22,
  username: "",
};

export function HostForm({ initialValue, onCancel, onSubmit }: HostFormProps) {
  const [form, setForm] = useState<CreateHostInput>(initialValue ?? initialForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(initialValue ?? initialForm);
  }, [initialValue?.hostname, initialValue?.name, initialValue?.port, initialValue?.username]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(form);
      setForm(initialForm);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="host-form" onSubmit={handleSubmit}>
      <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name" />
      <input value={form.hostname} onChange={(event) => setForm({ ...form, hostname: event.target.value })} placeholder="Host" />
      <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="User" />
      <input
        min="1"
        max="65535"
        type="number"
        value={form.port}
        onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
        placeholder="Port"
      />
      <div className="host-form-actions">
        <button type="submit" disabled={submitting} aria-label="Save host" title="Save host">
          <Check size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onCancel} aria-label="Cancel" title="Cancel">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
