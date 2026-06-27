package hoststore

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const defaultSSHPort = 22

const (
	SSHAuthMethodPassword   = "password"
	SSHAuthMethodPrivateKey = "private_key"
)

const (
	HostStatusOffline    = "offline"
	HostStatusConnecting = "connecting"
	HostStatusOnline     = "online"
	HostStatusError      = "error"
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
	SortOrder          *float64  `json:"-"`
	Owner              string    `json:"owner"`
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sortHostsInPlace(hosts)
	return hosts, nil
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sortHostsInPlace(hosts)
	return hosts, nil
}

// sortHostsInPlace orders hosts pinned-first, then by their effective sort key
// (an explicit sort_order from drag-to-reorder, falling back to the creation
// time so the default order is stable), with name and id as final tiebreakers.
func sortHostsInPlace(hosts []Host) {
	sort.SliceStable(hosts, func(i int, j int) bool {
		if hosts[i].Pinned != hosts[j].Pinned {
			return hosts[i].Pinned
		}
		left, right := hostSortKey(hosts[i]), hostSortKey(hosts[j])
		if left != right {
			return left > right
		}
		if hosts[i].Name != hosts[j].Name {
			return hosts[i].Name < hosts[j].Name
		}
		return hosts[i].ID < hosts[j].ID
	})
}

func hostSortKey(host Host) float64 {
	if host.SortOrder != nil {
		return *host.SortOrder
	}
	return float64(host.CreatedAt.Unix())
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
		Status:           HostStatusOffline,
		Owner:            normalizeOwner(input.Owner),
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	host = normalizeHostCredential(host)

	if _, err := s.db.ExecContext(ctx, insertHostSQL, host.ID, host.Name, host.Hostname, host.Port, host.Username, host.Status, host.HostKeyFingerprint, host.SSHAuthMethod, host.SSHPassword, host.SSHPrivateKey, host.SSHKeyPassphrase, host.Pinned, host.Owner, host.CreatedAt, host.UpdatedAt); err != nil {
		return Host{}, fmt.Errorf("insert host: %w", err)
	}
	return host, nil
}

func (s *Store) SetHostStatus(ctx context.Context, id string, status string) (Host, error) {
	if !validHostStatus(status) {
		return Host{}, errors.New("host status must be offline, connecting, online, or error")
	}
	result, err := s.db.ExecContext(ctx, setHostStatusSQL, status, id)
	if err != nil {
		return Host{}, fmt.Errorf("set host status: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Host{}, fmt.Errorf("set host status affected rows: %w", err)
	}
	if affected == 0 {
		return Host{}, ErrHostNotFound
	}
	return s.GetHost(ctx, id)
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

// SaveHostOrders stamps explicit sort_order ranks for the given hosts in one
// transaction. The update is scoped to `owner` so a request can only reorder
// hosts the principal owns, and only touches sort_order (plus updated_at),
// preserving every other host field.
func (s *Store) SaveHostOrders(ctx context.Context, owner string, orders []HostOrderInput) error {
	if strings.TrimSpace(owner) == "" {
		return errors.New("owner is required")
	}
	if len(orders) == 0 {
		return nil
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin host order transaction: %w", err)
	}
	defer tx.Rollback()
	now := time.Now().UTC()
	for _, order := range orders {
		if strings.TrimSpace(order.HostID) == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, updateHostOrderSQL, order.SortOrder, now, order.HostID, owner); err != nil {
			return fmt.Errorf("save host order: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit host order transaction: %w", err)
	}
	return nil
}

type HostOrderInput struct {
	HostID    string
	SortOrder float64
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

func validHostStatus(status string) bool {
	return status == HostStatusOffline || status == HostStatusConnecting || status == HostStatusOnline || status == HostStatusError
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
