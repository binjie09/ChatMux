package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
)

type tmuxWindowRequest struct {
	CredentialToken string `json:"credentialToken"`
	Name            string `json:"name"`
	WindowIndex     *int   `json:"windowIndex"`
}

type tmuxMutationCommand func(string, tmuxWindowRequest) (string, error)

func (s *Server) handleCreateTmuxWindow(w http.ResponseWriter, r *http.Request) {
	s.handleTmuxWindowMutation(w, r, "/windows", "tmux.window.created", "created tmux window", createWindowCommand)
}

func (s *Server) handleRenameTmuxWindow(w http.ResponseWriter, r *http.Request) {
	s.handleTmuxWindowMutation(w, r, "/windows/rename", "tmux.window.renamed", "renamed tmux window", renameWindowCommand)
}

func (s *Server) handleDeleteTmuxWindow(w http.ResponseWriter, r *http.Request) {
	s.handleTmuxWindowMutation(w, r, "/windows/delete", "tmux.window.deleted", "deleted tmux window", deleteWindowCommand)
}

func (s *Server) handleRenameTmuxSession(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, input, ok := decodeTmuxWindowRequest(w, r, "/rename")
	if !ok {
		return
	}
	command, err := renameSessionCommand(sessionName, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	sessions, err := s.runManagedTmuxListMutation(r, hostID, sessionName, input.CredentialToken, command)
	if err != nil {
		writeError(w, statusForTmuxMutationError(err), err)
		return
	}
	if err := s.hosts.RenameSessionMetadata(r.Context(), hostID, sessionName, input.Name); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForTmuxMutationError(err), err)
		return
	}
	sessions, err = s.applyVisibleSessionMetadata(r, host, sessions)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.session.renamed", HostID: hostID, SessionName: input.Name, Message: "renamed tmux session"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (s *Server) handleTmuxWindowMutation(
	w http.ResponseWriter,
	r *http.Request,
	suffix string,
	eventType string,
	auditMessage string,
	commandForInput tmuxMutationCommand,
) {
	hostID, sessionName, input, ok := decodeTmuxWindowRequest(w, r, suffix)
	if !ok {
		return
	}
	command, err := commandForInput(sessionName, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	sessions, err := s.runManagedTmuxListMutation(r, hostID, sessionName, input.CredentialToken, command)
	if err != nil {
		writeError(w, statusForTmuxMutationError(err), err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: eventType, HostID: hostID, SessionName: sessionName, Message: auditMessage}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func decodeTmuxWindowRequest(w http.ResponseWriter, r *http.Request, suffix string) (string, string, tmuxWindowRequest, bool) {
	hostID, sessionName, ok := routeHostSessionAction(r.URL.Path, suffix)
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return "", "", tmuxWindowRequest{}, false
	}
	var input tmuxWindowRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return "", "", tmuxWindowRequest{}, false
	}
	return hostID, sessionName, input, true
}

func (s *Server) runManagedTmuxListMutation(
	r *http.Request,
	hostID string,
	sessionName string,
	credentialToken string,
	command string,
) ([]tmux.Session, error) {
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		return nil, err
	}
	if err := s.manageableSession(r, host, sessionName); err != nil {
		return nil, err
	}
	credential, err := s.sshCredentialForRequest(r, hostID, credentialToken)
	if err != nil {
		return nil, err
	}
	return s.runTmuxListCommand(r, hostID, credential, command)
}

func createWindowCommand(sessionName string, input tmuxWindowRequest) (string, error) {
	return tmux.CreateWindowCommand(sessionName, input.Name)
}

func renameWindowCommand(sessionName string, input tmuxWindowRequest) (string, error) {
	return tmux.RenameWindowCommand(tmux.Target{SessionName: sessionName, WindowIndex: input.WindowIndex}, input.Name)
}

func deleteWindowCommand(sessionName string, input tmuxWindowRequest) (string, error) {
	return tmux.KillWindowCommand(tmux.Target{SessionName: sessionName, WindowIndex: input.WindowIndex})
}

func renameSessionCommand(sessionName string, input tmuxWindowRequest) (string, error) {
	return tmux.RenameSessionCommand(sessionName, input.Name)
}

func statusForTmuxMutationError(err error) int {
	switch {
	case errors.Is(err, errSessionNotVisible), errors.Is(err, errHostNotVisible), errors.Is(err, hoststore.ErrHostNotFound):
		return http.StatusNotFound
	case errors.Is(err, errCredentialRequired), errors.Is(err, errCredentialInvalid):
		return statusForCredentialError(err)
	default:
		return http.StatusBadGateway
	}
}
