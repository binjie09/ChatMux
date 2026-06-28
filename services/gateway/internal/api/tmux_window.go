package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
)

type tmuxWindowRequest struct {
	CredentialToken string  `json:"credentialToken"`
	Name            string  `json:"name"`
	WindowIndex     *int    `json:"windowIndex"`
	ToWindowIndex   *int    `json:"toWindowIndex"`
	Swaps           [][]int `json:"swaps"`
}

type tmuxMutationCommand func(string, tmuxWindowRequest) (string, error)
type fallbackWindowMutation func(string, int, string, time.Time) (tmux.Session, error)

func (s *Server) handleCreateTmuxWindow(w http.ResponseWriter, r *http.Request) {
	s.handleTmuxWindowMutation(w, r, windowMutationInput{
		suffix: "/windows", eventType: "tmux.window.created", auditMessage: "created tmux window",
		commandForInput: createWindowCommand, fallback: s.createFallbackWindow,
	})
}

func (s *Server) handleRenameTmuxWindow(w http.ResponseWriter, r *http.Request) {
	s.handleTmuxWindowMutation(w, r, windowMutationInput{
		suffix: "/windows/rename", eventType: "tmux.window.renamed", auditMessage: "renamed tmux window",
		commandForInput: renameWindowCommand, fallback: s.renameFallbackWindow,
	})
}

func (s *Server) handleDeleteTmuxWindow(w http.ResponseWriter, r *http.Request) {
	s.handleTmuxWindowMutation(w, r, windowMutationInput{
		suffix: "/windows/delete", eventType: "tmux.window.deleted", auditMessage: "deleted tmux window",
		commandForInput: deleteWindowCommand, fallback: s.deleteFallbackWindow,
	})
}

func (s *Server) handleMoveTmuxWindow(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, input, ok := decodeTmuxWindowRequest(w, r, "/windows/move")
	if !ok {
		return
	}
	fromIndex, toIndex, swaps, err := moveWindowPayload(input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	command, err := tmux.MoveWindowsCommand(sessionName, swaps)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	mutation := windowMutationInput{eventType: "tmux.window.moved", auditMessage: "moved tmux window"}
	sessions, err := s.runManagedTmuxListMutation(r, hostID, sessionName, input.CredentialToken, command)
	if err != nil {
		// Moving has two indices, so it cannot reuse the generic single-index
		// fallback path; handle the gateway-managed SSH session inline. The
		// fallback reorders in memory by position and is unaffected by gaps in
		// window indices, so it still uses from/to rather than the swap chain.
		if sessionName == fallbackSSHSessionName {
			if probe, fallbackOK := fallbackSessionFromTmuxError(err); fallbackOK {
				moved, moveErr := s.sshFallback.MoveWindow(hostID, fromIndex, toIndex, probe.UpdatedAt)
				if moveErr != nil {
					writeError(w, statusForTmuxMutationError(moveErr), moveErr)
					return
				}
				s.writeWindowMutationResponse(w, r, hostID, sessionName, mutation, []tmux.Session{moved})
				return
			}
		}
		writeError(w, statusForTmuxMutationError(err), err)
		return
	}
	s.writeWindowMutationResponse(w, r, hostID, sessionName, mutation, sessions)
}

// moveWindowPayload returns the from/to indices (used by the in-memory SSH
// fallback) and the explicit swap chain (used by the real tmux path). The swap
// chain is what makes reordering robust to non-contiguous window indices.
func moveWindowPayload(input tmuxWindowRequest) (fromIndex int, toIndex int, swaps [][]int, err error) {
	if input.WindowIndex == nil || input.ToWindowIndex == nil {
		return 0, 0, nil, errors.New("windowIndex and toWindowIndex are required")
	}
	if *input.WindowIndex < 0 || *input.ToWindowIndex < 0 {
		return 0, 0, nil, tmux.ErrInvalidWindowTarget
	}
	return *input.WindowIndex, *input.ToWindowIndex, input.Swaps, nil
}

func (s *Server) handleDeleteTmuxSession(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, input, ok := decodeTmuxWindowRequest(w, r, "/delete")
	if !ok {
		return
	}
	command, err := tmux.KillSessionCommand(sessionName)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	sessions, err := s.runManagedTmuxListMutation(r, hostID, sessionName, input.CredentialToken, command)
	if err != nil {
		writeError(w, statusForTmuxMutationError(err), err)
		return
	}
	if err := s.cleanupRemovedSession(r, hostID, sessionName); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.session.deleted", HostID: hostID, SessionName: sessionName, Message: "deleted tmux session"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

type windowMutationInput struct {
	suffix          string
	eventType       string
	auditMessage    string
	commandForInput tmuxMutationCommand
	fallback        fallbackWindowMutation
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
	mutation windowMutationInput,
) {
	hostID, sessionName, input, ok := decodeTmuxWindowRequest(w, r, mutation.suffix)
	if !ok {
		return
	}
	command, err := mutation.commandForInput(sessionName, input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	sessions, err := s.runManagedTmuxListMutation(r, hostID, sessionName, input.CredentialToken, command)
	if err != nil {
		fallbackSessions, fallbackErr, ok := s.fallbackWindowMutationSessions(hostID, sessionName, input, err, mutation.fallback)
		if fallbackErr != nil {
			writeError(w, statusForTmuxMutationError(fallbackErr), fallbackErr)
			return
		}
		if ok {
			s.writeWindowMutationResponse(w, r, hostID, sessionName, mutation, fallbackSessions)
			return
		}
		writeError(w, statusForTmuxMutationError(err), err)
		return
	}
	s.writeWindowMutationResponse(w, r, hostID, sessionName, mutation, sessions)
}

func (s *Server) writeWindowMutationResponse(
	w http.ResponseWriter,
	r *http.Request,
	hostID string,
	sessionName string,
	mutation windowMutationInput,
	sessions []tmux.Session,
) {
	// Killing the last window of a session also destroys the session in tmux.
	// When that happens, drop its metadata and last-window pointer so they do
	// not resurface if a session with the same name is created later.
	if !sessionExists(sessions, sessionName) {
		if err := s.cleanupRemovedSession(r, hostID, sessionName); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: mutation.eventType, HostID: hostID, SessionName: sessionName, Message: mutation.auditMessage}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

func (s *Server) cleanupRemovedSession(r *http.Request, hostID string, sessionName string) error {
	if err := s.hosts.DeleteSessionMetadata(r.Context(), hostID, sessionName); err != nil {
		return fmt.Errorf("delete session metadata: %w", err)
	}
	if err := s.hosts.DeleteHostLastWindowForSession(r.Context(), hostID, sessionName); err != nil {
		return fmt.Errorf("delete host last window: %w", err)
	}
	return nil
}

func sessionExists(sessions []tmux.Session, sessionName string) bool {
	for _, session := range sessions {
		if session.Name == sessionName {
			return true
		}
	}
	return false
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

func (s *Server) fallbackWindowMutationSessions(
	hostID string,
	sessionName string,
	input tmuxWindowRequest,
	runErr error,
	mutation fallbackWindowMutation,
) ([]tmux.Session, error, bool) {
	if sessionName != fallbackSSHSessionName || mutation == nil {
		return nil, nil, false
	}
	fallbackProbe, ok := fallbackSessionFromTmuxError(runErr)
	if !ok {
		return nil, nil, false
	}
	session, err := mutation(hostID, windowIndexValue(input.WindowIndex), input.Name, fallbackProbe.UpdatedAt)
	if err != nil {
		return nil, err, true
	}
	return []tmux.Session{session}, nil, true
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
	return tmux.CreateWindowCommand(sessionName, input.Name, input.WindowIndex)
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

func (s *Server) createFallbackWindow(hostID string, _ int, name string, now time.Time) (tmux.Session, error) {
	return s.sshFallback.CreateWindow(hostID, name, now)
}

func (s *Server) renameFallbackWindow(hostID string, windowIndex int, name string, now time.Time) (tmux.Session, error) {
	return s.sshFallback.RenameWindow(hostID, windowIndex, name, now)
}

func (s *Server) deleteFallbackWindow(hostID string, windowIndex int, _ string, now time.Time) (tmux.Session, error) {
	return s.sshFallback.DeleteWindow(hostID, windowIndex, now)
}

func windowIndexValue(windowIndex *int) int {
	if windowIndex == nil {
		return 0
	}
	return *windowIndex
}

func statusForTmuxMutationError(err error) int {
	switch {
	case errors.Is(err, errSessionNotVisible), errors.Is(err, errHostNotVisible), errors.Is(err, hoststore.ErrHostNotFound), errors.Is(err, errFallbackWindowNotFound):
		return http.StatusNotFound
	case errors.Is(err, errCredentialRequired), errors.Is(err, errCredentialInvalid):
		return statusForCredentialError(err)
	case errors.Is(err, tmux.ErrInvalidWindowName), errors.Is(err, errFallbackLastWindow):
		return http.StatusBadRequest
	default:
		return http.StatusBadGateway
	}
}
