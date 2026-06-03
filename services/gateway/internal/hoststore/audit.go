package hoststore

import (
	"context"
	"fmt"
	"time"
)

type AuditEvent struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"`
	HostID      string    `json:"hostId"`
	SessionName string    `json:"sessionName"`
	Message     string    `json:"message"`
	CreatedAt   time.Time `json:"createdAt"`
}

type LogAuditEventInput struct {
	Type        string
	HostID      string
	SessionName string
	Message     string
}

func (s *Store) LogAuditEvent(ctx context.Context, input LogAuditEventInput) (AuditEvent, error) {
	event := AuditEvent{
		ID:          newAuditEventID(),
		Type:        input.Type,
		HostID:      input.HostID,
		SessionName: input.SessionName,
		Message:     input.Message,
		CreatedAt:   time.Now().UTC(),
	}
	if event.Type == "" {
		return AuditEvent{}, fmt.Errorf("audit event type is required")
	}
	if _, err := s.db.ExecContext(ctx, insertAuditEventSQL, event.ID, event.Type, event.HostID, event.SessionName, event.Message, event.CreatedAt); err != nil {
		return AuditEvent{}, fmt.Errorf("insert audit event: %w", err)
	}
	return event, nil
}

func (s *Store) ListAuditEvents(ctx context.Context) ([]AuditEvent, error) {
	rows, err := s.db.QueryContext(ctx, listAuditEventsSQL)
	if err != nil {
		return nil, fmt.Errorf("list audit events: %w", err)
	}
	defer rows.Close()

	events := []AuditEvent{}
	for rows.Next() {
		var event AuditEvent
		if err := rows.Scan(&event.ID, &event.Type, &event.HostID, &event.SessionName, &event.Message, &event.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan audit event: %w", err)
		}
		events = append(events, event)
	}
	return events, rows.Err()
}
