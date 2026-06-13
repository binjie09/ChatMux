package hoststore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// HostLastWindow records the most recently viewed session and window for a host
// so it can be restored when the host is selected again (synced across devices).
type HostLastWindow struct {
	HostID      string    `json:"hostId"`
	SessionName string    `json:"sessionName"`
	WindowIndex int       `json:"windowIndex"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type SaveHostLastWindowInput struct {
	HostID      string
	SessionName string
	WindowIndex int
}

var ErrLastWindowNotFound = errors.New("last window not found")

func (s *Store) SaveHostLastWindow(ctx context.Context, input SaveHostLastWindowInput) (HostLastWindow, error) {
	if strings.TrimSpace(input.HostID) == "" {
		return HostLastWindow{}, errors.New("host id is required")
	}
	if strings.TrimSpace(input.SessionName) == "" {
		return HostLastWindow{}, errors.New("session name is required")
	}
	if input.WindowIndex < 0 {
		return HostLastWindow{}, errors.New("window index must be non-negative")
	}
	lastWindow := HostLastWindow{
		HostID:      input.HostID,
		SessionName: strings.TrimSpace(input.SessionName),
		WindowIndex: input.WindowIndex,
		UpdatedAt:   time.Now().UTC(),
	}
	if _, err := s.db.ExecContext(ctx, upsertHostLastWindowSQL,
		lastWindow.HostID,
		lastWindow.SessionName,
		lastWindow.WindowIndex,
		lastWindow.UpdatedAt,
	); err != nil {
		return HostLastWindow{}, fmt.Errorf("save host last window: %w", err)
	}
	return lastWindow, nil
}

func (s *Store) GetHostLastWindow(ctx context.Context, hostID string) (HostLastWindow, error) {
	row := s.db.QueryRowContext(ctx, getHostLastWindowSQL, hostID)
	var lastWindow HostLastWindow
	if err := row.Scan(
		&lastWindow.HostID,
		&lastWindow.SessionName,
		&lastWindow.WindowIndex,
		&lastWindow.UpdatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return HostLastWindow{}, ErrLastWindowNotFound
		}
		return HostLastWindow{}, fmt.Errorf("get host last window: %w", err)
	}
	return lastWindow, nil
}
