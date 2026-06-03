package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCreateTerminalTokenAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/terminal-token", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "token") {
		t.Fatalf("expected token response, got %s", rec.Body.String())
	}
}

func TestTerminalTokenIsSingleUse(t *testing.T) {
	store := newTerminalTokenStore()
	id := store.Create(terminalToken{HostID: "host", SessionName: "session", Password: "secret"})
	if _, ok := store.Consume(id); !ok {
		t.Fatal("expected token to be consumed")
	}
	if _, ok := store.Consume(id); ok {
		t.Fatal("expected token to be single-use")
	}
}
