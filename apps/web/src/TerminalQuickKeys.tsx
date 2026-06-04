import { ArrowDown, ArrowUp } from "lucide-react";

const terminalQuickKeys = [
  { data: "\x1b", label: "Esc" },
  { data: "\t", label: "Tab" },
  { data: "\x03", label: "^C" },
  { data: "\x04", label: "^D" },
  { data: "\x1b[A", icon: "up", label: "Up" },
  { data: "\x1b[B", icon: "down", label: "Down" },
] as const;

export function TerminalQuickKeys(props: { disabled: boolean; onSend: (data: string) => void }) {
  return (
    <div className="terminal-quick-keys" aria-label="Terminal quick keys">
      {terminalQuickKeys.map((key) => (
        <button
          key={key.label}
          disabled={props.disabled}
          type="button"
          aria-label={`Send ${key.label}`}
          onClick={() => props.onSend(key.data)}
        >
          {quickKeyContent(key)}
        </button>
      ))}
    </div>
  );
}

function quickKeyContent(key: (typeof terminalQuickKeys)[number]) {
  if (!("icon" in key)) {
    return key.label;
  }
  if (key.icon === "up") {
    return <ArrowUp size={15} aria-hidden="true" />;
  }
  return <ArrowDown size={15} aria-hidden="true" />;
}
