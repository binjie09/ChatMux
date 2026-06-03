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
	CredentialToken string `json:"credentialToken"`
	Password        string `json:"password"`
}

type tmuxCreateRequest struct {
	CredentialToken string `json:"credentialToken"`
	Name            string `json:"name"`
	Password        string `json:"password"`
}

type tmuxHistoryRequest struct {
	CredentialToken string `json:"credentialToken"`
	Password        string `json:"password"`
}

type tmuxHistoryResponse struct {
	Chunks []tmux.TranscriptChunk `json:"chunks"`
	Text   string                 `json:"text"`
}

type summarizeSessionRequest struct {
	host        hoststore.Host
	password    string
	request     *http.Request
	sessionName string
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

	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	password, err := s.sshPasswordForRequest(r, hostID, input.credential())
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}

	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), sshclient.PasswordCredential{Password: password}, tmux.ListSessionsCommand())
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

	command, err := tmux.CreateSessionCommand(input.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	password, err := s.sshPasswordForRequest(r, hostID, input.credential())
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}
	sessions, err := s.runTmuxListCommand(r, hostID, password, command)
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

	command, err := tmux.CapturePaneCommand(sessionName)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	password, err := s.sshPasswordForRequest(r, hostID, input.credential())
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}
	output, err := s.runTmuxCommand(r, hostID, password, command)
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

func (s *Server) handleSummarizeTmuxHistory(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, ok := routeHostSessionAction(r.URL.Path, "/summary")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	if s.summarizer == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("AI summarization is not configured"))
		return
	}
	input, err := decodeTmuxHistoryRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	password, err := s.sshPasswordForRequest(r, hostID, input.credential())
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}
	summary, err := s.summarizeSessionHistory(summarizeSessionRequest{
		host: host, password: password, request: r, sessionName: sessionName,
	})
	if err != nil {
		writeError(w, statusForSummaryError(err), err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.history.summarized", HostID: hostID, SessionName: sessionName, Message: "summarized tmux history"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

func decodeTmuxHistoryRequest(r *http.Request) (tmuxHistoryRequest, error) {
	var input tmuxHistoryRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		return tmuxHistoryRequest{}, err
	}
	if input.Password == "" {
		if input.CredentialToken == "" {
			return tmuxHistoryRequest{}, errCredentialRequired
		}
	}
	return input, nil
}

func (s *Server) summarizeSessionHistory(input summarizeSessionRequest) (TranscriptSummary, error) {
	command, err := tmux.CapturePaneCommand(input.sessionName)
	if err != nil {
		return TranscriptSummary{}, err
	}
	output, err := s.ssh.Run(input.request.Context(), hostToSSHConfig(input.host), sshclient.PasswordCredential{Password: input.password}, command)
	if err != nil {
		return TranscriptSummary{}, err
	}
	return s.summarizer.Summarize(input.request.Context(), TranscriptSummaryInput{
		HostName: input.host.Name, SessionName: input.sessionName, Transcript: string(output),
	})
}

func (r tmuxListRequest) credential() sshCredentialRequest {
	return sshCredentialRequest{CredentialToken: r.CredentialToken, Password: r.Password}
}

func (r tmuxCreateRequest) credential() sshCredentialRequest {
	return sshCredentialRequest{CredentialToken: r.CredentialToken, Password: r.Password}
}

func (r tmuxHistoryRequest) credential() sshCredentialRequest {
	return sshCredentialRequest{CredentialToken: r.CredentialToken, Password: r.Password}
}

func statusForSummaryError(err error) int {
	if errors.Is(err, errEmptyTranscript) || errors.Is(err, tmux.ErrInvalidSessionName) {
		return http.StatusBadRequest
	}
	return http.StatusBadGateway
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
