package api

import (
	"sync"
	"time"
)

const terminalTokenTTL = 2 * time.Minute

type terminalToken struct {
	HostID      string
	Recovering  bool
	SessionName string
	Password    string
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
