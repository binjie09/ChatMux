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
	runner := &fakeSSHRunner{output: "$ echo muxchat\n"}
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
