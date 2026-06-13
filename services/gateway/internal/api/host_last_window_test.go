package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

func newLastWindowTestHost(t *testing.T, server *Server) hoststore.Host {
	t.Helper()
	body := bytes.NewBufferString(`{"name":"local-dev","hostname":"192.168.1.14","port":22001,"username":"binjie09","password":"secret"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts", body)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create host expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var host hoststore.Host
	if err := json.NewDecoder(rec.Body).Decode(&host); err != nil {
		t.Fatalf("decode host: %v", err)
	}
	return host
}

func TestGetHostLastWindowMissing(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := newLastWindowTestHost(t, server)

	rec := serveLastWindow(t, server, http.MethodGet, host.ID, "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 before save, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSaveAndGetHostLastWindow(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := newLastWindowTestHost(t, server)

	saveRec := serveLastWindow(t, server, http.MethodPost, host.ID, `{"sessionName":"deploy","windowIndex":3}`)
	if saveRec.Code != http.StatusOK {
		t.Fatalf("save expected 200, got %d: %s", saveRec.Code, saveRec.Body.String())
	}
	var saved hoststore.HostLastWindow
	if err := json.NewDecoder(saveRec.Body).Decode(&saved); err != nil {
		t.Fatalf("decode saved: %v", err)
	}
	if saved.SessionName != "deploy" || saved.WindowIndex != 3 || saved.HostID != host.ID {
		t.Fatalf("unexpected saved value: %#v", saved)
	}

	getRec := serveLastWindow(t, server, http.MethodGet, host.ID, "")
	if getRec.Code != http.StatusOK {
		t.Fatalf("get expected 200, got %d: %s", getRec.Code, getRec.Body.String())
	}
	var got hoststore.HostLastWindow
	if err := json.NewDecoder(getRec.Body).Decode(&got); err != nil {
		t.Fatalf("decode got: %v", err)
	}
	if got.SessionName != "deploy" || got.WindowIndex != 3 {
		t.Fatalf("unexpected got value: %#v", got)
	}

	updateRec := serveLastWindow(t, server, http.MethodPost, host.ID, `{"sessionName":"logs","windowIndex":1}`)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update expected 200, got %d: %s", updateRec.Code, updateRec.Body.String())
	}
	getRec = serveLastWindow(t, server, http.MethodGet, host.ID, "")
	var updated hoststore.HostLastWindow
	if err := json.NewDecoder(getRec.Body).Decode(&updated); err != nil {
		t.Fatalf("decode updated: %v", err)
	}
	if updated.SessionName != "logs" || updated.WindowIndex != 1 {
		t.Fatalf("expected upserted value, got %#v", updated)
	}
}

func TestSaveHostLastWindowRejectsInvalid(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := newLastWindowTestHost(t, server)

	rec := serveLastWindow(t, server, http.MethodPost, host.ID, `{"sessionName":"","windowIndex":0}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty session, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestGetHostLastWindowUnknownHost(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()

	rec := serveLastWindow(t, server, http.MethodGet, "does-not-exist", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown host, got %d: %s", rec.Code, rec.Body.String())
	}
}

func serveLastWindow(t *testing.T, server *Server, method string, hostID string, body string) *httptest.ResponseRecorder {
	t.Helper()
	var bodyReader io.Reader
	if body != "" {
		bodyReader = bytes.NewBufferString(body)
	}
	req := httptest.NewRequest(method, "/api/hosts/"+hostID+"/last-window", bodyReader)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	return rec
}
