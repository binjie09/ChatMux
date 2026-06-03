package api

import (
	"bytes"
	"encoding/json"
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
		output: "$0\tdeploy\t2\t0\t1710000000\tzsh\t0\t\n",
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

func TestListTmuxSessionsFiltersPrivateSessions(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "teammate", Role: RoleOperator, Token: "teammate-token"},
	)
	server.ssh = &fakeSSHRunner{
		output: "$0\tteam\t1\t0\t1710000000\tzsh\t0\t\n$1\tprivate\t1\t0\t1710000001\tzsh\t0\t\n",
	}
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "team", shared: true})
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "private"})

	teammateSessions := listTmuxSessionsWithToken(t, server, tmuxListAccessInput{hostID: host.ID, token: "teammate-token"})
	if len(teammateSessions) != 1 || teammateSessions[0].Name != "team" {
		t.Fatalf("expected teammate to see shared session only, got %#v", teammateSessions)
	}
	ownerSessions := listTmuxSessionsWithToken(t, server, tmuxListAccessInput{hostID: host.ID, token: "owner-token"})
	if len(ownerSessions) != 2 {
		t.Fatalf("expected owner to see both sessions, got %#v", ownerSessions)
	}
}

func TestListTmuxSessionsAcceptsCredentialToken(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$0\tdeploy\t1\t0\t1710000000\tzsh\t0\t\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := server.credentialTokens.Create(credentialToken{
		HostID: host.ID, Password: "secret", Principal: "local-dev",
	})

	body := bytes.NewBufferString(`{"credentialToken":"` + token + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", body)
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

func TestCreateTmuxSessionAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.ssh = &fakeSSHRunner{
		output: "$2\tnew-work\t1\t0\t1710000500\tzsh\t0\t\n",
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
	if strings.Contains(rec.Body.String(), `"tags":null`) {
		t.Fatalf("expected empty tags array, got %s", rec.Body.String())
	}
}

func TestCreateTmuxSessionSavesPrivateOwnerMetadata(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"})
	server.ssh = &fakeSSHRunner{output: "$2\tnew-work\t1\t0\t1710000500\tzsh\t0\t\n"}
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")

	body := bytes.NewBufferString(`{"name":"new-work","password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions", body)
	req.Header.Set("Authorization", "Bearer owner-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var session tmuxSessionAccessTest
	if err := json.NewDecoder(rec.Body).Decode(&session); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	if session.Owner != "owner" || session.Shared {
		t.Fatalf("expected private owner metadata, got %#v", session)
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

func TestCaptureTmuxHistoryRequiresSessionVisibility(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "teammate", Role: RoleOperator, Token: "teammate-token"},
	)
	runner := &fakeSSHRunner{output: "$ echo muxchat\n"}
	server.ssh = runner
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "private"})

	body := bytes.NewBufferString(`{"password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/private/history", body)
	req.Header.Set("Authorization", "Bearer teammate-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
	if runner.command != "" {
		t.Fatalf("expected no ssh command for invisible session, got %q", runner.command)
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

func TestSaveTmuxSessionMetadataUpdatesShared(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"})
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "deploy"})

	body := bytes.NewBufferString(`{"title":"Deploy","shared":true}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/metadata", body)
	req.Header.Set("Authorization", "Bearer owner-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"shared":true`) {
		t.Fatalf("expected shared metadata response, got %s", rec.Body.String())
	}
}

type tmuxSessionAccessTest struct {
	Name   string `json:"name"`
	Owner  string `json:"owner"`
	Shared bool   `json:"shared"`
}

type tmuxListAccessInput struct {
	hostID string
	token  string
}

func listTmuxSessionsWithToken(t *testing.T, server *Server, input tmuxListAccessInput) []tmuxSessionAccessTest {
	t.Helper()
	body := bytes.NewBufferString(`{"password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+input.hostID+"/tmux/sessions/list", body)
	req.Header.Set("Authorization", "Bearer "+input.token)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var sessions []tmuxSessionAccessTest
	if err := json.NewDecoder(rec.Body).Decode(&sessions); err != nil {
		t.Fatalf("decode sessions: %v", err)
	}
	return sessions
}

type sessionAccessInput struct {
	hostID      string
	owner       string
	sessionName string
	shared      bool
}

func saveSessionAccess(t *testing.T, server *Server, input sessionAccessInput) {
	t.Helper()
	if _, err := server.hosts.SaveSessionMetadata(testContext(t), hoststore.SaveSessionMetadataInput{
		HostID: input.hostID, Owner: input.owner, SessionName: input.sessionName, Shared: &input.shared,
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}
}
