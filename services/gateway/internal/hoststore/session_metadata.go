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
	Shared      bool      `json:"shared"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type SaveSessionMetadataInput struct {
	HostID      string
	SessionName string
	Title       string
	Tags        []string
	Owner       string
	Shared      *bool
}

func (s *Store) SaveSessionMetadata(ctx context.Context, input SaveSessionMetadataInput) (SessionMetadata, error) {
	existing, err := s.existingSessionMetadata(ctx, input.HostID, input.SessionName)
	if err != nil {
		return SessionMetadata{}, err
	}
	metadata, tagsJSON, err := newSessionMetadata(input, existing)
	if err != nil {
		return SessionMetadata{}, err
	}
	if _, err := s.db.ExecContext(ctx, upsertSessionMetadataSQL,
		metadata.HostID,
		metadata.SessionName,
		metadata.Title,
		tagsJSON,
		metadata.Owner,
		metadata.Shared,
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

func (s *Store) GetSessionMetadata(ctx context.Context, hostID string, sessionName string) (SessionMetadata, error) {
	row := s.db.QueryRowContext(ctx, getSessionMetadataSQL, hostID, sessionName)
	metadata, err := scanSessionMetadata(row)
	if err != nil {
		return SessionMetadata{}, fmt.Errorf("get session metadata: %w", err)
	}
	return metadata, nil
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

func newSessionMetadata(input SaveSessionMetadataInput, existing *SessionMetadata) (SessionMetadata, string, error) {
	if input.HostID == "" || input.SessionName == "" {
		return SessionMetadata{}, "", errors.New("host id and session name are required")
	}
	tags := normalizeTags(input.Tags)
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return SessionMetadata{}, "", fmt.Errorf("encode session tags: %w", err)
	}
	return SessionMetadata{
		HostID:      input.HostID,
		SessionName: input.SessionName,
		Title:       strings.TrimSpace(input.Title),
		Tags:        tags,
		Owner:       sessionMetadataOwner(input, existing),
		Shared:      sessionMetadataShared(input, existing),
		UpdatedAt:   time.Now().UTC(),
	}, string(tagsJSON), nil
}

func scanSessionMetadata(row hostScanner) (SessionMetadata, error) {
	var metadata SessionMetadata
	var tagsJSON string
	if err := row.Scan(
		&metadata.HostID,
		&metadata.SessionName,
		&metadata.Title,
		&tagsJSON,
		&metadata.Owner,
		&metadata.Shared,
		&metadata.UpdatedAt,
	); err != nil {
		return SessionMetadata{}, err
	}
	if err := json.Unmarshal([]byte(tagsJSON), &metadata.Tags); err != nil {
		return SessionMetadata{}, fmt.Errorf("decode session tags: %w", err)
	}
	if metadata.Tags == nil {
		metadata.Tags = []string{}
	}
	return metadata, nil
}

func sessionMetadataOwner(input SaveSessionMetadataInput, existing *SessionMetadata) string {
	if existing != nil {
		return existing.Owner
	}
	return normalizeOwner(input.Owner)
}

func sessionMetadataShared(input SaveSessionMetadataInput, existing *SessionMetadata) bool {
	if input.Shared != nil {
		return *input.Shared
	}
	if existing != nil {
		return existing.Shared
	}
	return false
}

func normalizeTags(tags []string) []string {
	seen := map[string]bool{}
	normalized := []string{}
	for _, tag := range tags {
		clean := strings.TrimSpace(tag)
		if clean == "" || seen[clean] {
			continue
		}
		seen[clean] = true
		normalized = append(normalized, clean)
	}
	return normalized
}
