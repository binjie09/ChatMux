package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

func TestServerAllowsUnauthenticatedTestMode(t *testing.T) {
	server := newAuthTestServer(t, "")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/hosts", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected optional auth to allow request, got %d", rec.Code)
	}
}

func TestGatewayAccessTokenProtectsAPI(t *testing.T) {
	server := newAuthTestServer(t, "secret-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/hosts", nil))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected unauthorized request to fail, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "gateway token is required") {
		t.Fatalf("expected auth error body, got %s", rec.Body.String())
	}
}

func TestGatewayAccessTokenAcceptsBearerToken(t *testing.T) {
	server := newAuthTestServer(t, "secret-token")
	req := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected bearer token to allow request, got %d", rec.Code)
	}
}

func TestGatewayMeReturnsPrincipal(t *testing.T) {
	server := newAuthTestServer(t, "secret-token")
	req := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	req.Header.Set("Authorization", "Bearer secret-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected me request to pass, got %d", rec.Code)
	}
	var principal Principal
	if err := json.NewDecoder(rec.Body).Decode(&principal); err != nil {
		t.Fatal(err)
	}
	if principal.Name != "gateway" || principal.Role != RoleAdmin {
		t.Fatalf("unexpected principal: %#v", principal)
	}
}

func TestViewerCanReadButCannotMutate(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "read-only", Role: RoleViewer, Token: "viewer-token"})
	assertAuthStatus(t, server, http.MethodGet, "/api/hosts", nil, "viewer-token", http.StatusOK)
	assertAuthStatus(t, server, http.MethodPost, "/api/hosts", hostBody(), "viewer-token", http.StatusForbidden)
	assertAuthStatus(t, server, http.MethodPatch, "/api/hosts/host_1", bytes.NewBufferString(`{"name":"blocked"}`), "viewer-token", http.StatusForbidden)
	assertAuthStatus(t, server, http.MethodDelete, "/api/hosts/host_1", nil, "viewer-token", http.StatusForbidden)
}

func TestOperatorCanMutateHosts(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "operator", Role: RoleOperator, Token: "operator-token"})

	assertAuthStatus(t, server, http.MethodPost, "/api/hosts", hostBody(), "operator-token", http.StatusCreated)
}

func TestGatewayAccessTokenAllowsPublicRoutes(t *testing.T) {
	server := newAuthTestServer(t, "secret-token")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("expected health route to stay public, got %d", rec.Code)
	}
}

func newAuthTestServer(t *testing.T, token string) *Server {
	t.Helper()
	store, err := hoststore.Open(filepath.Join(t.TempDir(), "chatmux-auth.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Fatal(err)
		}
	})
	return NewServer(store, WithGatewayAccessToken(token))
}

func newRoleTestServer(t *testing.T, users ...StaticUser) *Server {
	t.Helper()
	store, err := hoststore.Open(filepath.Join(t.TempDir(), "chatmux-rbac.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Fatal(err)
		}
	})
	return NewServer(store, WithStaticUsers(users))
}

func assertAuthStatus(t *testing.T, server *Server, method string, path string, body io.Reader, token string, want int) {
	t.Helper()
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)

	if rec.Code != want {
		t.Fatalf("expected %s %s to return %d, got %d: %s", method, path, want, rec.Code, rec.Body.String())
	}
}

func hostBody() *bytes.Buffer {
	return bytes.NewBufferString(`{"name":"local-dev","hostname":"127.0.0.1","port":22001,"username":"chatmux"}`)
}
