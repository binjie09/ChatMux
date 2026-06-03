package api

import (
	"net/http"
	"time"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
)

type Server struct {
	hosts          *hoststore.Store
	ssh            sshRunner
	terminalTokens *terminalTokenStore
}

func NewServer(hosts *hoststore.Store) *Server {
	return &Server{
		hosts:          hosts,
		ssh:            sshclient.NewClient(),
		terminalTokens: newTerminalTokenStore(),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/hosts", s.handleListHosts)
	mux.HandleFunc("POST /api/hosts", s.handleCreateHost)
	mux.HandleFunc("POST /api/hosts/{id}/pin", s.handlePinHost)
	mux.HandleFunc("POST /api/hosts/{id}/ssh/probe", s.handleSSHProbe)
	mux.HandleFunc("POST /api/hosts/{id}/ssh/trust", s.handleTrustHostKey)
	mux.HandleFunc("POST /api/hosts/{id}/tmux/sessions/list", s.handleListTmuxSessions)
	mux.HandleFunc("POST /api/hosts/{id}/tmux/sessions", s.handleCreateTmuxSession)
	mux.HandleFunc("POST /api/hosts/{id}/tmux/sessions/{name}/terminal-token", s.handleCreateTerminalToken)
	mux.HandleFunc("POST /api/hosts/{id}/tmux/sessions/{name}/history", s.handleCaptureTmuxHistory)
	mux.HandleFunc("GET /api/terminal", s.handleTerminalWebSocket)
	return withCORS(mux)
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
