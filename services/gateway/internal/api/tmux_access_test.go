package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

func TestListTmuxSessionsRequiresHostOwnership(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "teammate", Role: RoleOperator, Token: "teammate-token"},
	)
	runner := &fakeSSHRunner{output: "$0\tprivate\t1\t0\t1710000001\tzsh\t0\t\n"}
	server.ssh = runner
	host := createOwnedHost(t, server.hosts, "owner", "private-host")
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID, principal: "teammate"})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/list", credentialTokenBody(token))
	req.Header.Set("Authorization", "Bearer teammate-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
	if runner.command != "" {
		t.Fatalf("expected no ssh command for foreign host, got %q", runner.command)
	}
}

func TestListTmuxSessionsAllowsOwner(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"})
	server.ssh = &fakeSSHRunner{
		output: "$0\tdeploy\t1\t0\t1710000000\tzsh\t0\t\n$1\tlogs\t1\t0\t1710000001\tzsh\t0\t\n",
	}
	host := createOwnedHost(t, server.hosts, "owner", "owned-host")
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "deploy"})
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "logs"})

	sessions := listTmuxSessionsWithToken(t, server, tmuxListAccessInput{
		hostID: host.ID, principal: "owner", token: "owner-token",
	})
	if len(sessions) != 2 {
		t.Fatalf("expected owner to see both sessions, got %#v", sessions)
	}
}

func TestCreateTmuxSessionSavesOwnerMetadata(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"})
	server.ssh = &fakeSSHRunner{output: "$2\tnew-work\t1\t0\t1710000500\tzsh\t0\t\n"}
	host := createOwnedHost(t, server.hosts, "owner", "owned-host")
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID, principal: "owner"})

	body := bytes.NewBufferString(`{"name":"new-work","credentialToken":"` + token + `"}`)
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
	if session.Owner != "owner" {
		t.Fatalf("expected owner metadata, got %#v", session)
	}
}

func TestCaptureTmuxHistoryRequiresHostOwnership(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "teammate", Role: RoleOperator, Token: "teammate-token"},
	)
	runner := &fakeSSHRunner{output: "$ echo chatmux\n"}
	server.ssh = runner
	host := createOwnedHost(t, server.hosts, "owner", "private-host")
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "private"})
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID, principal: "teammate"})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/private/history", credentialTokenBody(token))
	req.Header.Set("Authorization", "Bearer teammate-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
	if runner.command != "" {
		t.Fatalf("expected no ssh command for foreign host, got %q", runner.command)
	}
}

func TestNonOwnerCannotSaveTmuxSessionMetadata(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "teammate", Role: RoleOperator, Token: "teammate-token"},
	)
	host := createOwnedHost(t, server.hosts, "owner", "private-host")
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "private"})

	body := bytes.NewBufferString(`{"title":"Nope"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/private/metadata", body)
	req.Header.Set("Authorization", "Bearer teammate-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSaveTmuxSessionMetadataUpdatesTitleAndTags(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"})
	host := createOwnedHost(t, server.hosts, "owner", "owned-host")
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "deploy"})

	body := bytes.NewBufferString(`{"title":"Deploy","tags":[" prod ","deploy","prod"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/metadata", body)
	req.Header.Set("Authorization", "Bearer owner-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var session tmuxSessionAccessTest
	if err := json.NewDecoder(rec.Body).Decode(&session); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	if session.Title != "Deploy" {
		t.Fatalf("expected updated title, got %#v", session)
	}
	assertStringList(t, session.Tags, []string{"prod", "deploy"})
}

type tmuxSessionAccessTest struct {
	Name  string   `json:"name"`
	Owner string   `json:"owner"`
	Tags  []string `json:"tags"`
	Title string   `json:"title"`
}

type tmuxListAccessInput struct {
	hostID    string
	principal string
	token     string
}

func listTmuxSessionsWithToken(t *testing.T, server *Server, input tmuxListAccessInput) []tmuxSessionAccessTest {
	t.Helper()
	credentialToken := createCredentialTokenForTest(t, server, testCredentialInput{
		hostID: input.hostID, principal: input.principal,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+input.hostID+"/tmux/sessions/list", credentialTokenBody(credentialToken))
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
}

func saveSessionAccess(t *testing.T, server *Server, input sessionAccessInput) {
	t.Helper()
	if _, err := server.hosts.SaveSessionMetadata(testContext(t), hoststore.SaveSessionMetadataInput{
		HostID: input.hostID, Owner: input.owner, SessionName: input.sessionName,
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}
}

func assertStringList(t *testing.T, actual []string, expected []string) {
	t.Helper()
	if len(actual) != len(expected) {
		t.Fatalf("expected list %#v, got %#v", expected, actual)
	}
	for index, item := range expected {
		if actual[index] != item {
			t.Fatalf("expected list %#v, got %#v", expected, actual)
		}
	}
}
