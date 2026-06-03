package api

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

func TestGatewayAccessTokenIsOptional(t *testing.T) {
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
	store, err := hoststore.Open(filepath.Join(t.TempDir(), "muxchat-auth.db"))
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
