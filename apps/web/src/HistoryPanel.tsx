import { Search } from "lucide-react";
import "./history-panel.css";

type HistoryPanelProps = {
  query: string;
  text: string;
  onQueryChange: (query: string) => void;
};

export function HistoryPanel({ query, text, onQueryChange }: HistoryPanelProps) {
  const lines = filteredLines(text, query);

  return (
    <aside className="history-panel">
      <label className="history-search">
        <Search size={16} aria-hidden="true" />
        <input
          aria-label="Search history"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search"
        />
      </label>
      <pre>{lines.join("\n")}</pre>
    </aside>
  );
}

function filteredLines(text: string, query: string) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  if (!query) {
    return lines.slice(-120);
  }
  const normalized = query.toLowerCase();
  return lines.filter((line) => line.toLowerCase().includes(normalized)).slice(-120);
}
