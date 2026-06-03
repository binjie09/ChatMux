import { useEffect, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { summarizeTmuxHistory, type TranscriptChunk, type TranscriptSummary } from "./api";
import { errorMessage } from "./view-utils";
import "./history-panel.css";

type SummaryTarget = {
  credentialToken: string;
  hostId: string;
  sessionName: string;
};

type HistoryPanelProps = {
  chunks: TranscriptChunk[];
  query: string;
  summaryTarget: SummaryTarget;
  text: string;
  onSummarized: () => void;
  onQueryChange: (query: string) => void;
};

export function HistoryPanel({ chunks, query, summaryTarget, text, onQueryChange, onSummarized }: HistoryPanelProps) {
  const visibleChunks = filteredChunks(panelChunks(chunks, text), query);
  const [summary, setSummary] = useState<TranscriptSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const canSummarize = Boolean(summaryTarget.hostId && summaryTarget.sessionName && summaryTarget.credentialToken && text.trim());

  useEffect(() => {
    setSummary(null);
    setSummaryError("");
  }, [summaryTarget.hostId, summaryTarget.sessionName, text]);

  async function handleSummarize() {
    if (!canSummarize) {
      return;
    }
    try {
      setSummarizing(true);
      setSummary(await summarizeTmuxHistory(summaryTarget.hostId, summaryTarget.sessionName, summaryTarget.credentialToken));
      setSummaryError("");
      onSummarized();
    } catch (err) {
      setSummaryError(errorMessage(err));
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <aside className="history-panel">
      <div className="history-tools">
        <label className="history-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search history"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search"
          />
        </label>
        <button type="button" disabled={!canSummarize || summarizing} onClick={() => void handleSummarize()}>
          <Sparkles size={14} aria-hidden="true" />
          {summarizing ? "Summarizing" : "Summarize"}
        </button>
      </div>
      {summary || summaryError ? <SummaryBlock error={summaryError} summary={summary} /> : null}
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

function SummaryBlock({ error, summary }: { error: string; summary: TranscriptSummary | null }) {
  return (
    <section className={`history-summary ${error ? "error" : ""}`}>
      <strong>{error ? "Summary unavailable" : `Summary · ${summary?.model}`}</strong>
      <p>{error || summary?.summary}</p>
    </section>
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
