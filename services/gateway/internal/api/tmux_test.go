package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

func TestListTmuxSessionsAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{
		output: "$0\tdeploy\t2\t0\t1710000000\n",
	}
	host := createTrustedTestHost(t, server)
	if _, err := server.hosts.SaveSessionMetadata(testContext(t), hoststore.SaveSessionMetadataInput{
		HostID: host.ID, SessionName: "deploy", Tags: []string{"prod"}, Title: "Deploy shell",
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}

	body := bytes.NewBufferString(`{"password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", body)
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

func TestCreateTmuxSessionAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{
		output: "$2\tnew-work\t1\t0\t1710000500\n",
	}
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"name":"new-work","password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "new-work") {
		t.Fatalf("expected new session, got %s", rec.Body.String())
	}
}

func TestCreateTmuxSessionRejectsUnsafeName(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"name":"bad;name","password":"secret"}`)
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
	server.ssh = &fakeSSHRunner{output: "$ echo muxchat\nmuxchat history\n"}
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/history", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	responseBody := rec.Body.String()
	if !strings.Contains(responseBody, "muxchat history") {
		t.Fatalf("expected history, got %s", responseBody)
	}
	if !strings.Contains(responseBody, `"chunks"`) || !strings.Contains(responseBody, `"kind":"command"`) {
		t.Fatalf("expected transcript chunks, got %s", responseBody)
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
