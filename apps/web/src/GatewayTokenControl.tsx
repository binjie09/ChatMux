import { type FormEvent, useState } from "react";
import { Fingerprint, KeyRound, LockKeyhole, Save, Trash2 } from "lucide-react";
import { type GatewayTokenState } from "./useGatewayAccessToken";
import "./gateway-token-control.css";

type GatewayTokenControlProps = {
  tokenState: GatewayTokenState;
};

const statusLabels = {
  empty: "Not set",
  loading: "Loading",
  locked: "Locked",
  saving: "Saving",
  stored: "Stored",
} as const;

export function GatewayTokenControl({ tokenState }: GatewayTokenControlProps) {
  const [draft, setDraft] = useState("");
  const busy = isBusy(tokenState);

  async function handleClear() {
    await tokenState.clearToken();
    setDraft("");
  }

  return (
    <section className="gateway-token-control" aria-label="Gateway token">
      <GatewayTokenHeader status={tokenState.status} />
      <GatewayTokenForm
        busy={busy}
        draft={draft}
        hasToken={tokenState.hasToken}
        onClear={handleClear}
        onDraftChange={setDraft}
        onSave={tokenState.saveToken}
      />
      <BiometricUnlockRow busy={busy} tokenState={tokenState} />
    </section>
  );
}

function GatewayTokenHeader({ status }: Pick<GatewayTokenState, "status">) {
  return (
    <header>
      <KeyRound size={16} aria-hidden="true" />
      <span>Gateway token</span>
      <small>{statusLabels[status]}</small>
    </header>
  );
}

type GatewayTokenFormProps = {
  busy: boolean;
  draft: string;
  hasToken: boolean;
  onClear: () => Promise<void>;
  onDraftChange: (value: string) => void;
  onSave: (token: string) => Promise<void>;
};

function GatewayTokenForm(props: GatewayTokenFormProps) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = props.draft.trim();
    if (!token) {
      return;
    }
    await props.onSave(token);
    props.onDraftChange("");
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <input
        autoComplete="off"
        aria-label="Gateway access token"
        disabled={props.busy}
        placeholder={props.hasToken ? "Replace token" : "Access token"}
        type="password"
        value={props.draft}
        onChange={(event) => props.onDraftChange(event.target.value)}
      />
      <button disabled={props.busy || !props.draft.trim()} type="submit" aria-label="Save gateway token">
        <Save size={15} aria-hidden="true" />
      </button>
      <button disabled={props.busy || !props.hasToken} type="button" aria-label="Clear gateway token" onClick={() => void props.onClear()}>
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </form>
  );
}

function BiometricUnlockRow({ busy, tokenState }: { busy: boolean; tokenState: GatewayTokenState }) {
  return (
    <div className="gateway-token-biometric">
      <label>
        <input
          checked={tokenState.biometricEnabled}
          disabled={biometricToggleDisabled(busy, tokenState)}
          type="checkbox"
          onChange={(event) => void tokenState.setBiometricUnlock(event.target.checked)}
        />
        <Fingerprint size={15} aria-hidden="true" />
        <span>Biometric unlock</span>
      </label>
      <button disabled={tokenState.status !== "locked"} type="button" aria-label="Unlock gateway token" onClick={() => void tokenState.unlockToken()}>
        <LockKeyhole size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function isBusy(tokenState: GatewayTokenState) {
  return tokenState.status === "loading" || tokenState.status === "saving";
}

function biometricToggleDisabled(busy: boolean, tokenState: GatewayTokenState) {
  if (busy || tokenState.biometricEnabled) {
    return busy;
  }
  return !tokenState.biometricAvailable || !tokenState.hasToken;
}
