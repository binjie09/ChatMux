import { type FormEvent, useState } from "react";
import { KeyRound, Save, Trash2 } from "lucide-react";
import { type GatewayTokenState } from "./useGatewayAccessToken";
import "./gateway-token-control.css";

type GatewayTokenControlProps = {
  tokenState: GatewayTokenState;
};

const statusLabels = {
  empty: "Not set",
  loading: "Loading",
  saving: "Saving",
  stored: "Stored",
} as const;

export function GatewayTokenControl({ tokenState }: GatewayTokenControlProps) {
  const [draft, setDraft] = useState("");
  const busy = tokenState.status === "loading" || tokenState.status === "saving";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = draft.trim();
    if (!token) {
      return;
    }
    await tokenState.saveToken(token);
    setDraft("");
  }

  async function handleClear() {
    await tokenState.clearToken();
    setDraft("");
  }

  return (
    <section className="gateway-token-control" aria-label="Gateway token">
      <header>
        <KeyRound size={16} aria-hidden="true" />
        <span>Gateway token</span>
        <small>{statusLabels[tokenState.status]}</small>
      </header>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <input
          autoComplete="off"
          aria-label="Gateway access token"
          disabled={busy}
          placeholder={tokenState.hasToken ? "Replace token" : "Access token"}
          type="password"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button disabled={busy || !draft.trim()} type="submit" aria-label="Save gateway token">
          <Save size={15} aria-hidden="true" />
        </button>
        <button disabled={busy || !tokenState.hasToken} type="button" aria-label="Clear gateway token" onClick={() => void handleClear()}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
