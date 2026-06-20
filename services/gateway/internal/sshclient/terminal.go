package sshclient

import (
	"context"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/ssh"
)

type TerminalSize struct {
	Cols int
	Rows int
}

type Terminal struct {
	client  *ssh.Client
	session *ssh.Session
	stdin   io.WriteCloser
	stdout  io.Reader
	stderr  io.Reader
}

func (c *Client) StartTerminal(ctx context.Context, host HostConfig, credential Credential, command string, size TerminalSize) (*Terminal, error) {
	if host.HostKeyFingerprint == "" {
		return nil, errors.New("host key is not trusted")
	}

	client, err := c.connect(ctx, host, credential)
	if err != nil {
		return nil, err
	}
	terminal, err := startTerminalSession(client, command, normalizeTerminalSize(size))
	if err != nil {
		client.Close()
		return nil, err
	}
	return terminal, nil
}

func (t *Terminal) Stdin() io.Writer {
	return t.stdin
}

func (t *Terminal) Stdout() io.Reader {
	return t.stdout
}

func (t *Terminal) Stderr() io.Reader {
	return t.stderr
}

func (t *Terminal) Resize(size TerminalSize) error {
	size = normalizeTerminalSize(size)
	return t.session.WindowChange(size.Rows, size.Cols)
}

func (t *Terminal) Close() error {
	_ = t.session.Close()
	return t.client.Close()
}

func startTerminalSession(client *ssh.Client, command string, size TerminalSize) (*Terminal, error) {
	session, err := client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("open ssh session: %w", err)
	}

	stdin, stdout, stderr, err := openTerminalPipes(session)
	if err != nil {
		_ = session.Close()
		return nil, err
	}
	if err := requestPty(session, size); err != nil {
		_ = session.Close()
		return nil, err
	}
	if err := startTerminalCommand(session, command); err != nil {
		_ = session.Close()
		return nil, err
	}
	return &Terminal{client: client, session: session, stdin: stdin, stdout: stdout, stderr: stderr}, nil
}

func startTerminalCommand(session *ssh.Session, command string) error {
	if command == "" {
		if err := session.Shell(); err != nil {
			return fmt.Errorf("start terminal shell: %w", err)
		}
		return nil
	}
	if err := session.Start(command); err != nil {
		return fmt.Errorf("start terminal command: %w", err)
	}
	return nil
}

func openTerminalPipes(session *ssh.Session) (io.WriteCloser, io.Reader, io.Reader, error) {
	stdin, err := session.StdinPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("open terminal stdin: %w", err)
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("open terminal stdout: %w", err)
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		return nil, nil, nil, fmt.Errorf("open terminal stderr: %w", err)
	}
	return stdin, stdout, stderr, nil
}

func requestPty(session *ssh.Session, size TerminalSize) error {
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", size.Rows, size.Cols, modes); err != nil {
		return fmt.Errorf("request pty: %w", err)
	}
	return nil
}

func normalizeTerminalSize(size TerminalSize) TerminalSize {
	if size.Cols <= 0 {
		size.Cols = 80
	}
	if size.Rows <= 0 {
		size.Rows = 24
	}
	return size
}
