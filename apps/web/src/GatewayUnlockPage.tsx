import { TerminalSquare } from "lucide-react";
import { GatewayTokenControl } from "./GatewayTokenControl";
import { type GatewayTokenState } from "./useGatewayAccessToken";
import "./gateway-unlock-page.css";

type GatewayUnlockPageProps = {
  error: string;
  tokenState: GatewayTokenState;
};

export function GatewayUnlockPage({ error, tokenState }: GatewayUnlockPageProps) {
  return (
    <main className="gateway-unlock-page">
      <section className="gateway-unlock-panel">
        <header>
          <TerminalSquare aria-hidden="true" />
          <div>
            <strong>ChatMux</strong>
            <span>Gateway access required</span>
          </div>
        </header>
        <GatewayTokenControl tokenState={tokenState} />
        {error ? <p className="gateway-unlock-error">{error}</p> : null}
      </section>
    </main>
  );
}
