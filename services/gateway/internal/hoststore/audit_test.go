package hoststore

import (
	"context"
	"testing"
)

func TestLogAndListAuditEvents(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	created, err := store.LogAuditEvent(context.Background(), LogAuditEventInput{
		Type:        "tmux.session.created",
		HostID:      "host_1",
		SessionName: "deploy",
		Message:     "created tmux session",
	})
	if err != nil {
		t.Fatalf("LogAuditEvent failed: %v", err)
	}

	events, err := store.ListAuditEvents(context.Background())
	if err != nil {
		t.Fatalf("ListAuditEvents failed: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].ID != created.ID {
		t.Fatalf("expected event id %q, got %q", created.ID, events[0].ID)
	}
}
