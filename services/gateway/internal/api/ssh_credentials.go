package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

var (
	errCredentialRequired    = errors.New("credentialToken is required")
	errCredentialInvalid     = errors.New("credential token is invalid or expired")
	errHostCredentialMissing = errors.New("host ssh credential is required")
)

type sshCredentialInput struct {
	Password             string `json:"password"`
	PrivateKey           string `json:"privateKey"`
	PrivateKeyPassphrase string `json:"privateKeyPassphrase"`
	SSHAuthMethod        string `json:"sshAuthMethod"`
}

type createSSHCredentialRequest = sshCredentialInput

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
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	var input createSSHCredentialRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	credential, err := credentialForHostOrRequest(host, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	token := s.credentialTokens.Create(credentialToken{
		HostID: hostID, Credential: credential, Principal: principalName(r),
	})
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "ssh.credential.created", HostID: hostID, Message: "created ssh credential token"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, createSSHCredentialResponse{
		ExpiresIn: int(credentialTokenTTL.Seconds()), Token: token,
	})
}

func credentialForHostOrRequest(host hoststore.Host, input sshCredentialInput) (sshclient.Credential, error) {
	if requestHasSSHCredential(input) {
		return credentialForRequest(input)
	}
	return credentialForHost(host)
}

func requestHasSSHCredential(input sshCredentialInput) bool {
	return strings.TrimSpace(input.Password) != "" || strings.TrimSpace(input.PrivateKey) != ""
}

func credentialForRequest(input sshCredentialInput) (sshclient.Credential, error) {
	method := input.SSHAuthMethod
	if method == "" && strings.TrimSpace(input.PrivateKey) != "" {
		method = hoststore.SSHAuthMethodPrivateKey
	}
	if method == "" {
		method = hoststore.SSHAuthMethodPassword
	}
	return credentialFromFields(method, input.Password, input.PrivateKey, input.PrivateKeyPassphrase)
}

func credentialForHost(host hoststore.Host) (sshclient.Credential, error) {
	return credentialFromFields(host.SSHAuthMethod, host.SSHPassword, host.SSHPrivateKey, host.SSHKeyPassphrase)
}

func credentialFromFields(method string, password string, privateKey string, passphrase string) (sshclient.Credential, error) {
	switch method {
	case hoststore.SSHAuthMethodPassword, "":
		if strings.TrimSpace(password) == "" {
			return sshclient.Credential{}, errHostCredentialMissing
		}
		return sshclient.Credential{Kind: sshclient.CredentialKindPassword, Password: password}, nil
	case hoststore.SSHAuthMethodPrivateKey:
		if strings.TrimSpace(privateKey) == "" {
			return sshclient.Credential{}, errHostCredentialMissing
		}
		return sshclient.Credential{Kind: sshclient.CredentialKindPrivateKey, PrivateKey: privateKey, Passphrase: passphrase}, nil
	default:
		return sshclient.Credential{}, errors.New("sshAuthMethod must be password or private_key")
	}
}

func (s *Server) sshCredentialForRequest(r *http.Request, hostID string, credentialToken string) (sshclient.Credential, error) {
	if credentialToken == "" {
		return sshclient.Credential{}, errCredentialRequired
	}
	token, ok := s.credentialTokens.Get(credentialToken)
	if !ok || token.HostID != hostID || token.Principal != principalName(r) {
		return sshclient.Credential{}, errCredentialInvalid
	}
	return token.Credential, nil
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
