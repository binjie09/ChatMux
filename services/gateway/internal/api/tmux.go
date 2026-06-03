package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
	"github.com/muxchat/muxchat/services/gateway/internal/tmux"
)

type tmuxListRequest struct {
	Password string `json:"password"`
}

type tmuxCreateRequest struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (s *Server) handleListTmuxSessions(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/tmux/sessions/list")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}

	var input tmuxListRequest
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

	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), sshclient.PasswordCredential{Password: input.Password}, tmux.ListSessionsCommand())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	sessions, err := tmux.ParseSessions(string(output))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (s *Server) handleCreateTmuxSession(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/tmux/sessions")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}

	var input tmuxCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.Password == "" {
		writeError(w, http.StatusBadRequest, errors.New("password is required"))
		return
	}

	command, err := tmux.CreateSessionCommand(input.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	sessions, err := s.runTmuxListCommand(r, hostID, input.Password, command)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	session, err := findSessionByName(sessions, input.Name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (s *Server) runTmuxListCommand(r *http.Request, hostID string, password string, command string) ([]tmux.Session, error) {
	host, err := s.hosts.GetHost(r.Context(), hostID)
	if err != nil {
		return nil, err
	}
	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), sshclient.PasswordCredential{Password: password}, command)
	if err != nil {
		return nil, err
	}
	return tmux.ParseSessions(string(output))
}

func findSessionByName(sessions []tmux.Session, name string) (tmux.Session, error) {
	for _, session := range sessions {
		if session.Name == name {
			return session, nil
		}
	}
	return tmux.Session{}, errors.New("created tmux session was not found")
}
