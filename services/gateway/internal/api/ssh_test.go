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
	command string
}

func (r *fakeSSHRunner) Run(_ context.Context, _ sshclient.HostConfig, _ sshclient.PasswordCredential, command string) ([]byte, error) {
	r.command = command
	return []byte("muxchat-ok"), nil
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
