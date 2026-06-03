package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
)

type fakeSSHRunner struct {
	command  string
	output   string
	password string
}

func (r *fakeSSHRunner) Run(_ context.Context, _ sshclient.HostConfig, credential sshclient.PasswordCredential, command string) ([]byte, error) {
	r.command = command
	r.password = credential.Password
	if r.output != "" {
		return []byte(r.output), nil
	}
	return []byte("muxchat-ok"), nil
}

func (r *fakeSSHRunner) ScanHostKey(_ context.Context, _ sshclient.HostConfig) (string, error) {
	return "SHA256:test", nil
}

func (r *fakeSSHRunner) StartTerminal(_ context.Context, _ sshclient.HostConfig, _ sshclient.PasswordCredential, _ string, _ sshclient.TerminalSize) (*sshclient.Terminal, error) {
	return nil, nil
}

func TestSSHProbe(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{}
	server.ssh = runner
	host := createTestHost(t, server.hosts)

	body := bytes.NewBufferString(`{"password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/ssh/probe", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "muxchat-ok") {
		t.Fatalf("expected probe output, got %s", rec.Body.String())
	}
	if runner.command != "printf muxchat-ok" {
		t.Fatalf("unexpected probe command %q", runner.command)
	}
}

func TestTrustHostKeyAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{}
	host := createTestHost(t, server.hosts)

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/ssh/trust", nil)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "SHA256:test") {
		t.Fatalf("expected fingerprint, got %s", rec.Body.String())
	}
}

func TestCreateSSHCredentialTokenAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTestHost(t, server.hosts)

	body := bytes.NewBufferString(`{"password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/ssh/credentials", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "token") {
		t.Fatalf("expected token response, got %s", rec.Body.String())
	}
	assertHostAuditEvent(t, server, "ssh.credential.created")
}

func TestSSHCredentialTokenRequiresPrincipal(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "other", Role: RoleOperator, Token: "other-token"},
	)
	server.ssh = &fakeSSHRunner{output: "$0\tdeploy\t1\t0\t1710000000\tzsh\t0\t\n"}
	host := createOwnedHost(t, server.hosts, "owner", "shared")
	token := server.credentialTokens.Create(credentialToken{
		HostID: host.ID, Password: "secret", Principal: "owner",
	})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", body)
	req.Header.Set("Authorization", "Bearer other-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func createTestHost(t *testing.T, store *hoststore.Store) hoststore.Host {
	t.Helper()
	host, err := store.CreateHost(context.Background(), hoststore.CreateHostInput{
		Name:     "local-dev",
		Hostname: "192.168.1.14",
		Port:     22001,
		Username: "binjie09",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}
	return host
}

func createTrustedTestHost(t *testing.T, server *Server) hoststore.Host {
	t.Helper()
	host := createTestHost(t, server.hosts)
	trusted, err := server.hosts.TrustHostKey(context.Background(), host.ID, "SHA256:test")
	if err != nil {
		t.Fatalf("TrustHostKey failed: %v", err)
	}
	return trusted
}

type testCredentialInput struct {
	hostID    string
	password  string
	principal string
}

func createCredentialTokenForTest(t *testing.T, server *Server, input testCredentialInput) string {
	t.Helper()
	password := input.password
	if password == "" {
		password = "secret"
	}
	principal := input.principal
	if principal == "" {
		principal = localDevPrincipal.Name
	}
	return server.credentialTokens.Create(credentialToken{
		HostID: input.hostID, Password: password, Principal: principal,
	})
}

func credentialTokenBody(token string) *bytes.Buffer {
	return bytes.NewBufferString(`{"credentialToken":"` + token + `"}`)
}
