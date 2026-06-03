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

type tmuxHistoryRequest struct {
	Password string `json:"password"`
}

type tmuxHistoryResponse struct {
	Chunks []tmux.TranscriptChunk `json:"chunks"`
	Text   string                 `json:"text"`
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

	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
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
	sessions, err = s.applySessionMetadata(r.Context(), hostID, sessions)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.sessions.listed", HostID: hostID, Message: "listed tmux sessions"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
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
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.session.created", HostID: hostID, SessionName: session.Name, Message: "created tmux session"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (s *Server) handleCaptureTmuxHistory(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, ok := routeHostSessionAction(r.URL.Path, "/history")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}

	var input tmuxHistoryRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if input.Password == "" {
		writeError(w, http.StatusBadRequest, errors.New("password is required"))
		return
	}

	command, err := tmux.CapturePaneCommand(sessionName)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	output, err := s.runTmuxCommand(r, hostID, input.Password, command)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.history.captured", HostID: hostID, SessionName: sessionName, Message: "captured tmux history"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	text := string(output)
	writeJSON(w, http.StatusOK, tmuxHistoryResponse{Chunks: tmux.NormalizeHistory(text), Text: text})
}

func (s *Server) runTmuxListCommand(r *http.Request, hostID string, password string, command string) ([]tmux.Session, error) {
	output, err := s.runTmuxCommand(r, hostID, password, command)
	if err != nil {
		return nil, err
	}
	sessions, err := tmux.ParseSessions(string(output))
	if err != nil {
		return nil, err
	}
	return s.applySessionMetadata(r.Context(), hostID, sessions)
}

func (s *Server) runTmuxCommand(r *http.Request, hostID string, password string, command string) ([]byte, error) {
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		return nil, err
	}
	return s.ssh.Run(r.Context(), hostToSSHConfig(host), sshclient.PasswordCredential{Password: password}, command)
}

func findSessionByName(sessions []tmux.Session, name string) (tmux.Session, error) {
	for _, session := range sessions {
		if session.Name == name {
			return session, nil
		}
	}
	return tmux.Session{}, errors.New("created tmux session was not found")
}
