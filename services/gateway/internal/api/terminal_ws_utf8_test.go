package api

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
)

// fixedStepReader returns data in fixed-size slices, mimicking an SSH channel
// that can split a stream at an arbitrary byte boundary (including mid-rune).
type fixedStepReader struct {
	data []byte
	pos  int
	step int
}

func (r *fixedStepReader) Read(p []byte) (int, error) {
	if r.pos >= len(r.data) {
		return 0, io.EOF
	}
	end := r.pos + r.step
	if end > len(r.data) {
		end = len(r.data)
	}
	n := copy(p, r.data[r.pos:end])
	r.pos = end
	return n, nil
}

// TestStreamTerminalOutputPreservesUTF8 reproduces the mid-rune split bug: when
// the upstream reader cuts a multi-byte UTF-8 rune across Read boundaries, the
// output forwarded over the WebSocket must still reconstruct the original text
// rather than emitting U+FFFD replacement characters. It must FAIL before the
// utf8Chunker fix lands.
func TestStreamTerminalOutputPreservesUTF8(t *testing.T) {
	const want = "你好世界🎯" // 3-byte CJK runes + a 4-byte emoji
	for _, step := range []int{1, 2, 3, 4, 7} {
		step := step
		t.Run(fmt.Sprintf("step=%d", step), func(t *testing.T) {
			got := collectStreamedOutput(t, []byte(want), step)
			if got != want {
				t.Fatalf("streamed output lost/garbled data\ngot:  %q\nwant: %q", got, want)
			}
			if strings.Contains(got, "�") {
				t.Fatalf("streamed output contains U+FFFD replacement char: %q", got)
			}
		})
	}
}

func collectStreamedOutput(t *testing.T, data []byte, step int) string {
	t.Helper()
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		writer := &terminalWriter{conn: conn}
		done := make(chan struct{})
		streamTerminalOutput(writer, &fixedStepReader{data: data, step: step}, done)
	}))
	defer srv.Close()

	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	var sb strings.Builder
	for {
		var msg terminalServerMessage
		if err := conn.ReadJSON(&msg); err != nil {
			break
		}
		if msg.Type == "output" {
			sb.WriteString(msg.Data)
		}
	}
	return sb.String()
}
