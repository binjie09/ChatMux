package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

func TestCreateAndListHostsAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()

	body := bytes.NewBufferString(`{"name":"local-dev","hostname":"192.168.1.14","port":22001,"username":"binjie09"}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/hosts", body)
	createRec := httptest.NewRecorder()

	server.Handler().ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", createRec.Code, createRec.Body.String())
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	listRec := httptest.NewRecorder()
	server.Handler().ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", listRec.Code, listRec.Body.String())
	}

	var hosts []hoststore.Host
	if err := json.NewDecoder(listRec.Body).Decode(&hosts); err != nil {
		t.Fatalf("decode hosts: %v", err)
	}
	if len(hosts) != 1 {
		t.Fatalf("expected 1 host, got %d", len(hosts))
	}
	if hosts[0].Owner != localDevPrincipal.Name || !hosts[0].Shared {
		t.Fatalf("expected created host owner/shared fields, got %#v", hosts[0])
	}

	events, err := server.hosts.ListAuditEvents(testContext(t))
	if err != nil {
		t.Fatalf("ListAuditEvents failed: %v", err)
	}
	if len(events) != 1 || events[0].Type != "host.created" {
		t.Fatalf("expected host.created audit event, got %#v", events)
	}
}

func TestShareHostAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTestHost(t, server.hosts)

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/share", bytes.NewBufferString(`{"shared":false}`))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"shared":false`)) {
		t.Fatalf("expected private response, got %s", rec.Body.String())
	}
}

func TestListHostsFiltersPrivateHosts(t *testing.T) {
	server := newRoleTestServer(t,
		StaticUser{Name: "owner", Role: RoleViewer, Token: "owner-token"},
		StaticUser{Name: "reader", Role: RoleViewer, Token: "reader-token"},
	)
	privateHost := createOwnedHost(t, server.hosts, "owner", "private")
	if _, err := server.hosts.SetHostShared(testContext(t), privateHost.ID, false); err != nil {
		t.Fatalf("SetHostShared failed: %v", err)
	}
	createOwnedHost(t, server.hosts, "other", "shared")

	ownerHosts := listHostsWithToken(t, server, "owner-token")
	if len(ownerHosts) != 2 {
		t.Fatalf("expected owner to see two hosts, got %d", len(ownerHosts))
	}
	readerHosts := listHostsWithToken(t, server, "reader-token")
	if len(readerHosts) != 1 || !readerHosts[0].Shared {
		t.Fatalf("expected reader to see only shared host, got %#v", readerHosts)
	}
}

func TestPinHostAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTestHost(t, server.hosts)

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/pin", bytes.NewBufferString(`{"pinned":true}`))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !bytes.Contains(rec.Body.Bytes(), []byte(`"pinned":true`)) {
		t.Fatalf("expected pinned response, got %s", rec.Body.String())
	}
}

func TestDeleteHostAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTestHost(t, server.hosts)
	if _, err := server.hosts.SaveSessionMetadata(testContext(t), hoststore.SaveSessionMetadataInput{
		HostID: host.ID, SessionName: "deploy", Tags: []string{"ops"},
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/hosts/"+host.ID, nil)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", rec.Code, rec.Body.String())
	}
	if hosts := listHostsForTest(t, server); len(hosts) != 0 {
		t.Fatalf("expected deleted host to disappear, got %#v", hosts)
	}
	if items, err := server.hosts.ListSessionMetadata(testContext(t), host.ID); err != nil || len(items) != 0 {
		t.Fatalf("expected metadata removal, got %#v %v", items, err)
	}
	assertHostAuditEvent(t, server, "host.deleted")
}

func TestDeleteHostRequiresVisibility(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "ops", Role: RoleOperator, Token: "ops-token"})
	host := createOwnedHost(t, server.hosts, "owner", "private")
	if _, err := server.hosts.SetHostShared(testContext(t), host.ID, false); err != nil {
		t.Fatalf("SetHostShared failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/hosts/"+host.ID, nil)
	req.Header.Set("Authorization", "Bearer ops-token")
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func createOwnedHost(t *testing.T, store *hoststore.Store, owner string, name string) hoststore.Host {
	t.Helper()
	host, err := store.CreateHost(testContext(t), hoststore.CreateHostInput{
		Name:     name,
		Hostname: name + ".test",
		Username: "deploy",
		Owner:    owner,
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}
	return host
}

func listHostsForTest(t *testing.T, server *Server) []hoststore.Host {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var hosts []hoststore.Host
	if err := json.NewDecoder(rec.Body).Decode(&hosts); err != nil {
		t.Fatalf("decode hosts: %v", err)
	}
	return hosts
}

func listHostsWithToken(t *testing.T, server *Server, token string) []hoststore.Host {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var hosts []hoststore.Host
	if err := json.NewDecoder(rec.Body).Decode(&hosts); err != nil {
		t.Fatalf("decode hosts: %v", err)
	}
	return hosts
}

func assertHostAuditEvent(t *testing.T, server *Server, eventType string) {
	t.Helper()
	events, err := server.hosts.ListAuditEvents(testContext(t))
	if err != nil {
		t.Fatalf("ListAuditEvents failed: %v", err)
	}
	for _, event := range events {
		if event.Type == eventType {
			return
		}
	}
	t.Fatalf("expected audit event %q, got %#v", eventType, events)
}

func newTestServer(t *testing.T) (*Server, func()) {
	t.Helper()
	store, err := hoststore.Open(filepath.Join(t.TempDir(), "muxchat-test.db"))
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	return NewServer(store), func() {
		if err := store.Close(); err != nil {
			t.Fatalf("Close failed: %v", err)
		}
	}
}
