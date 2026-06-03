package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/tmux"
)

type createTerminalTokenRequest struct {
	CredentialToken string `json:"credentialToken"`
	Password        string `json:"password"`
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
	if err := s.ensureHostExists(r, hostID); err != nil {
		writeError(w, statusForHostError(err), err)
		return
	}
	password, err := s.sshPasswordForRequest(r, hostID, input.credential())
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}

	id := s.terminalTokens.Create(terminalToken{
		HostID:      hostID,
		SessionName: sessionName,
		Password:    password,
	})
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "terminal.token.created", HostID: hostID, SessionName: sessionName, Message: "created terminal token"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, createTerminalTokenResponse{
		Token:     id,
		ExpiresIn: int(terminalTokenTTL.Seconds()),
	})
}

func (r createTerminalTokenRequest) credential() sshCredentialRequest {
	return sshCredentialRequest{CredentialToken: r.CredentialToken, Password: r.Password}
}

func (s *Server) ensureHostExists(r *http.Request, hostID string) error {
	_, err := s.visibleHost(r, hostID)
	return err
}

func statusForHostError(err error) int {
	if errors.Is(err, hoststore.ErrHostNotFound) || errors.Is(err, errHostNotVisible) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}
