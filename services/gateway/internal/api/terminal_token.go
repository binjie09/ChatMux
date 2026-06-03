package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/tmux"
)

type createTerminalTokenRequest struct {
	Password string `json:"password"`
}

type createTerminalTokenResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expiresIn"`
}

func (s *Server) handleCreateTerminalToken(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, ok := routeHostSessionAction(r.URL.Path, "/terminal-token")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	if err := tmux.ValidateSessionName(sessionName); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	var input createTerminalTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.Password == "" {
		writeError(w, http.StatusBadRequest, errors.New("password is required"))
		return
	}
	if err := s.ensureHostExists(r, hostID); err != nil {
		writeError(w, statusForHostError(err), err)
		return
	}

	id := s.terminalTokens.Create(terminalToken{
		HostID:      hostID,
		SessionName: sessionName,
		Password:    input.Password,
	})
	writeJSON(w, http.StatusCreated, createTerminalTokenResponse{
		Token:     id,
		ExpiresIn: int(terminalTokenTTL.Seconds()),
	})
}

func (s *Server) ensureHostExists(r *http.Request, hostID string) error {
	_, err := s.hosts.GetHost(r.Context(), hostID)
	return err
}

func statusForHostError(err error) int {
	if errors.Is(err, hoststore.ErrHostNotFound) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}
