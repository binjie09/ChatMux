package sshclient

import (
	"context"
	"errors"
	"fmt"
	"net"
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

type PasswordCredential struct {
	Password string
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

func (c *Client) Run(ctx context.Context, host HostConfig, credential PasswordCredential, command string) ([]byte, error) {
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

func (c *Client) connect(ctx context.Context, host HostConfig, credential PasswordCredential) (*ssh.Client, error) {
	config := ssh.ClientConfig{
		User:            host.Username,
		Auth:            []ssh.AuthMethod{ssh.Password(credential.Password)},
		HostKeyCallback: verifyHostKey(host.HostKeyFingerprint),
		Timeout:         connectTimeout,
	}
	return c.dialSSH(ctx, host, &config)
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
