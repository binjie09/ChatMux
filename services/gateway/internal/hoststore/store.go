package hoststore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const defaultSSHPort = 22

type Host struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	Hostname           string    `json:"hostname"`
	Port               int       `json:"port"`
	Username           string    `json:"username"`
	Status             string    `json:"status"`
	HostKeyFingerprint string    `json:"hostKeyFingerprint"`
	Pinned             bool      `json:"pinned"`
	Owner              string    `json:"owner"`
	Shared             bool      `json:"shared"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type CreateHostInput struct {
	Name     string `json:"name"`
	Hostname string `json:"hostname"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Owner    string `json:"-"`
}

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	store := &Store{db: db}
	if err := store.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) ListHosts(ctx context.Context) ([]Host, error) {
	rows, err := s.db.QueryContext(ctx, listHostsSQL)
	if err != nil {
		return nil, fmt.Errorf("list hosts: %w", err)
	}
	defer rows.Close()

	hosts := []Host{}
	for rows.Next() {
		host, err := scanHost(rows)
		if err != nil {
			return nil, err
		}
		hosts = append(hosts, host)
	}
	return hosts, rows.Err()
}

func (s *Store) ListHostsVisibleTo(ctx context.Context, owner string) ([]Host, error) {
	rows, err := s.db.QueryContext(ctx, listVisibleHostsSQL, owner)
	if err != nil {
		return nil, fmt.Errorf("list visible hosts: %w", err)
	}
	defer rows.Close()

	hosts := []Host{}
	for rows.Next() {
		host, err := scanHost(rows)
		if err != nil {
			return nil, err
		}
		hosts = append(hosts, host)
	}
	return hosts, rows.Err()
}

func (s *Store) GetHost(ctx context.Context, id string) (Host, error) {
	row := s.db.QueryRowContext(ctx, getHostSQL, id)
	host, err := scanHost(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Host{}, ErrHostNotFound
	}
	if err != nil {
		return Host{}, fmt.Errorf("get host: %w", err)
	}
	return host, nil
}

func (s *Store) CreateHost(ctx context.Context, input CreateHostInput) (Host, error) {
	if err := validateCreateHost(input); err != nil {
		return Host{}, err
	}

	now := time.Now().UTC()
	host := Host{
		ID:        newHostID(),
		Name:      input.Name,
		Hostname:  input.Hostname,
		Port:      normalizePort(input.Port),
		Username:  input.Username,
		Status:    "offline",
		Owner:     normalizeOwner(input.Owner),
		Shared:    true,
		CreatedAt: now,
		UpdatedAt: now,
	}

	if _, err := s.db.ExecContext(ctx, insertHostSQL, host.ID, host.Name, host.Hostname, host.Port, host.Username, host.Status, host.HostKeyFingerprint, host.Pinned, host.Owner, host.Shared, host.CreatedAt, host.UpdatedAt); err != nil {
		return Host{}, fmt.Errorf("insert host: %w", err)
	}
	return host, nil
}

func (s *Store) SetHostPinned(ctx context.Context, id string, pinned bool) (Host, error) {
	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, setHostPinnedSQL, pinned, now, id)
	if err != nil {
		return Host{}, fmt.Errorf("set host pinned: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Host{}, fmt.Errorf("set host pinned affected rows: %w", err)
	}
	if affected == 0 {
		return Host{}, ErrHostNotFound
	}
	return s.GetHost(ctx, id)
}

func (s *Store) SetHostShared(ctx context.Context, id string, shared bool) (Host, error) {
	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, setHostSharedSQL, shared, now, id)
	if err != nil {
		return Host{}, fmt.Errorf("set host shared: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Host{}, fmt.Errorf("set host shared affected rows: %w", err)
	}
	if affected == 0 {
		return Host{}, ErrHostNotFound
	}
	return s.GetHost(ctx, id)
}

func (s *Store) TrustHostKey(ctx context.Context, id string, fingerprint string) (Host, error) {
	if fingerprint == "" {
		return Host{}, errors.New("fingerprint is required")
	}
	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, trustHostKeySQL, fingerprint, now, id)
	if err != nil {
		return Host{}, fmt.Errorf("trust host key: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Host{}, fmt.Errorf("trust host key affected rows: %w", err)
	}
	if affected == 0 {
		return Host{}, ErrHostNotFound
	}
	return s.GetHost(ctx, id)
}

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, createHostsTableSQL); err != nil {
		return fmt.Errorf("migrate hosts table: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, createAuditEventsTableSQL); err != nil {
		return fmt.Errorf("migrate audit events table: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, createSessionMetadataTableSQL); err != nil {
		return fmt.Errorf("migrate session metadata table: %w", err)
	}
	exists, err := s.columnExists(ctx, "hosts", "host_key_fingerprint")
	if err != nil {
		return err
	}
	if !exists {
		if _, err := s.db.ExecContext(ctx, addHostFingerprintSQL); err != nil {
			return fmt.Errorf("migrate host fingerprint: %w", err)
		}
	}
	exists, err = s.columnExists(ctx, "hosts", "pinned")
	if err != nil {
		return err
	}
	if !exists {
		if _, err := s.db.ExecContext(ctx, addHostPinnedSQL); err != nil {
			return fmt.Errorf("migrate host pinned: %w", err)
		}
	}
	exists, err = s.columnExists(ctx, "hosts", "owner")
	if err != nil {
		return err
	}
	if !exists {
		if _, err := s.db.ExecContext(ctx, addHostOwnerSQL); err != nil {
			return fmt.Errorf("migrate host owner: %w", err)
		}
	}
	exists, err = s.columnExists(ctx, "hosts", "shared")
	if err != nil {
		return err
	}
	if !exists {
		if _, err := s.db.ExecContext(ctx, addHostSharedSQL); err != nil {
			return fmt.Errorf("migrate host shared: %w", err)
		}
	}
	if err := s.migrateSessionMetadata(ctx); err != nil {
		return err
	}
	return nil
}

func (s *Store) migrateSessionMetadata(ctx context.Context) error {
	exists, err := s.columnExists(ctx, "session_metadata", "owner")
	if err != nil {
		return err
	}
	if !exists {
		if _, err := s.db.ExecContext(ctx, addSessionOwnerSQL); err != nil {
			return fmt.Errorf("migrate session owner: %w", err)
		}
	}
	exists, err = s.columnExists(ctx, "session_metadata", "shared")
	if err != nil {
		return err
	}
	if !exists {
		if _, err := s.db.ExecContext(ctx, addSessionSharedSQL); err != nil {
			return fmt.Errorf("migrate session shared: %w", err)
		}
	}
	return nil
}

func (s *Store) columnExists(ctx context.Context, table string, column string) (bool, error) {
	rows, err := s.db.QueryContext(ctx, "PRAGMA table_info("+table+")")
	if err != nil {
		return false, fmt.Errorf("inspect table columns: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, dataType string
		var notNull int
		var defaultValue any
		var pk int
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &pk); err != nil {
			return false, fmt.Errorf("scan table column: %w", err)
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

func validateCreateHost(input CreateHostInput) error {
	switch {
	case input.Name == "":
		return errors.New("name is required")
	case input.Hostname == "":
		return errors.New("hostname is required")
	case input.Username == "":
		return errors.New("username is required")
	case input.Port < 0 || input.Port > 65535:
		return errors.New("port must be between 0 and 65535")
	default:
		return nil
	}
}

func normalizePort(port int) int {
	if port == 0 {
		return defaultSSHPort
	}
	return port
}

func normalizeOwner(owner string) string {
	if owner == "" {
		return "local-dev"
	}
	return owner
}
