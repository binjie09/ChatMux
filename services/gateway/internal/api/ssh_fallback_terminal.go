package api

import (
	"io"
	"sync"
	"unicode/utf8"

	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

const fallbackSSHOutputBufferLimit = 256 * 1024

type sshFallbackTerminal struct {
	mu        sync.Mutex
	buffer    []byte
	closed    bool
	listeners map[*sshFallbackListener]struct{}
	terminal  *sshclient.Terminal
}

type sshFallbackListener struct {
	ch chan []byte
}

func newSSHFallbackTerminal(terminal *sshclient.Terminal) *sshFallbackTerminal {
	item := &sshFallbackTerminal{
		listeners: map[*sshFallbackListener]struct{}{},
		terminal:  terminal,
	}
	go item.drain(terminal.Stdout())
	go item.drain(terminal.Stderr())
	return item
}

func (t *sshFallbackTerminal) Stdin() io.Writer {
	return t.terminal.Stdin()
}

func (t *sshFallbackTerminal) Resize(size sshclient.TerminalSize) error {
	return t.terminal.Resize(size)
}

func (t *sshFallbackTerminal) Close() {
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return
	}
	t.closed = true
	t.closeListeners()
	t.mu.Unlock()
	_ = t.terminal.Close()
}

func (t *sshFallbackTerminal) isClosed() bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.closed
}

func (t *sshFallbackTerminal) Subscribe() (*sshFallbackListener, []byte) {
	listener := &sshFallbackListener{ch: make(chan []byte, 64)}
	t.mu.Lock()
	defer t.mu.Unlock()
	buffer := append([]byte(nil), t.buffer...)
	if t.closed {
		close(listener.ch)
		return listener, buffer
	}
	t.listeners[listener] = struct{}{}
	return listener, buffer
}

func (t *sshFallbackTerminal) Unsubscribe(listener *sshFallbackListener) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if _, ok := t.listeners[listener]; ok {
		delete(t.listeners, listener)
		close(listener.ch)
	}
}

func (t *sshFallbackTerminal) drain(reader io.Reader) {
	buffer := make([]byte, terminalBufferSize)
	for {
		count, err := reader.Read(buffer)
		if count > 0 {
			t.publish(buffer[:count])
		}
		if err != nil {
			t.Close()
			return
		}
	}
}

func (t *sshFallbackTerminal) publish(data []byte) {
	chunk := append([]byte(nil), data...)
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return
	}
	t.buffer = appendFallbackBuffer(t.buffer, chunk)
	t.publishLocked(chunk)
	t.mu.Unlock()
}

func (t *sshFallbackTerminal) closeListeners() {
	for listener := range t.listeners {
		close(listener.ch)
		delete(t.listeners, listener)
	}
}

func (t *sshFallbackTerminal) publishLocked(chunk []byte) {
	for listener := range t.listeners {
		select {
		case listener.ch <- chunk:
		default:
		}
	}
}

func appendFallbackBuffer(buffer []byte, data []byte) []byte {
	buffer = append(buffer, data...)
	if len(buffer) <= fallbackSSHOutputBufferLimit {
		return buffer
	}
	trimmed := append([]byte(nil), buffer[len(buffer)-fallbackSSHOutputBufferLimit:]...)
	// Drop leading bytes of any rune split by the byte-window trim so the
	// buffer always starts on a rune boundary and stays valid UTF-8.
	for len(trimmed) > 0 && !utf8.RuneStart(trimmed[0]) {
		trimmed = trimmed[1:]
	}
	return trimmed
}
