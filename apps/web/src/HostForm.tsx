import { type FormEvent, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { type CreateHostInput, type SSHAuthMethod } from "./api";
import "./host-form.css";

type HostFormProps = {
  initialValue?: CreateHostInput;
  savedCredential?: boolean;
  onCancel: () => void;
  onSubmit: (input: CreateHostInput) => Promise<void>;
};

const initialForm = {
  name: "",
  hostname: "",
  port: 22,
  sshAuthMethod: "password" as SSHAuthMethod,
  username: "",
};

export function HostForm({ initialValue, onCancel, onSubmit, savedCredential }: HostFormProps) {
  const [form, setForm] = useState<CreateHostInput>(initialValue ?? initialForm);
  const [clearCredential, setClearCredential] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setForm(initialValue ?? initialForm);
    setClearCredential(false);
  }, [initialValue?.hostname, initialValue?.name, initialValue?.port, initialValue?.sshAuthMethod, initialValue?.username]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(submitValue(form, clearCredential, Boolean(initialValue)));
      setForm(initialForm);
      setClearCredential(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="host-form" onSubmit={handleSubmit}>
      <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Name" />
      <input value={form.hostname} onChange={(event) => setForm({ ...form, hostname: event.target.value })} placeholder="Host" />
      <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="User" />
      <div className="host-auth-method" role="group" aria-label="SSH authentication method">
        <button className={form.sshAuthMethod === "password" ? "selected" : ""} type="button" onClick={() => setAuthMethod("password")}>
          Password
        </button>
        <button className={form.sshAuthMethod === "private_key" ? "selected" : ""} type="button" onClick={() => setAuthMethod("private_key")}>
          Private key
        </button>
      </div>
      {form.sshAuthMethod === "private_key" ? (
        <>
          <textarea
            autoComplete="off"
            value={form.privateKey ?? ""}
            onChange={(event) => setForm({ ...form, privateKey: event.target.value })}
            placeholder={initialValue ? "Replace private key" : "SSH private key"}
            spellCheck={false}
          />
          <input
            autoComplete="off"
            value={form.privateKeyPassphrase ?? ""}
            onChange={(event) => setForm({ ...form, privateKeyPassphrase: event.target.value })}
            placeholder="Private key passphrase"
            type="password"
          />
        </>
      ) : (
        <input
          autoComplete="off"
          value={form.password ?? ""}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          placeholder={initialValue ? "Replace password" : "SSH password"}
          type="password"
        />
      )}
      {initialValue && savedCredential ? (
        <label className="host-form-clear-credential">
          <input checked={clearCredential} type="checkbox" onChange={(event) => setClearCredential(event.target.checked)} />
          <span>Clear saved credential</span>
        </label>
      ) : null}
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

  function setAuthMethod(method: SSHAuthMethod) {
    setForm({ ...form, sshAuthMethod: method, password: "", privateKey: "", privateKeyPassphrase: "" });
    setClearCredential(false);
  }
}

function submitValue(form: CreateHostInput, clearCredential: boolean, editing: boolean): CreateHostInput {
  const value = trimmedCredentialForm(form);
  if (!editing) {
    return value;
  }
  if (clearCredential) {
    return { ...value, password: "", privateKey: "", privateKeyPassphrase: "" };
  }
  if (value.sshAuthMethod === "password" && value.password) {
    return value;
  }
  if (value.sshAuthMethod === "private_key" && value.privateKey) {
    return value;
  }
  const { password: _password, privateKey: _privateKey, privateKeyPassphrase: _passphrase, ...host } = value;
  return host;
}

function trimmedCredentialForm(form: CreateHostInput): CreateHostInput {
  if (form.sshAuthMethod === "private_key") {
    const privateKey = form.privateKey?.trim();
    return { ...form, password: "", privateKey: privateKey ?? "", privateKeyPassphrase: form.privateKeyPassphrase ?? "" };
  }
  const password = form.password?.trim();
  return { ...form, password: password ?? "", privateKey: "", privateKeyPassphrase: "" };
}
