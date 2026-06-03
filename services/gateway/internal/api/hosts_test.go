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
