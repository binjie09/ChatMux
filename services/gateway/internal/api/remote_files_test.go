package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

func TestResolveRemoteFilePathUsesTmuxCurrentPath(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "/srv/app\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","windowIndex":2}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/files/resolve", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !containsLoginShellFragment(runner.command, "display-message -p -t '=deploy:2' '#{pane_current_path}'") {
		t.Fatalf("expected tmux current path lookup, got %q", runner.command)
	}
	var response remoteFileResolveResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Path != "/srv/app" {
		t.Fatalf("expected /srv/app, got %q", response.Path)
	}
}

func TestListRemoteFilesSortsDirectoriesFirst(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{
		readRealPath: "/srv/app",
		readEntries: []sshclient.FileEntry{
			{Name: "z.log", Path: "/srv/app/z.log", Size: 9, Mode: "-rw-r--r--", ModTime: time.Unix(20, 0).UTC()},
			{Name: "api", Path: "/srv/app/api", Mode: "drwxr-xr-x", ModTime: time.Unix(10, 0).UTC(), IsDir: true},
		},
	}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","path":"/srv/app"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/files/list", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var response remoteFileListResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if runner.readPath != "/srv/app" || response.Path != "/srv/app" || response.Parent != "/srv" {
		t.Fatalf("unexpected paths read=%q response=%#v", runner.readPath, response)
	}
	if len(response.Entries) != 2 || !response.Entries[0].IsDir || response.Entries[0].Name != "api" {
		t.Fatalf("expected directory first, got %#v", response.Entries)
	}
}

func TestUploadRemoteFileWritesSelectedDirectory(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","directory":"/srv/app","fileName":"../release notes.txt","dataBase64":"Y2hhdG11eA=="}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/files/upload", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if runner.writePath != "/srv/app/release notes.txt" {
		t.Fatalf("unexpected write path %q", runner.writePath)
	}
	if string(runner.writeData) != "chatmux" {
		t.Fatalf("unexpected write data %q", string(runner.writeData))
	}
}

func TestDownloadRemoteFileReturnsAttachment(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{readData: []byte("downloaded")}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","path":"/srv/app/report.txt"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/files/download", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if runner.readPath != "/srv/app/report.txt" {
		t.Fatalf("unexpected read path %q", runner.readPath)
	}
	if !strings.Contains(rec.Header().Get("Content-Disposition"), "report.txt") {
		t.Fatalf("expected attachment filename, got %q", rec.Header().Get("Content-Disposition"))
	}
	if rec.Body.String() != "downloaded" {
		t.Fatalf("unexpected body %q", rec.Body.String())
	}
}

func TestDeleteRemoteFileDeletesSelectedPath(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","path":"/srv/app/report.txt"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/files/delete", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
	if runner.deletePath != "/srv/app/report.txt" {
		t.Fatalf("unexpected delete path %q", runner.deletePath)
	}
}
