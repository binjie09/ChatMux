package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

func decodeSessionNames(t *testing.T, body []byte) []string {
	t.Helper()
	var sessions []struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(body, &sessions); err != nil {
		t.Fatalf("decode sessions: %v", err)
	}
	names := make([]string, len(sessions))
	for index, session := range sessions {
		names[index] = session.Name
	}
	return names
}

func TestListTmuxSessionsOrdersByCreationTimeNewestFirst(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	// tmux lists "older" before "newer", but "newer" was created last.
	server.ssh = &fakeSSHRunner{output: strings.Join([]string{
		"session\t$0\tolder\t1\t0\t1700000000\tzsh\t0\t\t1700000000",
		"session\t$1\tnewer\t1\t0\t1710000000\tzsh\t0\t\t1710000000",
	}, "\n")}
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", credentialTokenBody(token))
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	names := decodeSessionNames(t, rec.Body.Bytes())
	if len(names) != 2 || names[0] != "newer" || names[1] != "older" {
		t.Fatalf("expected [newer older] (newest first), got %v", names)
	}
}

func TestReorderTmuxSessionsAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{output: strings.Join([]string{
		"session\t$0\talpha\t1\t0\t1700000000\tzsh\t0\t\t1700000000",
		"session\t$1\tbravo\t1\t0\t1710000000\tzsh\t0\t\t1710000000",
	}, "\n")}
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	// Default order is newest-first.
	listReq := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", credentialTokenBody(token))
	listRec := httptest.NewRecorder()
	server.Handler().ServeHTTP(listRec, listReq)
	if names := decodeSessionNames(t, listRec.Body.Bytes()); len(names) != 2 || names[0] != "bravo" || names[1] != "alpha" {
		t.Fatalf("expected default [bravo alpha], got %v", names)
	}

	// Drag alpha to the top.
	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","orderedNames":["alpha","bravo"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/order", body)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if names := decodeSessionNames(t, rec.Body.Bytes()); len(names) != 2 || names[0] != "alpha" || names[1] != "bravo" {
		t.Fatalf("expected reordered [alpha bravo], got %v", names)
	}

	// A fresh list must keep the custom order (stable across polls/reloads).
	listReq2 := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", credentialTokenBody(token))
	listRec2 := httptest.NewRecorder()
	server.Handler().ServeHTTP(listRec2, listReq2)
	if names := decodeSessionNames(t, listRec2.Body.Bytes()); len(names) != 2 || names[0] != "alpha" || names[1] != "bravo" {
		t.Fatalf("expected stable [alpha bravo] after reorder, got %v", names)
	}
}

func TestReorderTmuxSessionsPreservesMetadata(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{output: sessionWithWindowsOutput("alpha", []string{"shell"})}
	host := createTrustedTestHost(t, server)
	if _, err := server.hosts.SaveSessionMetadata(testContext(t), hoststore.SaveSessionMetadataInput{
		HostID: host.ID, SessionName: "alpha", Title: "Alpha shell", Tags: []string{"prod"},
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","orderedNames":["alpha"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/order", body)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	metadata, err := server.hosts.GetSessionMetadata(testContext(t), host.ID, "alpha")
	if err != nil {
		t.Fatalf("GetSessionMetadata failed: %v", err)
	}
	if metadata.Title != "Alpha shell" || len(metadata.Tags) != 1 || metadata.Tags[0] != "prod" {
		t.Fatalf("reorder clobbered metadata: %#v", metadata)
	}
	if metadata.SortOrder == nil {
		t.Fatalf("expected sort_order to be set after reorder")
	}
}

func TestMoveTmuxWindowAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: sessionWithWindowsOutput("deploy", []string{"api", "logs"})}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","windowIndex":1,"toWindowIndex":0,"swaps":[[1,0]]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/windows/move", body)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !containsLoginShellFragment(runner.command, "swap-window -s '=deploy:1' -t '=deploy:0'") {
		t.Fatalf("expected swap-window move command, got %q", runner.command)
	}
}
