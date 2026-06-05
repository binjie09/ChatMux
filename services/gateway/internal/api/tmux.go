package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
)

type tmuxListRequest struct {
	CredentialToken string `json:"credentialToken"`
}

type tmuxCreateRequest struct {
	CredentialToken string `json:"credentialToken"`
	Name            string `json:"name"`
}

const fallbackSSHSessionName = "ssh"

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

	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	credential, err := s.sshCredentialForRequest(r, hostID, input.CredentialToken)
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}

	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), credential, tmux.ListSessionsCommand())
	if err != nil {
		if session, ok := fallbackSessionFromTmuxError(err); ok {
			writeJSON(w, http.StatusOK, []tmux.Session{session})
			return
		}
		writeError(w, http.StatusBadGateway, err)
		return
	}
	sessions, err := tmux.ParseSessions(string(output))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	sessions, err = s.applyVisibleSessionMetadata(r, host, sessions)
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

	command, err := tmux.CreateSessionCommand(input.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	credential, err := s.sshCredentialForRequest(r, hostID, input.CredentialToken)
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}
	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), credential, command)
	if err != nil {
		if session, ok := fallbackSessionFromTmuxError(err); ok {
			writeJSON(w, http.StatusCreated, session)
			return
		}
		writeError(w, http.StatusBadGateway, err)
		return
	}
	sessions, err := tmux.ParseSessions(string(output))
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	session, err := findSessionByName(sessions, input.Name)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	metadata, err := s.hosts.SaveSessionMetadata(r.Context(), hoststore.SaveSessionMetadataInput{
		HostID: hostID, Owner: requestPrincipal(r).Name, SessionName: session.Name,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	session = applySessionMetadata(session, metadata, true)
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.session.created", HostID: hostID, SessionName: session.Name, Message: "created tmux session"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (s *Server) runTmuxListCommand(r *http.Request, hostID string, credential sshclient.Credential, command string) ([]tmux.Session, error) {
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		return nil, err
	}
	output, err := s.runTmuxCommand(r, hostID, credential, command)
	if err != nil {
		return nil, err
	}
	sessions, err := tmux.ParseSessions(string(output))
	if err != nil {
		return nil, err
	}
	return s.applyVisibleSessionMetadata(r, host, sessions)
}

func (s *Server) runTmuxCommand(r *http.Request, hostID string, credential sshclient.Credential, command string) ([]byte, error) {
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		return nil, err
	}
	return s.ssh.Run(r.Context(), hostToSSHConfig(host), credential, command)
}

func findSessionByName(sessions []tmux.Session, name string) (tmux.Session, error) {
	for _, session := range sessions {
		if session.Name == name {
			return session, nil
		}
	}
	return tmux.Session{}, errors.New("created tmux session was not found")
}

func fallbackSessionFromTmuxError(err error) (tmux.Session, bool) {
	var commandError sshclient.CommandError
	if !errors.As(err, &commandError) || !tmux.MissingTmux(commandError.Output) {
		return tmux.Session{}, false
	}
	return fallbackSSHSession(time.Now()), true
}

func fallbackSSHSession(now time.Time) tmux.Session {
	return tmux.Session{
		ID:          "ssh-fallback",
		Name:        fallbackSSHSessionName,
		Windows:     1,
		WindowList:  []tmux.Window{fallbackSSHWindow(now)},
		Attached:    true,
		UpdatedAt:   now.UTC(),
		Status:      "unknown",
		ProcessName: "ssh",
		Title:       "SSH shell",
		Tags:        []string{},
		Mode:        terminalTokenModeSSH,
	}
}

func fallbackSSHWindow(now time.Time) tmux.Window {
	return tmux.Window{
		ID:          "ssh-fallback:0",
		Index:       0,
		Name:        "SSH shell",
		Active:      true,
		UpdatedAt:   now.UTC(),
		Status:      "unknown",
		ProcessName: "ssh",
	}
}
