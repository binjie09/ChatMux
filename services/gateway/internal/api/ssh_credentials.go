package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

var (
	errCredentialRequired = errors.New("password or credentialToken is required")
	errCredentialInvalid  = errors.New("credential token is invalid or expired")
)

type sshCredentialRequest struct {
	CredentialToken string `json:"credentialToken"`
	Password        string `json:"password"`
}

type createSSHCredentialResponse struct {
	ExpiresIn int    `json:"expiresIn"`
	Token     string `json:"token"`
}

func (s *Server) handleCreateSSHCredential(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/ssh/credentials")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	if _, err := s.visibleHost(r, hostID); err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	var input sshCredentialRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.Password == "" {
		writeError(w, http.StatusBadRequest, errors.New("password is required"))
		return
	}
	token := s.credentialTokens.Create(credentialToken{
		HostID: hostID, Password: input.Password, Principal: principalName(r),
	})
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "ssh.credential.created", HostID: hostID, Message: "created ssh credential token"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, createSSHCredentialResponse{
		ExpiresIn: int(credentialTokenTTL.Seconds()), Token: token,
	})
}

func (s *Server) sshPasswordForRequest(r *http.Request, hostID string, credential sshCredentialRequest) (string, error) {
	if credential.Password != "" {
		return credential.Password, nil
	}
	if credential.CredentialToken == "" {
		return "", errCredentialRequired
	}
	token, ok := s.credentialTokens.Get(credential.CredentialToken)
	if !ok || token.HostID != hostID || token.Principal != principalName(r) {
		return "", errCredentialInvalid
	}
	return token.Password, nil
}

func statusForCredentialError(err error) int {
	if errors.Is(err, errCredentialRequired) {
		return http.StatusBadRequest
	}
	if errors.Is(err, errCredentialInvalid) {
		return http.StatusUnauthorized
	}
	return http.StatusInternalServerError
}
