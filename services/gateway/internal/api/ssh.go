package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
)

type sshProbeRequest struct {
	Password string `json:"password"`
}

type sshProbeResponse struct {
	OK     bool   `json:"ok"`
	Output string `json:"output"`
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
	if input.Password == "" {
		writeError(w, http.StatusBadRequest, errors.New("password is required"))
		return
	}

	host, err := s.hosts.GetHost(r.Context(), hostID)
	if errors.Is(err, hoststore.ErrHostNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), sshclient.PasswordCredential{Password: input.Password}, "printf muxchat-ok")
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

func (s *Server) handleTrustHostKey(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/ssh/trust")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}

	host, err := s.hosts.GetHost(r.Context(), hostID)
	if errors.Is(err, hoststore.ErrHostNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
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
