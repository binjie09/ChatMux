package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
)

type createTerminalTokenRequest struct {
	CredentialToken string `json:"credentialToken"`
	Mode            string `json:"mode"`
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
	mode := terminalTokenMode(input.Mode)
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	if mode == terminalTokenModeTmux {
		if err := s.visibleSession(r, host, sessionName); err != nil {
			writeError(w, statusForSessionAccessError(err), err)
			return
		}
	}
	if err := validateTerminalTokenMode(mode, sessionName, target); err != nil {
		writeError(w, statusForSessionAccessError(err), err)
		return
	}
	credential, err := s.sshCredentialForRequest(r, hostID, input.CredentialToken)
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}
	if err := s.validateFallbackTerminalMode(r, host, credential, mode); err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	id := s.terminalTokens.Create(terminalToken{
		HostID:      hostID,
		Mode:        mode,
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

func terminalTokenMode(input string) string {
	if input == terminalTokenModeSSH {
		return terminalTokenModeSSH
	}
	return terminalTokenModeTmux
}

func validateTerminalTokenMode(mode string, sessionName string, target tmux.Target) error {
	if mode != terminalTokenModeSSH {
		return nil
	}
	if sessionName != fallbackSSHSessionName || target.WindowIndex == nil || *target.WindowIndex != 0 {
		return errSessionNotVisible
	}
	return nil
}

func (s *Server) validateFallbackTerminalMode(
	r *http.Request,
	host hoststore.Host,
	credential sshclient.Credential,
	mode string,
) error {
	if mode != terminalTokenModeSSH {
		return nil
	}
	_, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), credential, tmux.ListSessionsCommand())
	if _, ok := fallbackSessionFromTmuxError(err); ok {
		return nil
	}
	if err != nil {
		return err
	}
	return errSessionNotVisible
}
