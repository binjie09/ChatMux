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
	HostID        string    `json:"hostId"`
	SessionName   string    `json:"sessionName"`
	Title         string    `json:"title"`
	Tags          []string  `json:"tags"`
	Owner         string    `json:"owner"`
	Shared        bool      `json:"shared"`
	Collaborators []string  `json:"collaborators"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type SaveSessionMetadataInput struct {
	HostID        string
	SessionName   string
	Title         string
	Tags          []string
	Owner         string
	Shared        *bool
	Collaborators *[]string
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
		metadata.Shared,
		encoded.collaborators,
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

func (s *Store) RenameSessionMetadata(ctx context.Context, hostID string, oldName string, newName string) error {
	if strings.TrimSpace(hostID) == "" || strings.TrimSpace(oldName) == "" || strings.TrimSpace(newName) == "" {
		return errors.New("host id, old session name, and new session name are required")
	}
	if _, err := s.db.ExecContext(ctx, renameSessionMetadataSQL, newName, time.Now().UTC(), hostID, oldName); err != nil {
		return fmt.Errorf("rename session metadata: %w", err)
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
	tags          string
	collaborators string
}

func newSessionMetadata(input SaveSessionMetadataInput, existing *SessionMetadata) (SessionMetadata, encodedSessionMetadata, error) {
	if input.HostID == "" || input.SessionName == "" {
		return SessionMetadata{}, encodedSessionMetadata{}, errors.New("host id and session name are required")
	}
	tags := normalizeTags(input.Tags)
	collaborators := sessionMetadataCollaborators(input, existing)
	encoded, err := encodeSessionMetadata(tags, collaborators)
	if err != nil {
		return SessionMetadata{}, encodedSessionMetadata{}, err
	}
	return SessionMetadata{
		HostID:        input.HostID,
		SessionName:   input.SessionName,
		Title:         strings.TrimSpace(input.Title),
		Tags:          tags,
		Owner:         sessionMetadataOwner(input, existing),
		Shared:        sessionMetadataShared(input, existing),
		Collaborators: collaborators,
		UpdatedAt:     time.Now().UTC(),
	}, encoded, nil
}

func scanSessionMetadata(row hostScanner) (SessionMetadata, error) {
	var metadata SessionMetadata
	var tagsJSON string
	var collaboratorsJSON string
	if err := row.Scan(
		&metadata.HostID,
		&metadata.SessionName,
		&metadata.Title,
		&tagsJSON,
		&metadata.Owner,
		&metadata.Shared,
		&collaboratorsJSON,
		&metadata.UpdatedAt,
	); err != nil {
		return SessionMetadata{}, err
	}
	tags, err := decodeSessionStringList(tagsJSON, "tags")
	if err != nil {
		return SessionMetadata{}, err
	}
	collaborators, err := decodeSessionStringList(collaboratorsJSON, "collaborators")
	if err != nil {
		return SessionMetadata{}, err
	}
	metadata.Tags = tags
	metadata.Collaborators = collaborators
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

func sessionMetadataCollaborators(input SaveSessionMetadataInput, existing *SessionMetadata) []string {
	if input.Collaborators != nil {
		return normalizePrincipalNames(*input.Collaborators)
	}
	if existing != nil {
		return existing.Collaborators
	}
	return []string{}
}

func encodeSessionMetadata(tags []string, collaborators []string) (encodedSessionMetadata, error) {
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return encodedSessionMetadata{}, fmt.Errorf("encode session tags: %w", err)
	}
	collaboratorsJSON, err := json.Marshal(collaborators)
	if err != nil {
		return encodedSessionMetadata{}, fmt.Errorf("encode session collaborators: %w", err)
	}
	return encodedSessionMetadata{tags: string(tagsJSON), collaborators: string(collaboratorsJSON)}, nil
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

func normalizePrincipalNames(principals []string) []string {
	return normalizeStringList(principals)
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
