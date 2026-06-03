import { Search } from "lucide-react";
import { type TranscriptChunk } from "./api";
import "./history-panel.css";

type HistoryPanelProps = {
  chunks: TranscriptChunk[];
  query: string;
  text: string;
  onQueryChange: (query: string) => void;
};

export function HistoryPanel({ chunks, query, text, onQueryChange }: HistoryPanelProps) {
  const visibleChunks = filteredChunks(panelChunks(chunks, text), query);

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
      <div className="history-chunks">
        {visibleChunks.map((chunk) => (
          <article className={`history-chunk ${chunk.kind}`} key={chunk.id}>
            <span>{chunk.kind}</span>
            <pre>{chunk.text}</pre>
          </article>
        ))}
      </div>
    </aside>
  );
}

function panelChunks(chunks: TranscriptChunk[], text: string) {
  if (chunks.length > 0) {
    return chunks;
  }
  return text.split("\n").filter((line) => line.trim() !== "").map((line, index) => ({
    id: `line_${index + 1}`,
    kind: "output" as const,
    text: line,
  }));
}

function filteredChunks(chunks: TranscriptChunk[], query: string) {
  if (!query) {
    return chunks.slice(-80);
  }
  const normalized = query.toLowerCase();
  return chunks.filter((chunk) => chunk.text.toLowerCase().includes(normalized)).slice(-80);
}
