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

func (s *Server) handleSSHProbe(w http.ResponseWriter, r *http.Request) {
	hostID := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/hosts/"), "/ssh/probe")
	if hostID == "" || hostID == r.URL.Path {
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
	writeJSON(w, http.StatusOK, sshProbeResponse{OK: true, Output: string(output)})
}

func hostToSSHConfig(host hoststore.Host) sshclient.HostConfig {
	return sshclient.HostConfig{
		Hostname: host.Hostname,
		Port:     host.Port,
		Username: host.Username,
	}
}
