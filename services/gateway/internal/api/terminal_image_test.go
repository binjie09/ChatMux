package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUploadTerminalImageWritesRemoteFile(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","mimeType":"image/png","dataBase64":"Y2hhdG11eA=="}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/terminal-images", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.HasPrefix(runner.writePath, terminalImageUploadDir+"/chatmux-") || !strings.HasSuffix(runner.writePath, ".png") {
		t.Fatalf("unexpected remote path %q", runner.writePath)
	}
	if string(runner.writeData) != "chatmux" {
		t.Fatalf("unexpected uploaded data %q", string(runner.writeData))
	}
	var response terminalImageUploadResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.RemotePath != runner.writePath {
		t.Fatalf("expected response remote path %q, got %q", runner.writePath, response.RemotePath)
	}
	assertHostAuditEvent(t, server, "terminal.image.uploaded")
}

func TestUploadTerminalImageRejectsUnsupportedMimeType(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","mimeType":"text/plain","dataBase64":"Y2hhdG11eA=="}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/terminal-images", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}
