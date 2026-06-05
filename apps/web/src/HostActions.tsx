import { Bot, KeyRound, Pin } from "lucide-react";
import { type Host } from "./api";

type HostActionsProps = {
  host: Host | undefined;
  onTogglePin: () => void;
  onTrustHost: () => void;
};

export function HostActions({ host, onTogglePin, onTrustHost }: HostActionsProps) {
  return (
    <div className="header-actions">
      <button className="utility-button" type="button" onClick={onTrustHost}>
        <KeyRound size={17} aria-hidden="true" />
        Trust host
      </button>
      <button className="utility-button" type="button" onClick={onTogglePin}>
        <Pin size={17} aria-hidden="true" />
        {host?.pinned ? "Unpin" : "Pin"}
      </button>
      <button className="utility-button" type="button">
        <Bot size={17} aria-hidden="true" />
        Summarize
      </button>
    </div>
  );
}
