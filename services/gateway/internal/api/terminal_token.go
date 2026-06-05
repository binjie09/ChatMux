package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

type createTerminalTokenRequest struct {
	CredentialToken string `json:"credentialToken"`
	Recovering      bool   `json:"recovering"`
	tmuxTargetRequest
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

	var input createTerminalTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	target, err := targetFromSessionRequest(sessionName, input.tmuxTargetRequest)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	if err := s.visibleSession(r, host, sessionName); err != nil {
		writeError(w, statusForSessionAccessError(err), err)
		return
	}
	credential, err := s.sshCredentialForRequest(r, hostID, input.CredentialToken)
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}

	id := s.terminalTokens.Create(terminalToken{
		HostID:      hostID,
		Recovering:  input.Recovering,
		SessionName: sessionName,
		Target:      target,
		Credential:  credential,
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
