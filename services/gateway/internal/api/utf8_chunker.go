package api

import "unicode/utf8"

// safeUTF8Prefix splits b at the largest boundary that ends on a complete UTF-8
// rune. The returned safe slice is valid UTF-8 and safe to emit immediately;
// tail holds the trailing bytes of a rune that was split across reads and must
// be prepended to the next chunk before emitting.
//
// If no RuneStart byte is found within utf8.UTFMax bytes of the end, the
// trailing bytes are all stray continuation bytes that no future data can
// rescue, so the whole buffer is returned as safe and encoding/json renders
// each stray byte as U+FFFD.
func safeUTF8Prefix(b []byte) (safe, tail []byte) {
	for i := len(b) - 1; i >= 0 && len(b)-1-i < utf8.UTFMax; i-- {
		if utf8.RuneStart(b[i]) {
			if utf8.FullRune(b[i:]) {
				return b, nil
			}
			return b[:i], b[i:]
		}
	}
	return b, nil
}

// utf8Chunker reassembles UTF-8 text from byte slices that may be split at
// arbitrary boundaries (e.g. SSH channel reads). It buffers an incomplete
// trailing rune until the remaining bytes arrive, so every emitted slice is
// valid UTF-8 and never turns a split character into U+FFFD.
//
// Not safe for concurrent use: callers keep one per stream/connection.
type utf8Chunker struct {
	pending []byte
}

// push appends chunk to any buffered tail and returns the longest complete-rune
// prefix that is safe to emit now. The incomplete tail is retained internally.
func (c *utf8Chunker) push(chunk []byte) []byte {
	if len(c.pending) > 0 {
		c.pending = append(c.pending, chunk...)
		chunk = c.pending
	}
	safe, tail := safeUTF8Prefix(chunk)
	if len(tail) > 0 {
		// Copy so we don't keep the (possibly large) source buffer alive.
		c.pending = append([]byte(nil), tail...)
	} else {
		c.pending = nil
	}
	return safe
}

// flush returns any buffered bytes (e.g. at stream EOF) and clears the buffer.
// The result may be an incomplete rune; emitting it lets valid trailing runes
// render while truly truncated bytes degrade to U+FFFD, which beats silently
// dropping data.
func (c *utf8Chunker) flush() []byte {
	out := c.pending
	c.pending = nil
	return out
}
