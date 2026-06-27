package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

func createHostForOrderTest(t *testing.T, server *Server, name string) {
	t.Helper()
	body := bytes.NewBufferString(`{"name":"` + name + `","hostname":"` + name + `.example","port":22,"username":"u","password":"p"}`)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/hosts", body))
	if rec.Code != http.StatusCreated {
		t.Fatalf("create host %s: expected 201, got %d: %s", name, rec.Code, rec.Body.String())
	}
}

func listHostsWithNames(t *testing.T, server *Server) []struct {
	ID   string
	Name string
} {
	t.Helper()
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/hosts", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("list hosts: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var hosts []hoststore.Host
	if err := json.Unmarshal(rec.Body.Bytes(), &hosts); err != nil {
		t.Fatalf("decode hosts: %v", err)
	}
	out := make([]struct {
		ID   string
		Name string
	}, len(hosts))
	for index, host := range hosts {
		out[index] = struct {
			ID   string
			Name string
		}{ID: host.ID, Name: host.Name}
	}
	return out
}

func TestReorderHostsAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	createHostForOrderTest(t, server, "alpha")
	createHostForOrderTest(t, server, "bravo")

	byName := map[string]string{}
	for _, host := range listHostsWithNames(t, server) {
		byName[host.Name] = host.ID
	}
	if len(byName) != 2 {
		t.Fatalf("expected 2 hosts, got %v", byName)
	}

	// Drag bravo above alpha.
	body := bytes.NewBufferString(`{"orderedIds":["` + byName["bravo"] + `","` + byName["alpha"] + `"]}`)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/hosts/order", body))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	ordered := listHostsWithNames(t, server)
	// The POST returns the reordered list; decode its body directly for the response check.
	var responseHosts []hoststore.Host
	if err := json.Unmarshal(rec.Body.Bytes(), &responseHosts); err != nil {
		t.Fatalf("decode reorder response: %v", err)
	}
	if len(responseHosts) != 2 || responseHosts[0].Name != "bravo" || responseHosts[1].Name != "alpha" {
		names := []string{}
		for _, h := range responseHosts {
			names = append(names, h.Name)
		}
		t.Fatalf("expected reordered [bravo alpha], got %v", names)
	}

	// A fresh list must keep the custom order (stable).
	if len(ordered) != 2 || ordered[0].Name != "bravo" || ordered[1].Name != "alpha" {
		names := []string{}
		for _, h := range ordered {
			names = append(names, h.Name)
		}
		t.Fatalf("expected stable [bravo alpha] after reorder, got %v", names)
	}
}
