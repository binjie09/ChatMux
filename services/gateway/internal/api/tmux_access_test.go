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

	teammateSessions := listTmuxSessionsWithToken(t, server, tmuxListAccessInput{
		hostID: host.ID, principal: "teammate", token: "teammate-token",
	})
	if len(teammateSessions) != 1 || teammateSessions[0].Name != "team" {
		t.Fatalf("expected teammate to see shared session only, got %#v", teammateSessions)
	}
	ownerSessions := listTmuxSessionsWithToken(t, server, tmuxListAccessInput{
		hostID: host.ID, principal: "owner", token: "owner-token",
	})
	if len(ownerSessions) != 2 {
		t.Fatalf("expected owner to see both sessions, got %#v", ownerSessions)
	}
}

func TestListTmuxSessionsAllowsCollaboratorGrant(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "teammate", Role: RoleOperator, Token: "teammate-token"},
	)
	server.ssh = &fakeSSHRunner{
		output: "$0\tcollab\t1\t0\t1710000000\tzsh\t0\t\n$1\tprivate\t1\t0\t1710000001\tzsh\t0\t\n",
	}
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")
	saveSessionAccess(t, server, sessionAccessInput{
		hostID: host.ID, owner: "owner", sessionName: "collab", collaborators: []string{"teammate"},
	})
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "private"})

	sessions := listTmuxSessionsWithToken(t, server, tmuxListAccessInput{
		hostID: host.ID, principal: "teammate", token: "teammate-token",
	})

	if len(sessions) != 1 || sessions[0].Name != "collab" {
		t.Fatalf("expected collaborator session only, got %#v", sessions)
	}
	assertStringList(t, sessions[0].Collaborators, []string{"teammate"})
}

func TestCreateTmuxSessionSavesPrivateOwnerMetadata(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"})
	server.ssh = &fakeSSHRunner{output: "$2\tnew-work\t1\t0\t1710000500\tzsh\t0\t\n"}
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")
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
	if session.Owner != "owner" || session.Shared {
		t.Fatalf("expected private owner metadata, got %#v", session)
	}
}

func TestCaptureTmuxHistoryRequiresSessionVisibility(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "teammate", Role: RoleOperator, Token: "teammate-token"},
	)
	runner := &fakeSSHRunner{output: "$ echo chatmux\n"}
	server.ssh = runner
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")
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
		t.Fatalf("expected no ssh command for invisible session, got %q", runner.command)
	}
}

func TestCaptureTmuxHistoryAllowsCollaboratorGrant(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "teammate", Role: RoleOperator, Token: "teammate-token"},
	)
	runner := &fakeSSHRunner{output: "$ echo chatmux\n"}
	server.ssh = runner
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")
	saveSessionAccess(t, server, sessionAccessInput{
		hostID: host.ID, owner: "owner", sessionName: "private", collaborators: []string{"teammate"},
	})
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID, principal: "teammate"})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/private/history", credentialTokenBody(token))
	req.Header.Set("Authorization", "Bearer teammate-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(runner.command, "capture-pane -p -t private -S -200") {
		t.Fatalf("expected capture-pane command, got %q", runner.command)
	}
}

func TestCollaboratorCannotSaveTmuxSessionMetadata(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"},
		StaticUser{Name: "teammate", Role: RoleOperator, Token: "teammate-token"},
	)
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")
	saveSessionAccess(t, server, sessionAccessInput{
		hostID: host.ID, owner: "owner", sessionName: "private", collaborators: []string{"teammate"},
	})

	body := bytes.NewBufferString(`{"title":"Nope","collaborators":[]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/private/metadata", body)
	req.Header.Set("Authorization", "Bearer teammate-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
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

func TestSaveTmuxSessionMetadataUpdatesCollaborators(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "owner", Role: RoleOperator, Token: "owner-token"})
	host := createOwnedHost(t, server.hosts, "owner", "shared-host")
	saveSessionAccess(t, server, sessionAccessInput{hostID: host.ID, owner: "owner", sessionName: "deploy"})

	body := bytes.NewBufferString(`{"collaborators":[" teammate ","qa","teammate",""]}`)
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
	assertStringList(t, session.Collaborators, []string{"teammate", "qa"})
}

type tmuxSessionAccessTest struct {
	Name          string   `json:"name"`
	Owner         string   `json:"owner"`
	Shared        bool     `json:"shared"`
	Collaborators []string `json:"collaborators"`
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
	hostID        string
	owner         string
	sessionName   string
	shared        bool
	collaborators []string
}

func saveSessionAccess(t *testing.T, server *Server, input sessionAccessInput) {
	t.Helper()
	var collaborators *[]string
	if input.collaborators != nil {
		collaborators = &input.collaborators
	}
	if _, err := server.hosts.SaveSessionMetadata(testContext(t), hoststore.SaveSessionMetadataInput{
		HostID: input.hostID, Owner: input.owner, SessionName: input.sessionName,
		Shared: &input.shared, Collaborators: collaborators,
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
