package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

func TestListTmuxSessionsAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{
		output: strings.Join([]string{
			"session\t$0\tdeploy\t2\t0\t1710000000\tzsh\t0\t",
			"window\tdeploy\t@0\t0\tapi\t1\t1710000000\tzsh\t0\t",
			"window\tdeploy\t@1\t1\tworker\t0\t1710000000\tnode\t0\t",
		}, "\n"),
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
	if !strings.Contains(rec.Body.String(), `"windowList"`) || !strings.Contains(rec.Body.String(), `"worker"`) {
		t.Fatalf("expected window list, got %s", rec.Body.String())
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
	if !containsLoginShellFragment(runner.command, "capture-pane -p -t '=deploy:' -S -200") {
		t.Fatalf("expected default capture command, got %q", runner.command)
	}
}

func TestCreateTmuxSessionAPIAllowsUnicodeName(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{
		output: "$2\t部署\t1\t0\t1710000500\tzsh\t0\t\n",
	}
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"name":"部署","credentialToken":"` + token + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "部署") {
		t.Fatalf("expected unicode session, got %s", rec.Body.String())
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
	if !containsLoginShellFragment(runner.command, "capture-pane -p -e -C -t '=deploy:' -S -800") {
		t.Fatalf("expected ANSI capture command, got %q", runner.command)
	}
}

func TestCaptureTmuxHistoryAPITargetsWindow(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$ echo chatmux\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","windowIndex":1}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/history", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !containsLoginShellFragment(runner.command, "capture-pane -p -t '=deploy:1' -S -200") {
		t.Fatalf("expected window capture command, got %q", runner.command)
	}
}

func TestCaptureTmuxHistoryAPIAllowsUnicodeSessionPath(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$ echo chatmux\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/%E9%83%A8%E7%BD%B2/history", credentialTokenBody(token))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !containsLoginShellFragment(runner.command, "capture-pane -p -t '=部署:' -S -200") {
		t.Fatalf("expected unicode capture command, got %q", runner.command)
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

func TestCreateTmuxWindowAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: sessionWithWindowsOutput("deploy", []string{"api", "logs"})}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","name":"logs"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/windows", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !containsLoginShellFragment(runner.command, "new-window -d -t '=deploy:' -n 'logs'") {
		t.Fatalf("expected new-window command, got %q", runner.command)
	}
	if !strings.Contains(rec.Body.String(), `"logs"`) {
		t.Fatalf("expected refreshed window list, got %s", rec.Body.String())
	}
}

func TestRenameTmuxWindowAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: sessionWithWindowsOutput("deploy", []string{"api", "renamed"})}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","windowIndex":1,"name":"renamed"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/windows/rename", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !containsLoginShellFragment(runner.command, "rename-window -t '=deploy:1' 'renamed'") {
		t.Fatalf("expected rename-window command, got %q", runner.command)
	}
	if !strings.Contains(rec.Body.String(), `"renamed"`) {
		t.Fatalf("expected renamed window list, got %s", rec.Body.String())
	}
}

func TestDeleteTmuxWindowAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: sessionWithWindowsOutput("deploy", []string{"api"})}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","windowIndex":1}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/windows/delete", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !containsLoginShellFragment(runner.command, "kill-window -t '=deploy:1'") {
		t.Fatalf("expected kill-window command, got %q", runner.command)
	}
	if strings.Contains(rec.Body.String(), `"worker"`) {
		t.Fatalf("expected refreshed list without deleted window, got %s", rec.Body.String())
	}
}

func TestRenameTmuxSessionAPIUpdatesMetadata(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: sessionWithWindowsOutput("deploy2", []string{"api"})}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})
	if _, err := server.hosts.SaveSessionMetadata(testContext(t), hoststore.SaveSessionMetadataInput{
		HostID: host.ID, SessionName: "deploy", Tags: []string{"prod"}, Title: "Deploy shell",
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `","name":"deploy2"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/rename", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !containsLoginShellFragment(runner.command, "rename-session -t '=deploy' 'deploy2'") {
		t.Fatalf("expected rename-session command, got %q", runner.command)
	}
	if !strings.Contains(rec.Body.String(), "Deploy shell") {
		t.Fatalf("expected response to include renamed metadata, got %s", rec.Body.String())
	}
	metadata, err := server.hosts.GetSessionMetadata(testContext(t), host.ID, "deploy2")
	if err != nil {
		t.Fatalf("expected renamed metadata: %v", err)
	}
	if metadata.Title != "Deploy shell" {
		t.Fatalf("expected preserved title, got %#v", metadata)
	}
}

func sessionWithWindowsOutput(sessionName string, windows []string) string {
	lines := []string{"session\t$0\t" + sessionName + "\t" + strconv.Itoa(len(windows)) + "\t0\t1710000000\tzsh\t0\t"}
	for index, name := range windows {
		lines = append(lines, "window\t"+sessionName+"\t@"+strconv.Itoa(index)+"\t"+strconv.Itoa(index)+"\t"+name+"\t0\t1710000000\tzsh\t0\t")
	}
	return strings.Join(lines, "\n")
}
