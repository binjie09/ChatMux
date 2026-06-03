package sshclient

import (
	"context"
	"fmt"
	"net"
	"time"

	"golang.org/x/crypto/ssh"
)

const connectTimeout = 10 * time.Second

type HostConfig struct {
	Hostname string
	Port     int
	Username string
}

type PasswordCredential struct {
	Password string
}

type Client struct {
	dialContext func(context.Context, string, string) (net.Conn, error)
}

func NewClient() *Client {
	var dialer net.Dialer
	return &Client{dialContext: dialer.DialContext}
}

func (c *Client) Run(ctx context.Context, host HostConfig, credential PasswordCredential, command string) ([]byte, error) {
	config := ssh.ClientConfig{
		User:            host.Username,
		Auth:            []ssh.AuthMethod{ssh.Password(credential.Password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         connectTimeout,
	}

	addr := fmt.Sprintf("%s:%d", host.Hostname, host.Port)
	conn, err := c.dialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("dial ssh: %w", err)
	}
	defer conn.Close()

	sshConn, channels, requests, err := ssh.NewClientConn(conn, addr, &config)
	if err != nil {
		return nil, fmt.Errorf("handshake ssh: %w", err)
	}
	client := ssh.NewClient(sshConn, channels, requests)
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("open ssh session: %w", err)
	}
	defer session.Close()

	output, err := session.CombinedOutput(command)
	if err != nil {
		return nil, fmt.Errorf("run ssh command: %w", err)
	}
	return output, nil
}
