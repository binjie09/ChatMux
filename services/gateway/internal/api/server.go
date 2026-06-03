package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
)

type Server struct {
	gatewayAccessToken string
	hosts              *hoststore.Store
	ssh                sshRunner
	terminalTokens     *terminalTokenStore
}

type ServerOption func(*Server)

func WithGatewayAccessToken(token string) ServerOption {
	return func(s *Server) {
		s.gatewayAccessToken = strings.TrimSpace(token)
	}
}

func NewServer(hosts *hoststore.Store, options ...ServerOption) *Server {
	server := &Server{
		hosts:          hosts,
		ssh:            sshclient.NewClient(),
		terminalTokens: newTerminalTokenStore(),
	}
	for _, option := range options {
		option(server)
	}
	return server
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/audit-events", s.handleListAuditEvents)
	mux.HandleFunc("GET /api/hosts", s.handleListHosts)
	mux.HandleFunc("POST /api/hosts", s.handleCreateHost)
	mux.HandleFunc("POST /api/hosts/{id}/pin", s.handlePinHost)
	mux.HandleFunc("POST /api/hosts/{id}/ssh/probe", s.handleSSHProbe)
	mux.HandleFunc("POST /api/hosts/{id}/ssh/trust", s.handleTrustHostKey)
	mux.HandleFunc("POST /api/hosts/{id}/tmux/sessions/list", s.handleListTmuxSessions)
	mux.HandleFunc("POST /api/hosts/{id}/tmux/sessions", s.handleCreateTmuxSession)
	mux.HandleFunc("POST /api/hosts/{id}/tmux/sessions/{name}/terminal-token", s.handleCreateTerminalToken)
	mux.HandleFunc("POST /api/hosts/{id}/tmux/sessions/{name}/history", s.handleCaptureTmuxHistory)
	mux.HandleFunc("POST /api/hosts/{id}/tmux/sessions/{name}/metadata", s.handleSaveTmuxSessionMetadata)
	mux.HandleFunc("GET /api/terminal", s.handleTerminalWebSocket)
	return withCORS(s.withGatewayAuth(mux))
}

type healthResponse struct {
	OK        bool      `json:"ok"`
	Service   string    `json:"service"`
	Timestamp time.Time `json:"timestamp"`
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{
		OK:        true,
		Service:   "muxchat-gateway",
		Timestamp: time.Now().UTC(),
	})
}
