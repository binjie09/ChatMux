package hoststore

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

type SessionMetadata struct {
	HostID      string    `json:"hostId"`
	SessionName string    `json:"sessionName"`
	Title       string    `json:"title"`
	Tags        []string  `json:"tags"`
	Owner       string    `json:"owner"`
	SortOrder   *float64  `json:"-"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type SaveSessionMetadataInput struct {
	HostID      string
	SessionName string
	Title       string
	Tags        []string
	Owner       string
}

func (s *Store) SaveSessionMetadata(ctx context.Context, input SaveSessionMetadataInput) (SessionMetadata, error) {
	existing, err := s.existingSessionMetadata(ctx, input.HostID, input.SessionName)
	if err != nil {
		return SessionMetadata{}, err
	}
	metadata, encoded, err := newSessionMetadata(input, existing)
	if err != nil {
		return SessionMetadata{}, err
	}
	if _, err := s.db.ExecContext(ctx, upsertSessionMetadataSQL,
		metadata.HostID,
		metadata.SessionName,
		metadata.Title,
		encoded.tags,
		metadata.Owner,
		metadata.UpdatedAt,
	); err != nil {
		return SessionMetadata{}, fmt.Errorf("save session metadata: %w", err)
	}
	return metadata, nil
}

func (s *Store) ListSessionMetadata(ctx context.Context, hostID string) ([]SessionMetadata, error) {
	rows, err := s.db.QueryContext(ctx, listSessionMetadataSQL, hostID)
	if err != nil {
		return nil, fmt.Errorf("list session metadata: %w", err)
	}
	defer rows.Close()

	items := []SessionMetadata{}
	for rows.Next() {
		metadata, err := scanSessionMetadata(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, metadata)
	}
	return items, rows.Err()
}

// SaveSessionOrders persists explicit sort_order ranks for the given sessions
// in one transaction. The upsert only touches sort_order (and updated_at), so a
// session's title, tags, and owner are preserved. Sessions without an existing
// row are created with their column defaults.
func (s *Store) SaveSessionOrders(ctx context.Context, hostID string, orders []SessionOrderInput) error {
	if strings.TrimSpace(hostID) == "" {
		return errors.New("host id is required")
	}
	if len(orders) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin session order transaction: %w", err)
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	for _, order := range orders {
		if strings.TrimSpace(order.SessionName) == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, upsertSessionOrderSQL, hostID, order.SessionName, order.SortOrder, now); err != nil {
			return fmt.Errorf("save session order: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit session order transaction: %w", err)
	}
	return nil
}

type SessionOrderInput struct {
	SessionName string
	SortOrder   float64
}

func (s *Store) GetSessionMetadata(ctx context.Context, hostID string, sessionName string) (SessionMetadata, error) {
	row := s.db.QueryRowContext(ctx, getSessionMetadataSQL, hostID, sessionName)
	metadata, err := scanSessionMetadata(row)
	if err != nil {
		return SessionMetadata{}, fmt.Errorf("get session metadata: %w", err)
	}
	return metadata, nil
}

func (s *Store) RenameSessionMetadata(ctx context.Context, hostID string, oldName string, newName string) error {
	if strings.TrimSpace(hostID) == "" || strings.TrimSpace(oldName) == "" || strings.TrimSpace(newName) == "" {
		return errors.New("host id, old session name, and new session name are required")
	}
	if _, err := s.db.ExecContext(ctx, renameSessionMetadataSQL, newName, time.Now().UTC(), hostID, oldName); err != nil {
		return fmt.Errorf("rename session metadata: %w", err)
	}
	return nil
}

func (s *Store) DeleteSessionMetadata(ctx context.Context, hostID string, sessionName string) error {
	if strings.TrimSpace(hostID) == "" || strings.TrimSpace(sessionName) == "" {
		return errors.New("host id and session name are required")
	}
	if _, err := s.db.ExecContext(ctx, deleteSessionMetadataSQL, hostID, sessionName); err != nil {
		return fmt.Errorf("delete session metadata: %w", err)
	}
	return nil
}

func (s *Store) existingSessionMetadata(ctx context.Context, hostID string, sessionName string) (*SessionMetadata, error) {
	metadata, err := s.GetSessionMetadata(ctx, hostID, sessionName)
	if err == nil {
		return &metadata, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return nil, err
}

type encodedSessionMetadata struct {
	tags string
}

func newSessionMetadata(input SaveSessionMetadataInput, existing *SessionMetadata) (SessionMetadata, encodedSessionMetadata, error) {
	if input.HostID == "" || input.SessionName == "" {
		return SessionMetadata{}, encodedSessionMetadata{}, errors.New("host id and session name are required")
	}
	tags := normalizeTags(input.Tags)
	encoded, err := encodeSessionMetadata(tags)
	if err != nil {
		return SessionMetadata{}, encodedSessionMetadata{}, err
	}
	return SessionMetadata{
		HostID:      input.HostID,
		SessionName: input.SessionName,
		Title:       strings.TrimSpace(input.Title),
		Tags:        tags,
		Owner:       sessionMetadataOwner(input, existing),
		UpdatedAt:   time.Now().UTC(),
	}, encoded, nil
}

func scanSessionMetadata(row hostScanner) (SessionMetadata, error) {
	var metadata SessionMetadata
	var tagsJSON string
	var sortOrder sql.NullFloat64
	if err := row.Scan(
		&metadata.HostID,
		&metadata.SessionName,
		&metadata.Title,
		&tagsJSON,
		&metadata.Owner,
		&sortOrder,
		&metadata.UpdatedAt,
	); err != nil {
		return SessionMetadata{}, err
	}
	tags, err := decodeSessionStringList(tagsJSON, "tags")
	if err != nil {
		return SessionMetadata{}, err
	}
	metadata.Tags = tags
	if sortOrder.Valid {
		value := sortOrder.Float64
		metadata.SortOrder = &value
	}
	return metadata, nil
}

func sessionMetadataOwner(input SaveSessionMetadataInput, existing *SessionMetadata) string {
	if existing != nil {
		return existing.Owner
	}
	return normalizeOwner(input.Owner)
}

func encodeSessionMetadata(tags []string) (encodedSessionMetadata, error) {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return encodedSessionMetadata{}, fmt.Errorf("encode session tags: %w", err)
	}
	return encodedSessionMetadata{tags: string(tagsJSON)}, nil
}

func decodeSessionStringList(value string, field string) ([]string, error) {
	var items []string
	if err := json.Unmarshal([]byte(value), &items); err != nil {
		return nil, fmt.Errorf("decode session %s: %w", field, err)
	}
	if items == nil {
		return []string{}, nil
	}
	return items, nil
}

func normalizeTags(tags []string) []string {
	return normalizeStringList(tags)
}

func normalizeStringList(values []string) []string {
	seen := map[string]bool{}
	normalized := []string{}
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean == "" || seen[clean] {
			continue
		}
		seen[clean] = true
		normalized = append(normalized, clean)
	}
	return normalized
}
