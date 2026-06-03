package tmux

import "testing"

func TestNormalizeHistoryChunksCommandOutputBlocks(t *testing.T) {
	history := "\nuser@host:~/app$ ls\r\nmain.go\nREADME.md\n\n$ echo ok\nok\n"

	chunks := NormalizeHistory(history)
	if len(chunks) != 4 {
		t.Fatalf("expected 4 chunks, got %d: %#v", len(chunks), chunks)
	}
	assertChunk(t, chunks[0], "chunk_1", "command", "user@host:~/app$ ls")
	assertChunk(t, chunks[1], "chunk_2", "output", "main.go\nREADME.md")
	assertChunk(t, chunks[2], "chunk_3", "command", "$ echo ok")
	assertChunk(t, chunks[3], "chunk_4", "output", "ok")
}

func TestNormalizeHistoryDropsEmptyMargins(t *testing.T) {
	chunks := NormalizeHistory("\n\nplain output\n\n")
	if len(chunks) != 1 {
		t.Fatalf("expected one chunk, got %d", len(chunks))
	}
	assertChunk(t, chunks[0], "chunk_1", "output", "plain output")
}

func assertChunk(t *testing.T, chunk TranscriptChunk, id string, kind string, text string) {
	t.Helper()
	if chunk.ID != id || chunk.Kind != kind || chunk.Text != text {
		t.Fatalf("expected %s/%s/%q, got %#v", id, kind, text, chunk)
	}
}
