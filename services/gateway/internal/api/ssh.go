package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

type sshProbeRequest struct {
	Password             string `json:"password"`
	PrivateKey           string `json:"privateKey"`
	PrivateKeyPassphrase string `json:"privateKeyPassphrase"`
	SSHAuthMethod        string `json:"sshAuthMethod"`
}

type sshProbeResponse struct {
	OK     bool   `json:"ok"`
	Output string `json:"output"`
}

type sshHeartbeatResponse struct {
	Error string         `json:"error,omitempty"`
	Host  hoststore.Host `json:"host"`
	OK    bool           `json:"ok"`
}

type trustHostKeyResponse struct {
	Fingerprint string         `json:"fingerprint"`
	Host        hoststore.Host `json:"host"`
}

func (s *Server) handleSSHProbe(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/ssh/probe")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}

	var input sshProbeRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	credential, err := credentialForRequest(sshCredentialInput(input))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}

	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), credential, "printf chatmux-ok")
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "ssh.probed", HostID: host.ID, Message: "probed ssh connection"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, sshProbeResponse{OK: true, Output: string(output)})
}

func (s *Server) handleSSHHeartbeat(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/ssh/heartbeat")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}

	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	credential, err := credentialForHost(host)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	if _, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), credential, "printf chatmux-ok"); err != nil {
		s.writeHeartbeatStatus(w, r, host.ID, hoststore.HostStatusError, err)
		return
	}
	s.writeHeartbeatStatus(w, r, host.ID, hoststore.HostStatusOnline, nil)
}

func (s *Server) writeHeartbeatStatus(w http.ResponseWriter, r *http.Request, hostID string, status string, heartbeatErr error) {
	host, err := s.hosts.SetHostStatus(r.Context(), hostID, status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	response := sshHeartbeatResponse{Host: host, OK: heartbeatErr == nil}
	if heartbeatErr != nil {
		response.Error = heartbeatErr.Error()
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleTrustHostKey(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/ssh/trust")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}

	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}

	fingerprint, err := s.ssh.ScanHostKey(r.Context(), hostToSSHConfig(host))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	trusted, err := s.hosts.TrustHostKey(r.Context(), host.ID, fingerprint)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "ssh.host_key.trusted", HostID: host.ID, Message: "trusted ssh host key"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, trustHostKeyResponse{Fingerprint: fingerprint, Host: trusted})
}

func hostToSSHConfig(host hoststore.Host) sshclient.HostConfig {
	return sshclient.HostConfig{
		Hostname:           host.Hostname,
		Port:               host.Port,
		Username:           host.Username,
		HostKeyFingerprint: host.HostKeyFingerprint,
	}
}

func routeHostAction(path string, suffix string) (string, bool) {
	hostID := strings.TrimSuffix(strings.TrimPrefix(path, "/api/hosts/"), suffix)
	if hostID == "" || hostID == path {
		return "", false
	}
	return hostID, true
}

func routeHostSessionAction(path string, suffix string) (string, string, bool) {
	trimmed := strings.TrimSuffix(strings.TrimPrefix(path, "/api/hosts/"), suffix)
	parts := strings.Split(trimmed, "/tmux/sessions/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}
