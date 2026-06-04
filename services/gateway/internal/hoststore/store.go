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

const (
	SSHAuthMethodPassword   = "password"
	SSHAuthMethodPrivateKey = "private_key"
)

type Host struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	Hostname           string    `json:"hostname"`
	Port               int       `json:"port"`
	Username           string    `json:"username"`
	Status             string    `json:"status"`
	HostKeyFingerprint string    `json:"hostKeyFingerprint"`
	SSHAuthMethod      string    `json:"sshAuthMethod"`
	SSHPassword        string    `json:"-"`
	SSHPrivateKey      string    `json:"-"`
	SSHKeyPassphrase   string    `json:"-"`
	HasPassword        bool      `json:"hasPassword"`
	HasCredential      bool      `json:"hasCredential"`
	Pinned             bool      `json:"pinned"`
	Owner              string    `json:"owner"`
	Shared             bool      `json:"shared"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type CreateHostInput struct {
	Name                 string `json:"name"`
	Hostname             string `json:"hostname"`
	Password             string `json:"password"`
	Port                 int    `json:"port"`
	PrivateKey           string `json:"privateKey"`
	PrivateKeyPassphrase string `json:"privateKeyPassphrase"`
	SSHAuthMethod        string `json:"sshAuthMethod"`
	Username             string `json:"username"`
	Owner                string `json:"-"`
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
		ID:               newHostID(),
		Name:             input.Name,
		Hostname:         input.Hostname,
		SSHAuthMethod:    normalizeSSHAuthMethod(input.SSHAuthMethod),
		SSHPassword:      input.Password,
		SSHPrivateKey:    input.PrivateKey,
		SSHKeyPassphrase: input.PrivateKeyPassphrase,
		Port:             normalizePort(input.Port),
		Username:         input.Username,
		Status:           "offline",
		Owner:            normalizeOwner(input.Owner),
		Shared:           true,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	host = normalizeHostCredential(host)

	if _, err := s.db.ExecContext(ctx, insertHostSQL, host.ID, host.Name, host.Hostname, host.Port, host.Username, host.Status, host.HostKeyFingerprint, host.SSHAuthMethod, host.SSHPassword, host.SSHPrivateKey, host.SSHKeyPassphrase, host.Pinned, host.Owner, host.Shared, host.CreatedAt, host.UpdatedAt); err != nil {
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
	case !validSSHAuthMethod(input.SSHAuthMethod):
		return errors.New("sshAuthMethod must be password or private_key")
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

func validSSHAuthMethod(method string) bool {
	return method == "" || method == SSHAuthMethodPassword || method == SSHAuthMethodPrivateKey
}

func normalizeSSHAuthMethod(method string) string {
	if method == "" {
		return SSHAuthMethodPassword
	}
	return method
}

func normalizeHostCredential(host Host) Host {
	host.SSHAuthMethod = normalizeSSHAuthMethod(host.SSHAuthMethod)
	if host.SSHAuthMethod == SSHAuthMethodPassword {
		host.SSHPrivateKey = ""
		host.SSHKeyPassphrase = ""
	}
	if host.SSHAuthMethod == SSHAuthMethodPrivateKey {
		host.SSHPassword = ""
	}
	host.HasPassword = host.SSHPassword != ""
	host.HasCredential = hostHasCredential(host)
	return host
}

func hostHasCredential(host Host) bool {
	if host.SSHAuthMethod == SSHAuthMethodPrivateKey {
		return host.SSHPrivateKey != ""
	}
	return host.SSHPassword != ""
}
