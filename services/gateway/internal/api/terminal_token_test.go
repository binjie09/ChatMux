package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

func TestCreateTerminalTokenAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)
	credentialID := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/terminal-token", credentialTokenBody(credentialID))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "token") {
		t.Fatalf("expected token response, got %s", rec.Body.String())
	}
}

func TestCreateTerminalTokenRejectsPasswordBody(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/terminal-token", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCreateTerminalTokenAcceptsCredentialToken(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)
	credentialID := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/terminal-token", credentialTokenBody(credentialID))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "token") {
		t.Fatalf("expected token response, got %s", rec.Body.String())
	}
}

func TestCreateTerminalTokenStoresRecoveryFlag(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)
	credentialID := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + credentialID + `","recovering":true}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/terminal-token", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var response createTerminalTokenResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	token, ok := server.terminalTokens.Consume(response.Token)
	if !ok {
		t.Fatal("expected terminal token to be stored")
	}
	if !token.Recovering {
		t.Fatal("expected recovery flag to be stored")
	}
}

func TestTerminalConnectionAuditEventUsesRecoveryType(t *testing.T) {
	event := terminalConnectionAuditEvent(terminalToken{
		HostID: "host_1", Recovering: true, SessionName: "deploy",
	})

	if event.Type != "terminal.recovered" {
		t.Fatalf("expected terminal.recovered, got %s", event.Type)
	}
	if event.Message != "recovered terminal" {
		t.Fatalf("expected recovery message, got %s", event.Message)
	}
}

func TestTerminalTokenIsSingleUse(t *testing.T) {
	store := newTerminalTokenStore()
	id := store.Create(terminalToken{
		HostID: "host", SessionName: "session",
		Credential: sshclient.Credential{Kind: sshclient.CredentialKindPassword, Password: "secret"},
	})
	if _, ok := store.Consume(id); !ok {
		t.Fatal("expected token to be consumed")
	}
	if _, ok := store.Consume(id); ok {
		t.Fatal("expected token to be single-use")
	}
}
