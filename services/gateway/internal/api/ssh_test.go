package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

type fakeSSHRunner struct {
	command          string
	credential       sshclient.Credential
	output           string
	outputForCommand func(string) string
	password         string
	privateKey       string
	writeData        []byte
	writePath        string
}

func (r *fakeSSHRunner) Run(_ context.Context, _ sshclient.HostConfig, credential sshclient.Credential, command string) ([]byte, error) {
	r.command = command
	r.credential = credential
	r.password = credential.Password
	r.privateKey = credential.PrivateKey
	if r.outputForCommand != nil {
		return []byte(r.outputForCommand(command)), nil
	}
	if r.output != "" {
		return []byte(r.output), nil
	}
	return []byte("chatmux-ok"), nil
}

func (r *fakeSSHRunner) ScanHostKey(_ context.Context, _ sshclient.HostConfig) (string, error) {
	return "SHA256:test", nil
}

func (r *fakeSSHRunner) StartTerminal(_ context.Context, _ sshclient.HostConfig, credential sshclient.Credential, command string, _ sshclient.TerminalSize) (*sshclient.Terminal, error) {
	r.command = command
	r.credential = credential
	r.password = credential.Password
	r.privateKey = credential.PrivateKey
	return nil, nil
}

func (r *fakeSSHRunner) WriteFile(_ context.Context, _ sshclient.HostConfig, credential sshclient.Credential, path string, data []byte) error {
	r.credential = credential
	r.password = credential.Password
	r.privateKey = credential.PrivateKey
	r.writePath = path
	r.writeData = append([]byte(nil), data...)
	return nil
}

type failingCommandRunner struct {
	*fakeSSHRunner
}

func (r failingCommandRunner) Run(
	ctx context.Context,
	host sshclient.HostConfig,
	credential sshclient.Credential,
	command string,
) ([]byte, error) {
	output, _ := r.fakeSSHRunner.Run(ctx, host, credential, command)
	return nil, sshclient.CommandError{Command: command, Output: string(output), Err: errors.New("exit status 127")}
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
	if !strings.Contains(rec.Body.String(), "chatmux-ok") {
		t.Fatalf("expected probe output, got %s", rec.Body.String())
	}
	if runner.command != "printf chatmux-ok" {
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

func TestCreateSSHCredentialTokenUsesSavedHostPassword(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host, err := server.hosts.CreateHost(context.Background(), hoststore.CreateHostInput{
		Name: "saved", Hostname: "saved.test", Username: "deploy", Password: "saved-secret",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/ssh/credentials", bytes.NewBufferString(`{}`))
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var response createSSHCredentialResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode credential response: %v", err)
	}
	token, ok := server.credentialTokens.Get(response.Token)
	if !ok || token.Credential.Kind != sshclient.CredentialKindPassword || token.Credential.Password != "saved-secret" {
		t.Fatalf("expected saved host credential token, got %#v ok=%v", token, ok)
	}
}

func TestCreateSSHCredentialTokenUsesSavedHostPrivateKey(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host, err := server.hosts.CreateHost(context.Background(), hoststore.CreateHostInput{
		Name: "saved-key", Hostname: "saved-key.test", Username: "deploy",
		SSHAuthMethod: hoststore.SSHAuthMethodPrivateKey, PrivateKey: "test-private-key", PrivateKeyPassphrase: "test-passphrase",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/ssh/credentials", bytes.NewBufferString(`{}`))
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var response createSSHCredentialResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode credential response: %v", err)
	}
	token, ok := server.credentialTokens.Get(response.Token)
	if !ok || token.Credential.Kind != sshclient.CredentialKindPrivateKey || token.Credential.PrivateKey != "test-private-key" {
		t.Fatalf("expected saved host private key token, got %#v ok=%v", token, ok)
	}
	if token.Credential.Passphrase != "test-passphrase" {
		t.Fatalf("expected saved private key passphrase")
	}
}

func TestCreateSSHCredentialTokenRequiresSavedHostCredential(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTestHost(t, server.hosts)

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/ssh/credentials", bytes.NewBufferString(`{}`))
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSSHCredentialTokenRequiresPrincipal(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "other", Role: RoleOperator, Token: "other-token"},
	)
	server.ssh = &fakeSSHRunner{output: "$0\tdeploy\t1\t0\t1710000000\tzsh\t0\t\n"}
	host := createOwnedHost(t, server.hosts, "owner", "owned")
	token := server.credentialTokens.Create(credentialToken{
		HostID: host.ID,
		Credential: sshclient.Credential{
			Kind: sshclient.CredentialKindPassword, Password: "secret",
		},
		Principal: "other",
	})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", body)
	req.Header.Set("Authorization", "Bearer owner-token")
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
	hostID     string
	password   string
	privateKey string
	principal  string
}

func createCredentialTokenForTest(t *testing.T, server *Server, input testCredentialInput) string {
	t.Helper()
	password := input.password
	if password == "" {
		password = "secret"
	}
	credential := sshclient.Credential{Kind: sshclient.CredentialKindPassword, Password: password}
	if input.privateKey != "" {
		credential = sshclient.Credential{Kind: sshclient.CredentialKindPrivateKey, PrivateKey: input.privateKey}
	}
	principal := input.principal
	if principal == "" {
		principal = localDevPrincipal.Name
	}
	return server.credentialTokens.Create(credentialToken{
		HostID: input.hostID, Credential: credential, Principal: principal,
	})
}

func credentialTokenBody(token string) *bytes.Buffer {
	return bytes.NewBufferString(`{"credentialToken":"` + token + `"}`)
}
