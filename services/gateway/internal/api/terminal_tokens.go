package api

import (
	"sync"
	"time"

	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
)

const terminalTokenTTL = 2 * time.Minute

const (
	terminalTokenModeTmux = "tmux"
	terminalTokenModeSSH  = "ssh"
)

type terminalToken struct {
	HostID      string
	Mode        string
	Recovering  bool
	SessionName string
	Target      tmux.Target
	Credential  sshclient.Credential
	ExpiresAt   time.Time
}

type terminalTokenStore struct {
	mu     sync.Mutex
	tokens map[string]terminalToken
}

func newTerminalTokenStore() *terminalTokenStore {
	return &terminalTokenStore{tokens: map[string]terminalToken{}}
}

func (s *terminalTokenStore) Create(token terminalToken) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := newOpaqueToken()
	token.ExpiresAt = time.Now().Add(terminalTokenTTL)
	s.tokens[id] = token
	return id
}

func (s *terminalTokenStore) Consume(id string) (terminalToken, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	token, ok := s.tokens[id]
	delete(s.tokens, id)
	if !ok || time.Now().After(token.ExpiresAt) {
		return terminalToken{}, false
	}
	return token, true
}
