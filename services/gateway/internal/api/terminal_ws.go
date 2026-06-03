package api

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
	"github.com/muxchat/muxchat/services/gateway/internal/tmux"
)

const terminalBufferSize = 4096

var terminalUpgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool {
		return true
	},
}

type terminalClientMessage struct {
	Type   string `json:"type"`
	Data   string `json:"data,omitempty"`
	Source string `json:"source,omitempty"`
	Cols   int    `json:"cols,omitempty"`
	Rows   int    `json:"rows,omitempty"`
}

type terminalServerMessage struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
}

type terminalInputContext struct {
	request  *http.Request
	conn     *websocket.Conn
	terminal *sshclient.Terminal
	token    terminalToken
}

func (s *Server) handleTerminalWebSocket(w http.ResponseWriter, r *http.Request) {
	token, ok := s.terminalTokens.Consume(r.URL.Query().Get("token"))
	if !ok {
		writeError(w, http.StatusUnauthorized, errors.New("terminal token is invalid or expired"))
		return
	}

	conn, err := terminalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	s.runTerminal(r, conn, token)
}

func (s *Server) runTerminal(r *http.Request, conn *websocket.Conn, token terminalToken) {
	terminal, err := s.openTerminal(r, token)
	if err != nil {
		writeTerminalError(conn, err)
		return
	}
	defer terminal.Close()
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "terminal.connected", HostID: token.HostID, SessionName: token.SessionName, Message: "connected terminal"}); err != nil {
		writeTerminalError(conn, err)
		return
	}

	done := make(chan struct{})
	writer := &terminalWriter{conn: conn}
	go streamTerminalOutput(writer, terminal.Stdout(), done)
	go streamTerminalOutput(writer, terminal.Stderr(), done)
	s.readTerminalInput(terminalInputContext{
		request:  r,
		conn:     conn,
		terminal: terminal,
		token:    token,
	})
	close(done)
}

func (s *Server) openTerminal(r *http.Request, token terminalToken) (*sshclient.Terminal, error) {
	host, err := s.hosts.GetHost(r.Context(), token.HostID)
	if errors.Is(err, hoststore.ErrHostNotFound) {
		return nil, err
	}
	if err != nil {
		return nil, err
	}

	command, err := tmux.AttachSessionCommand(token.SessionName)
	if err != nil {
		return nil, err
	}
	return s.ssh.StartTerminal(r.Context(), hostToSSHConfig(host), sshclient.PasswordCredential{Password: token.Password}, command, sshclient.TerminalSize{})
}

type terminalWriter struct {
	mu   sync.Mutex
	conn *websocket.Conn
}

func (w *terminalWriter) WriteJSON(payload any) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.conn.WriteJSON(payload)
}

func streamTerminalOutput(writer *terminalWriter, reader io.Reader, done <-chan struct{}) {
	buffer := make([]byte, terminalBufferSize)
	for {
		select {
		case <-done:
			return
		default:
		}
		count, err := reader.Read(buffer)
		if count > 0 {
			message := terminalServerMessage{Type: "output", Data: string(buffer[:count])}
			if writer.WriteJSON(message) != nil {
				return
			}
		}
		if err != nil {
			return
		}
	}
}

func (s *Server) readTerminalInput(ctx terminalInputContext) {
	for {
		var message terminalClientMessage
		if err := ctx.conn.ReadJSON(&message); err != nil {
			return
		}
		if message.Type == "resize" {
			_ = ctx.terminal.Resize(sshclient.TerminalSize{Cols: message.Cols, Rows: message.Rows})
			continue
		}
		if message.Type == "input" {
			if !s.allowTerminalInput(ctx, message) {
				continue
			}
			_, _ = io.WriteString(ctx.terminal.Stdin(), message.Data)
		}
	}
}

func (s *Server) allowTerminalInput(ctx terminalInputContext, message terminalClientMessage) bool {
	if message.Source != "composer" {
		return true
	}
	decision := s.commandPolicy.Evaluate(message.Data)
	if !decision.Allowed {
		_ = s.logAudit(ctx.request.Context(), hoststore.LogAuditEventInput{
			Type: "terminal.input.blocked", HostID: ctx.token.HostID, SessionName: ctx.token.SessionName,
			Message: "blocked composer input by command policy: " + decision.Pattern,
		})
		writeTerminalError(ctx.conn, errors.New("command policy blocked composer input"))
		return false
	}
	s.logComposerInput(ctx, message, decision)
	return true
}

func (s *Server) logComposerInput(ctx terminalInputContext, message terminalClientMessage, decision commandPolicyDecision) {
	eventType := "terminal.input.recorded"
	auditMessage := fmt.Sprintf("recorded composer input (%d bytes)", len(message.Data))
	if decision.Pattern != "" {
		eventType = "terminal.input.policy_match"
		auditMessage = fmt.Sprintf("recorded composer input policy match (%d bytes): %s", len(message.Data), decision.Pattern)
	}
	_ = s.logAudit(ctx.request.Context(), hoststore.LogAuditEventInput{
		Type: eventType, HostID: ctx.token.HostID, SessionName: ctx.token.SessionName,
		Message: auditMessage,
	})
}

func writeTerminalError(conn *websocket.Conn, err error) {
	_ = writeTerminalJSON(conn, terminalServerMessage{Type: "error", Data: err.Error()})
}

func writeTerminalJSON(conn *websocket.Conn, payload any) error {
	return conn.WriteJSON(payload)
}
