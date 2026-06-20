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

func TestCreateTerminalTokenStoresWindowTarget(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)
	credentialID := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + credentialID + `","windowIndex":2}`)
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
	if token.Target.WindowIndex == nil || *token.Target.WindowIndex != 2 {
		t.Fatalf("expected window target 2, got %#v", token.Target)
	}
}

func TestCreateTerminalTokenStoresSSHFallbackMode(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{
		outputForCommand: func(command string) string {
			return "tmux not found in PATH, CHATMUX_TMUX_BIN, or $HOME/.local/bin\n"
		},
	}
	server.ssh = failingCommandRunner{fakeSSHRunner: runner}
	host := createTrustedTestHost(t, server)
	credentialID := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + credentialID + `","mode":"ssh","windowIndex":0}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/ssh/terminal-token", body)
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
	if token.Mode != terminalTokenModeSSH {
		t.Fatalf("expected ssh token mode, got %q", token.Mode)
	}
	if command, err := terminalCommand(token); err != nil || command != "" {
		t.Fatalf("expected default shell request command, got %q err=%v", command, err)
	}
}

func TestCreateTerminalTokenStoresSSHFallbackWindowTarget(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = missingTmuxRunner()
	host := createTrustedTestHost(t, server)
	credentialID := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})
	createFallbackWindowForTest(t, server, host.ID, credentialID, "logs")

	body := bytes.NewBufferString(`{"credentialToken":"` + credentialID + `","mode":"ssh","windowIndex":1}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/ssh/terminal-token", body)
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
	if token.Target.WindowIndex == nil || *token.Target.WindowIndex != 1 {
		t.Fatalf("expected fallback window target 1, got %#v", token.Target)
	}
}

func TestCreateTerminalTokenStoresSSHFallbackModeForUnsupportedLoginShell(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{
		outputForCommand: func(command string) string {
			return "'exec' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n"
		},
	}
	server.ssh = failingCommandRunner{fakeSSHRunner: runner}
	host := createTrustedTestHost(t, server)
	credentialID := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + credentialID + `","mode":"ssh","windowIndex":0}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/ssh/terminal-token", body)
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
	if token.Mode != terminalTokenModeSSH {
		t.Fatalf("expected ssh token mode, got %q", token.Mode)
	}
}

func TestCreateTerminalTokenKeepsNamedSSHSessionInTmuxMode(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)
	credentialID := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/ssh/terminal-token", credentialTokenBody(credentialID))
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
	if token.Mode != terminalTokenModeTmux {
		t.Fatalf("expected tmux token mode, got %q", token.Mode)
	}
	if command, err := terminalCommand(token); err != nil || !containsLoginShellFragment(command, "attach-session -t '=ssh:'") {
		t.Fatalf("expected tmux attach command, got %q err=%v", command, err)
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
