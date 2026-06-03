package api

import (
	"encoding/json"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

func (s *Server) handleListHosts(w http.ResponseWriter, r *http.Request) {
	hosts, err := s.hosts.ListHosts(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, hosts)
}

func (s *Server) handleCreateHost(w http.ResponseWriter, r *http.Request) {
	var input hoststore.CreateHostInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	host, err := s.hosts.CreateHost(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, host)
}
