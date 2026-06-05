import { KeyRound, ShieldCheck, X } from "lucide-react";
import { type HostTrustRequest } from "./useHostTrustPrompt";
import "./host-trust-dialog.css";

type HostTrustDialogProps = {
  request: HostTrustRequest | null;
  trusting: boolean;
  onCancel: () => void;
  onTrust: () => void;
};

export function HostTrustDialog(props: HostTrustDialogProps) {
  if (!props.request) {
    return null;
  }
  return (
    <div className="host-trust-backdrop" onMouseDown={props.onCancel}>
      <section
        aria-labelledby="host-trust-title"
        aria-modal="true"
        className="host-trust-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div className="host-trust-title">
            <ShieldCheck size={20} aria-hidden="true" />
            <h2 id="host-trust-title">Trust SSH Host</h2>
          </div>
          <button aria-label="Close host trust dialog" type="button" onClick={props.onCancel}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="host-trust-body">
          <p>{props.request.hostName} needs an explicit host key trust decision before connecting.</p>
          <code>{props.request.hostname}:{props.request.port}</code>
        </div>
        <footer>
          <button className="host-trust-secondary" type="button" disabled={props.trusting} onClick={props.onCancel}>
            Cancel
          </button>
          <button className="host-trust-primary" type="button" disabled={props.trusting} onClick={props.onTrust}>
            <KeyRound size={17} aria-hidden="true" />
            {props.trusting ? "Trusting" : `Trust and ${props.request.actionLabel}`}
          </button>
        </footer>
      </section>
    </div>
  );
}
