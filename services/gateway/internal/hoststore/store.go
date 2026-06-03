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
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Hostname  string    `json:"hostname"`
	Port      int       `json:"port"`
	Username  string    `json:"username"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type CreateHostInput struct {
	Name     string `json:"name"`
	Hostname string `json:"hostname"`
	Port     int    `json:"port"`
	Username string `json:"username"`
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
		CreatedAt: now,
		UpdatedAt: now,
	}

	if _, err := s.db.ExecContext(ctx, insertHostSQL, host.ID, host.Name, host.Hostname, host.Port, host.Username, host.Status, host.CreatedAt, host.UpdatedAt); err != nil {
		return Host{}, fmt.Errorf("insert host: %w", err)
	}
	return host, nil
}

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, createHostsTableSQL); err != nil {
		return fmt.Errorf("migrate hosts table: %w", err)
	}
	return nil
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
