package sshclient

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
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
}

func NewClient() *Client {
	var dialer net.Dialer
	return &Client{dialContext: dialer.DialContext}
}

func (c *Client) Run(ctx context.Context, host HostConfig, credential Credential, command string) ([]byte, error) {
	if host.HostKeyFingerprint == "" {
		return nil, errors.New("host key is not trusted")
	}

	client, err := c.connect(ctx, host, credential)
	if err != nil {
		return nil, err
	}
	defer client.Close()

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
