package api

import (
	"net/http"
	"time"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

type Server struct {
	hosts *hoststore.Store
}

func NewServer(hosts *hoststore.Store) *Server {
	return &Server{hosts: hosts}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /api/hosts", s.handleListHosts)
	mux.HandleFunc("POST /api/hosts", s.handleCreateHost)
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
