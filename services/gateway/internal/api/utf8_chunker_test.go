package api

import (
	"bytes"
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSafeUTF8Prefix(t *testing.T) {
	cjk := []byte{0xE4, 0xB8, 0xAD} // 你
	cases := []struct {
		name      string
		in        []byte
		safeLen   int
		tailLen   int
		validSafe bool // safe is expected to be valid UTF-8 (false only for stray-continuation fallout)
	}{
		{"empty", nil, 0, 0, true},
		{"ascii", []byte("AB"), 2, 0, true},
		{"lead_only", []byte{0xE4}, 0, 1, true},
		{"incomplete_2of3", []byte{0xE4, 0xB8}, 0, 2, true},
		{"complete_cjk", cjk, 3, 0, true},
		{"complete_plus_stray_lead", []byte{0xE4, 0xB8, 0xAD, 0xE4}, 3, 1, true},
		{"ascii_then_incomplete", []byte{'h', 'i', 0xE4, 0xB8}, 2, 2, true},
		{"four_byte_split", []byte{0xF0, 0x9F}, 0, 2, true},               // first half of 🎯
		{"all_continuation", []byte{0x80, 0x80, 0x80, 0x80}, 4, 0, false}, // unsalvageable → emit all (invalid by design)
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			safe, tail := safeUTF8Prefix(tc.in)
			if len(safe) != tc.safeLen {
				t.Fatalf("safe len = %d, want %d (safe=% x)", len(safe), tc.safeLen, safe)
			}
			if len(tail) != tc.tailLen {
				t.Fatalf("tail len = %d, want %d (tail=% x)", len(tail), tc.tailLen, tail)
			}
			if tc.safeLen > 0 && !bytes.Equal(safe, tc.in[:tc.safeLen]) {
				t.Errorf("safe is not the input prefix: safe=% x", safe)
			}
			if tc.validSafe && len(safe) > 0 && !utf8.Valid(safe) {
				t.Errorf("safe is not valid UTF-8: % x", safe)
			}
		})
	}
}

func TestUTF8ChunkerReassemblesSplitRune(t *testing.T) {
	// Push one 3-byte rune one byte at a time across three calls.
	var c utf8Chunker
	if got := c.push([]byte{0xE4}); len(got) != 0 {
		t.Fatalf("push(0xE4) should emit nothing, got % x", got)
	}
	if got := c.push([]byte{0xB8}); len(got) != 0 {
		t.Fatalf("push(0xB8) should emit nothing, got % x", got)
	}
	got := c.push([]byte{0xAD})
	if !bytes.Equal(got, []byte{0xE4, 0xB8, 0xAD}) {
		t.Fatalf("push(0xAD) should emit full rune, got % x", got)
	}
	if rem := c.flush(); len(rem) != 0 {
		t.Fatalf("flush after complete rune should be empty, got % x", rem)
	}
}

func TestUTF8ChunkerEveryEmitIsValid(t *testing.T) {
	want := "你好世界🎯abc"
	src := []byte(want)
	var c utf8Chunker
	var out bytes.Buffer
	for i := 0; i < len(src); i++ {
		emit := c.push(src[i : i+1]) // byte-by-byte: worst case split
		if len(emit) > 0 && !utf8.Valid(emit) {
			t.Fatalf("emit at byte %d not valid UTF-8: % x", i, emit)
		}
		out.Write(emit)
	}
	flushed := c.flush()
	if len(flushed) > 0 && !utf8.Valid(flushed) {
		t.Fatalf("flush not valid UTF-8: % x", flushed)
	}
	out.Write(flushed)
	if out.String() != want {
		t.Fatalf("reassembled %q, want %q", out.String(), want)
	}
}

func TestUTF8ChunkerStrayContinuationsEmitted(t *testing.T) {
	// All-continuation bytes cannot be rescued by future data, so the chunker
	// must emit them (rather than buffer forever) and clear pending.
	var c utf8Chunker
	emit := c.push([]byte{0x80, 0x80, 0x80})
	if !bytes.Equal(emit, []byte{0x80, 0x80, 0x80}) {
		t.Fatalf("stray continuations should be emitted as-is, got % x", emit)
	}
	if rem := c.flush(); len(rem) != 0 {
		t.Fatalf("pending should be empty, got % x", rem)
	}
}

func TestUTF8ChunkerEmptyAndFlush(t *testing.T) {
	var c utf8Chunker
	if got := c.push(nil); len(got) != 0 {
		t.Fatalf("push(nil) should emit nothing, got % x", got)
	}
	if got := c.push([]byte{}); len(got) != 0 {
		t.Fatalf("push(empty) should emit nothing, got % x", got)
	}
	if got := c.flush(); len(got) != 0 {
		t.Fatalf("flush on empty pending should return empty, got % x", got)
	}
}

func TestUTF8ChunkerASCIIFastPath(t *testing.T) {
	// Pure ASCII / complete runes must emit immediately with nothing buffered,
	// so the chunker adds no latency on the common path.
	var c utf8Chunker
	emit := c.push([]byte("hello"))
	if string(emit) != "hello" {
		t.Fatalf("pure ASCII should emit immediately, got %q", emit)
	}
	if len(c.pending) != 0 {
		t.Fatalf("pending should be empty after ASCII, got % x", c.pending)
	}
}

// appendFallbackBuffer lives in ssh_fallback_terminal.go but is the other half
// of the UTF-8 fix: its 256KB sliding-window trim must land on a rune boundary.
func TestAppendFallbackBufferTrimsOnRuneBoundary(t *testing.T) {
	rune3 := []byte{0xE4, 0xB8, 0xAD} // 你
	var buf []byte
	for len(buf) < fallbackSSHOutputBufferLimit+1024 {
		buf = append(buf, rune3...)
	}
	result := appendFallbackBuffer(nil, buf)
	if len(result) > fallbackSSHOutputBufferLimit {
		t.Fatalf("result not trimmed: %d bytes", len(result))
	}
	if !utf8.Valid(result) {
		t.Fatalf("trimmed buffer is not valid UTF-8 (head=% x)", result[:4])
	}
	if len(result) > 0 && !utf8.RuneStart(result[0]) {
		t.Fatalf("trimmed buffer does not start on rune boundary: % x", result[:4])
	}
	if strings.Contains(string(result), "�") {
		t.Fatalf("trimmed buffer contains U+FFFD")
	}
}
