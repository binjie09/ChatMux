package sshclient

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

const connectTimeout = 10 * time.Second

type HostConfig struct {
	Hostname           string
	Port               int
	Username           string
	HostKeyFingerprint string
}

type CredentialKind string

const (
	CredentialKindPassword   CredentialKind = "password"
	CredentialKindPrivateKey CredentialKind = "private_key"
)

type Credential struct {
	Kind       CredentialKind
	Password   string
	PrivateKey string
	Passphrase string
}

type CommandError struct {
	Command string
	Output  string
	Err     error
}

func (e CommandError) Error() string {
	return fmt.Sprintf("run ssh command %q: %v: %s", e.Command, e.Err, e.Output)
}

func (e CommandError) Unwrap() error {
	return e.Err
}

type Client struct {
	dialContext func(context.Context, string, string) (net.Conn, error)

	mu   sync.Mutex
	pool map[string]*pooledConn
}

// pooledConn wraps a reused *ssh.Client for the Run hot path. The dead channel
// is closed by a watchConn goroutine once the underlying connection drops
// (remote idle timeout, network failure, or explicit close), so callers can
// detect and replace stale entries.
type pooledConn struct {
	client   *ssh.Client
	dead     chan struct{}
	lastUsed time.Time
}

func NewClient() *Client {
	var dialer net.Dialer
	return &Client{dialContext: dialer.DialContext, pool: map[string]*pooledConn{}}
}

func connKey(host HostConfig) string {
	return fmt.Sprintf("%s@%s:%d", host.Username, host.Hostname, host.Port)
}

func (c *Client) Run(ctx context.Context, host HostConfig, credential Credential, command string) ([]byte, error) {
	if host.HostKeyFingerprint == "" {
		return nil, errors.New("host key is not trusted")
	}

	entry, err := c.borrowConn(ctx, host, credential)
	if err != nil {
		return nil, err
	}
	output, runErr := runOnClient(entry.client, command)
	if runErr != nil {
		// The pooled connection may have dropped mid-use; evict it, rebuild once,
		// and retry. Run backs the read-only session-list polling path, so a retry
		// is safe.
		c.evictConn(connKey(host), entry)
		if retry, borrowErr := c.borrowConn(ctx, host, credential); borrowErr == nil {
			entry = retry
			output, runErr = runOnClient(entry.client, command)
		}
	}
	entry.lastUsed = time.Now()
	return output, runErr
}

// borrowConn returns a live pooled connection for host, dialing and caching a
// fresh one on miss. credential is only consulted when dialing a new
// connection; cached connections are reused regardless of credential.
func (c *Client) borrowConn(ctx context.Context, host HostConfig, credential Credential) (*pooledConn, error) {
	key := connKey(host)
	c.mu.Lock()
	if entry, ok := c.pool[key]; ok && !channelClosed(entry.dead) {
		c.mu.Unlock()
		return entry, nil
	}
	c.mu.Unlock()

	client, err := c.connect(ctx, host, credential)
	if err != nil {
		return nil, err
	}
	entry := &pooledConn{client: client, dead: make(chan struct{}), lastUsed: time.Now()}
	go c.watchConn(key, entry)

	c.mu.Lock()
	// Another goroutine may have raced ahead and cached a live connection; if so,
	// discard the one we just dialed and reuse the existing entry.
	if existing, dup := c.pool[key]; dup && !channelClosed(existing.dead) {
		c.mu.Unlock()
		_ = client.Close()
		return existing, nil
	}
	c.pool[key] = entry
	c.mu.Unlock()
	return entry, nil
}

// watchConn blocks until the underlying connection drops, then marks the entry
// dead, removes it from the pool, and closes the client.
func (c *Client) watchConn(key string, entry *pooledConn) {
	_ = entry.client.Wait()
	close(entry.dead)
	c.mu.Lock()
	if c.pool[key] == entry {
		delete(c.pool, key)
	}
	c.mu.Unlock()
	_ = entry.client.Close()
}

// evictConn removes a (likely dead) entry from the pool and closes its client.
// Closing the client lets the watchConn goroutine converge on the same state.
func (c *Client) evictConn(key string, entry *pooledConn) {
	c.mu.Lock()
	if c.pool[key] == entry {
		delete(c.pool, key)
	}
	c.mu.Unlock()
	_ = entry.client.Close()
}

func channelClosed(ch <-chan struct{}) bool {
	select {
	case <-ch:
		return true
	default:
		return false
	}
}

func runOnClient(client *ssh.Client, command string) ([]byte, error) {
	session, err := client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("open ssh session: %w", err)
	}
	defer session.Close()

	output, err := session.CombinedOutput(command)
	if err != nil {
		return nil, CommandError{Command: command, Output: string(output), Err: err}
	}
	return output, nil
}

func (c *Client) WriteFile(ctx context.Context, host HostConfig, credential Credential, path string, data []byte) error {
	if host.HostKeyFingerprint == "" {
		return errors.New("host key is not trusted")
	}
	if path == "" {
		return errors.New("remote path is required")
	}

	client, err := c.connect(ctx, host, credential)
	if err != nil {
		return err
	}
	defer client.Close()

	return writeRemoteFile(client, path, data)
}

func (c *Client) connect(ctx context.Context, host HostConfig, credential Credential) (*ssh.Client, error) {
	authMethod, err := authMethodForCredential(credential)
	if err != nil {
		return nil, err
	}
	config := ssh.ClientConfig{
		User:            host.Username,
		Auth:            []ssh.AuthMethod{authMethod},
		HostKeyCallback: verifyHostKey(host.HostKeyFingerprint),
		Timeout:         connectTimeout,
	}
	return c.dialSSH(ctx, host, &config)
}

func writeRemoteFile(client *ssh.Client, path string, data []byte) error {
	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("open ssh session: %w", err)
	}
	defer session.Close()

	stdin, err := session.StdinPipe()
	if err != nil {
		return fmt.Errorf("open remote file stdin: %w", err)
	}
	command := "umask 077; mkdir -p -- " + shellQuote(remoteDir(path)) + " && cat > " + shellQuote(path)
	if err := session.Start(command); err != nil {
		return fmt.Errorf("start remote file write: %w", err)
	}
	if _, err := io.Copy(stdin, bytes.NewReader(data)); err != nil {
		_ = stdin.Close()
		return fmt.Errorf("write remote file data: %w", err)
	}
	if err := stdin.Close(); err != nil {
		return fmt.Errorf("close remote file stdin: %w", err)
	}
	if err := session.Wait(); err != nil {
		return fmt.Errorf("finish remote file write: %w", err)
	}
	return nil
}

func remoteDir(path string) string {
	trimmed := strings.TrimRight(path, "/")
	index := strings.LastIndex(trimmed, "/")
	if index <= 0 {
		return "."
	}
	return trimmed[:index]
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func authMethodForCredential(credential Credential) (ssh.AuthMethod, error) {
	switch credential.Kind {
	case CredentialKindPassword:
		if credential.Password == "" {
			return nil, errors.New("ssh password is required")
		}
		return ssh.Password(credential.Password), nil
	case CredentialKindPrivateKey:
		return privateKeyAuthMethod(credential.PrivateKey, credential.Passphrase)
	default:
		return nil, fmt.Errorf("unsupported ssh credential kind: %s", credential.Kind)
	}
}

func privateKeyAuthMethod(privateKey string, passphrase string) (ssh.AuthMethod, error) {
	if privateKey == "" {
		return nil, errors.New("ssh private key is required")
	}
	signer, err := ssh.ParsePrivateKey([]byte(privateKey))
	if err != nil && passphrase != "" {
		signer, err = ssh.ParsePrivateKeyWithPassphrase([]byte(privateKey), []byte(passphrase))
	}
	if err != nil {
		return nil, fmt.Errorf("parse ssh private key: %w", err)
	}
	return ssh.PublicKeys(signer), nil
}

func (c *Client) ScanHostKey(ctx context.Context, host HostConfig) (string, error) {
	addr := fmt.Sprintf("%s:%d", host.Hostname, host.Port)
	conn, err := c.dialContext(ctx, "tcp", addr)
	if err != nil {
		return "", fmt.Errorf("dial ssh: %w", err)
	}
	defer conn.Close()

	var fingerprint string
	config := ssh.ClientConfig{
		User: host.Username,
		HostKeyCallback: func(_ string, _ net.Addr, key ssh.PublicKey) error {
			fingerprint = ssh.FingerprintSHA256(key)
			return nil
		},
		Timeout: connectTimeout,
	}
	sshConn, _, _, err := ssh.NewClientConn(conn, addr, &config)
	if err == nil {
		defer sshConn.Close()
	}
	if fingerprint == "" {
		return "", fmt.Errorf("scan ssh host key: %w", err)
	}
	return fingerprint, nil
}

func (c *Client) dialSSH(ctx context.Context, host HostConfig, config *ssh.ClientConfig) (*ssh.Client, error) {
	addr := fmt.Sprintf("%s:%d", host.Hostname, host.Port)
	conn, err := c.dialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("dial ssh: %w", err)
	}

	sshConn, channels, requests, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("handshake ssh: %w", err)
	}
	return ssh.NewClient(sshConn, channels, requests), nil
}

func verifyHostKey(expected string) ssh.HostKeyCallback {
	return func(_ string, _ net.Addr, key ssh.PublicKey) error {
		actual := ssh.FingerprintSHA256(key)
		if actual != expected {
			return fmt.Errorf("host key mismatch: expected %s got %s", expected, actual)
		}
		return nil
	}
}
