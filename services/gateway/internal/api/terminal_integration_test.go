package api

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
	"github.com/gorilla/websocket"
)

func TestIntegrationTerminalWebSocket(t *testing.T) {
	env := readTerminalIntegrationEnv(t)
	store, err := hoststore.Open(filepath.Join(t.TempDir(), "chatmux-terminal.db"))
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer store.Close()

	server := NewServer(store)
	host := createIntegrationHost(t, store, env)
	client := sshclient.NewClient()
	trustIntegrationHost(t, store, client, host, env)

	sessionName := "chatmux-ws-" + strconv.FormatInt(time.Now().Unix(), 10)
	createIntegrationSession(t, client, host, env, sessionName)
	defer killIntegrationSession(t, client, host, env, sessionName)

	httpServer := httptest.NewServer(server.Handler())
	defer httpServer.Close()
	token := server.terminalTokens.Create(terminalToken{
		HostID:      host.ID,
		SessionName: sessionName,
		Credential:  sshclient.Credential{Kind: sshclient.CredentialKindPassword, Password: env.Password},
	})

	conn := dialIntegrationTerminal(t, httpServer.URL, token)
	defer conn.Close()
	writeTerminalInputForTest(t, conn, "printf chatmux-terminal-ok\\n")
	waitForTerminalOutput(t, conn, "chatmux-terminal-ok")
}

type terminalIntegrationEnv struct {
	Host     string
	Port     int
	User     string
	Password string
}

func readTerminalIntegrationEnv(t *testing.T) terminalIntegrationEnv {
	t.Helper()
	host := os.Getenv("CHATMUX_TEST_SSH_HOST")
	user := os.Getenv("CHATMUX_TEST_SSH_USER")
	password := os.Getenv("CHATMUX_TEST_SSH_PASSWORD")
	if host == "" || user == "" || password == "" {
		t.Skip("set CHATMUX_TEST_SSH_HOST, CHATMUX_TEST_SSH_USER, and CHATMUX_TEST_SSH_PASSWORD")
	}
	return terminalIntegrationEnv{
		Host:     host,
		Port:     testIntegrationPort(t),
		User:     user,
		Password: password,
	}
}

func testIntegrationPort(t *testing.T) int {
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

func createIntegrationHost(t *testing.T, store *hoststore.Store, env terminalIntegrationEnv) hoststore.Host {
	t.Helper()
	host, err := store.CreateHost(context.Background(), hoststore.CreateHostInput{
		Name:     "integration",
		Hostname: env.Host,
		Port:     env.Port,
		Username: env.User,
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}
	return host
}

func trustIntegrationHost(t *testing.T, store *hoststore.Store, client *sshclient.Client, host hoststore.Host, env terminalIntegrationEnv) {
	t.Helper()
	fingerprint, err := client.ScanHostKey(context.Background(), hostToSSHConfig(host))
	if err != nil {
		t.Fatalf("ScanHostKey failed: %v", err)
	}
	if _, err := store.TrustHostKey(context.Background(), host.ID, fingerprint); err != nil {
		t.Fatalf("TrustHostKey failed: %v", err)
	}
}

func createIntegrationSession(t *testing.T, client *sshclient.Client, host hoststore.Host, env terminalIntegrationEnv, name string) {
	t.Helper()
	command, err := tmux.CreateSessionCommand(name)
	if err != nil {
		t.Fatalf("CreateSessionCommand failed: %v", err)
	}
	runIntegrationCommand(t, client, host, env, command)
}

func killIntegrationSession(t *testing.T, client *sshclient.Client, host hoststore.Host, env terminalIntegrationEnv, name string) {
	t.Helper()
	command, err := tmux.KillSessionCommand(name)
	if err != nil {
		t.Fatalf("KillSessionCommand failed: %v", err)
	}
	runIntegrationCommand(t, client, host, env, command)
}

func runIntegrationCommand(t *testing.T, client *sshclient.Client, host hoststore.Host, env terminalIntegrationEnv, command string) {
	t.Helper()
	trusted, err := client.ScanHostKey(context.Background(), hostToSSHConfig(host))
	if err != nil {
		t.Fatalf("ScanHostKey failed: %v", err)
	}
	config := hostToSSHConfig(host)
	config.HostKeyFingerprint = trusted
	_, err = client.Run(context.Background(), config, sshclient.Credential{Kind: sshclient.CredentialKindPassword, Password: env.Password}, command)
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
}

func dialIntegrationTerminal(t *testing.T, serverURL string, token string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + "/api/terminal?token=" + token
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}
	return conn
}

func writeTerminalInputForTest(t *testing.T, conn *websocket.Conn, data string) {
	t.Helper()
	message := terminalClientMessage{Type: "input", Data: data}
	if err := conn.WriteJSON(message); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}
}

func waitForTerminalOutput(t *testing.T, conn *websocket.Conn, expected string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(time.Now().Add(time.Second))
		var message terminalServerMessage
		if err := conn.ReadJSON(&message); err != nil {
			continue
		}
		data, _ := json.Marshal(message)
		if strings.Contains(string(data), expected) {
			return
		}
	}
	t.Fatalf("terminal output did not contain %q", expected)
}
