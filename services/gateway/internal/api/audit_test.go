package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

func TestListAuditEventsAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()

	if _, err := server.hosts.LogAuditEvent(testContext(t), hoststore.LogAuditEventInput{Type: "host.created", HostID: "host_1"}); err != nil {
		t.Fatalf("LogAuditEvent failed: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/audit-events", nil)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var events []hoststore.AuditEvent
	if err := json.NewDecoder(rec.Body).Decode(&events); err != nil {
		t.Fatalf("decode events: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
}
