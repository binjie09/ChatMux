package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
	"github.com/muxchat/muxchat/services/gateway/internal/tmux"
)

type tmuxCommandDraftRequest struct {
	Password string `json:"password"`
	Prompt   string `json:"prompt"`
}

type draftSessionCommandInput struct {
	host        hoststore.Host
	password    string
	prompt      string
	request     *http.Request
	sessionName string
}

func (s *Server) handleDraftTmuxCommand(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, ok := routeHostSessionAction(r.URL.Path, "/command-draft")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	if s.drafter == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("AI command drafting is not configured"))
		return
	}
	input, err := decodeCommandDraftRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	draft, err := s.draftSessionCommand(draftSessionCommandInput{
		host: host, password: input.Password, prompt: input.Prompt, request: r, sessionName: sessionName,
	})
	if err != nil {
		writeError(w, statusForDraftError(err), err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.command.drafted", HostID: hostID, SessionName: sessionName, Message: "drafted command"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, draft)
}

func decodeCommandDraftRequest(r *http.Request) (tmuxCommandDraftRequest, error) {
	var input tmuxCommandDraftRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		return tmuxCommandDraftRequest{}, err
	}
	if input.Password == "" {
		return tmuxCommandDraftRequest{}, errors.New("password is required")
	}
	if input.Prompt == "" {
		return tmuxCommandDraftRequest{}, errEmptyCommandGoal
	}
	return input, nil
}

func (s *Server) draftSessionCommand(input draftSessionCommandInput) (CommandDraft, error) {
	command, err := tmux.CapturePaneCommand(input.sessionName)
	if err != nil {
		return CommandDraft{}, err
	}
	output, err := s.ssh.Run(input.request.Context(), hostToSSHConfig(input.host), sshclient.PasswordCredential{Password: input.password}, command)
	if err != nil {
		return CommandDraft{}, err
	}
	return s.drafter.Draft(input.request.Context(), CommandDraftInput{
		Goal: input.prompt, HostName: input.host.Name, SessionName: input.sessionName, Transcript: string(output),
	})
}

func statusForDraftError(err error) int {
	if errors.Is(err, errEmptyCommandGoal) || errors.Is(err, tmux.ErrInvalidSessionName) {
		return http.StatusBadRequest
	}
	return http.StatusBadGateway
}
