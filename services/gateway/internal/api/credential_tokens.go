package api

import (
	"sync"
	"time"

	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

const credentialTokenTTL = 30 * time.Minute

type credentialToken struct {
	Credential sshclient.Credential
	HostID     string
	Principal  string
	ExpiresAt  time.Time
}

type credentialTokenStore struct {
	mu     sync.Mutex
	tokens map[string]credentialToken
}

func newCredentialTokenStore() *credentialTokenStore {
	return &credentialTokenStore{tokens: map[string]credentialToken{}}
}

func (s *credentialTokenStore) Create(token credentialToken) string {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.deleteExpiredLocked(time.Now())
	id := newOpaqueToken()
	token.ExpiresAt = time.Now().Add(credentialTokenTTL)
	s.tokens[id] = token
	return id
}

func (s *credentialTokenStore) Get(id string) (credentialToken, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	token, ok := s.tokens[id]
	if !ok {
		return credentialToken{}, false
	}
	if time.Now().After(token.ExpiresAt) {
		delete(s.tokens, id)
		return credentialToken{}, false
	}
	return token, true
}

func (s *credentialTokenStore) deleteExpiredLocked(now time.Time) {
	for id, token := range s.tokens {
		if now.After(token.ExpiresAt) {
			delete(s.tokens, id)
		}
	}
}
