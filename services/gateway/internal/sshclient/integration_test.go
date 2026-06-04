package sshclient

import (
	"context"
	"os"
	"strconv"
	"testing"
)

func TestIntegrationRunRemoteDiagnostic(t *testing.T) {
	host := os.Getenv("CHATMUX_TEST_SSH_HOST")
	user := os.Getenv("CHATMUX_TEST_SSH_USER")
	password := os.Getenv("CHATMUX_TEST_SSH_PASSWORD")
	if host == "" || user == "" || password == "" {
		t.Skip("set CHATMUX_TEST_SSH_HOST, CHATMUX_TEST_SSH_USER, and CHATMUX_TEST_SSH_PASSWORD")
	}

	port := testSSHPort(t)
	client := NewClient()
	config := HostConfig{Hostname: host, Port: port, Username: user}
	fingerprint, err := client.ScanHostKey(context.Background(), config)
	if err != nil {
		t.Fatalf("ScanHostKey failed: %v", err)
	}

	config.HostKeyFingerprint = fingerprint
	output, err := client.Run(context.Background(), config, Credential{Kind: CredentialKindPassword, Password: password}, remoteDiagnosticCommand())
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	t.Logf("remote diagnostic:\n%s", output)
}

func testSSHPort(t *testing.T) int {
	t.Helper()
	value := os.Getenv("CHATMUX_TEST_SSH_PORT")
	if value == "" {
		return 22
	}
	port, err := strconv.Atoi(value)
	if err != nil {
		t.Fatalf("invalid CHATMUX_TEST_SSH_PORT: %v", err)
	}
	return port
}

func remoteDiagnosticCommand() string {
	command := os.Getenv("CHATMUX_TEST_SSH_COMMAND")
	if command != "" {
		return command
	}
	return "printf 'shell=%s\\npath=%s\\n' \"$SHELL\" \"$PATH\"; " +
		"command -v tmux || true; " +
		"ls -l /usr/bin/tmux /usr/local/bin/tmux /bin/tmux ~/.local/bin/tmux 2>/dev/null || true"
}
