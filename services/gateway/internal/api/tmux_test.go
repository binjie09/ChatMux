package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

func TestListTmuxSessionsAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{
		output: "$0\tdeploy\t2\t0\t1710000000\tzsh\t0\t\n",
	}
	host := createTrustedTestHost(t, server)
	if _, err := server.hosts.SaveSessionMetadata(testContext(t), hoststore.SaveSessionMetadataInput{
		HostID: host.ID, SessionName: "deploy", Tags: []string{"prod"}, Title: "Deploy shell",
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", credentialTokenBody(token))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "deploy") {
		t.Fatalf("expected deploy session, got %s", rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Deploy shell") || !strings.Contains(rec.Body.String(), "prod") {
		t.Fatalf("expected session metadata, got %s", rec.Body.String())
	}
}

func TestListTmuxSessionsAcceptsCredentialToken(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$0\tdeploy\t1\t0\t1710000000\tzsh\t0\t\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", credentialTokenBody(token))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if runner.password != "secret" {
		t.Fatalf("expected credential token password, got %q", runner.password)
	}
}

func TestListTmuxSessionsRejectsInvalidCredentialToken(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"credentialToken":"missing"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestListTmuxSessionsRejectsPasswordBody(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$0\tdeploy\t1\t0\t1710000000\tzsh\t0\t\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if runner.command != "" {
		t.Fatalf("expected no ssh command for password body, got %q", runner.command)
	}
}

func TestCreateTmuxSessionAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{
		output: "$2\tnew-work\t1\t0\t1710000500\tzsh\t0\t\n",
	}
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"name":"new-work","credentialToken":"` + token + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "new-work") {
		t.Fatalf("expected new session, got %s", rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), `"tags":null`) {
		t.Fatalf("expected empty tags array, got %s", rec.Body.String())
	}
}

func TestCreateTmuxSessionRejectsUnsafeName(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"name":"bad;name","credentialToken":"` + token + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestCaptureTmuxHistoryAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$ echo chatmux\nchatmux history\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/history", credentialTokenBody(token))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	responseBody := rec.Body.String()
	if !strings.Contains(responseBody, "chatmux history") {
		t.Fatalf("expected history, got %s", responseBody)
	}
	if !strings.Contains(responseBody, `"chunks"`) || !strings.Contains(responseBody, `"kind":"command"`) {
		t.Fatalf("expected transcript chunks, got %s", responseBody)
	}
	if !strings.Contains(runner.command, "capture-pane -p -t deploy -S -200") {
		t.Fatalf("expected default capture command, got %q", runner.command)
	}
}

func TestCaptureTmuxHistoryAPIWithScrollbackOptions(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "\x1b[31mred\x1b[0m\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","lines":800,"preserveAnsi":true}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/history", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(runner.command, "capture-pane -p -e -C -t deploy -S -800") {
		t.Fatalf("expected ANSI capture command, got %q", runner.command)
	}
}

func TestSaveTmuxSessionMetadataAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"title":"Deploy shell","tags":["prod","deploy"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/metadata", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "Deploy shell") || !strings.Contains(rec.Body.String(), "prod") {
		t.Fatalf("expected saved metadata, got %s", rec.Body.String())
	}
}
