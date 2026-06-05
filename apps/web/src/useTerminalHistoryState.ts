import { useState } from "react";
import { captureTmuxHistory, type TranscriptChunk } from "./api";

type RefreshHistoryInput = {
  credentialToken: string;
  hostId: string;
  sessionName: string;
  windowIndex: number;
};

export function useTerminalHistoryState() {
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");

  function clear() {
    setChunks([]);
    setText("");
  }

  async function refresh(input: RefreshHistoryInput) {
    const history = await captureTmuxHistory(input.hostId, input.sessionName, input.credentialToken, {
      windowIndex: input.windowIndex,
    });
    setChunks(history.chunks);
    setText(history.text);
  }

  return { chunks, clear, query, refresh, setQuery, text };
}

export type TerminalHistoryState = ReturnType<typeof useTerminalHistoryState>;
