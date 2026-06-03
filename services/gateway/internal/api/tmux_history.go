package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/sshclient"
	"github.com/muxchat/muxchat/services/gateway/internal/tmux"
)

type tmuxHistoryRequest struct {
	CredentialToken string `json:"credentialToken"`
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
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	if err := s.visibleSession(r, host, sessionName); err != nil {
		writeError(w, statusForSessionAccessError(err), err)
		return
	}
	password, err := s.sshPasswordForRequest(r, hostID, input.CredentialToken)
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}
	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), sshclient.PasswordCredential{Password: password}, command)
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
	if err := s.visibleSession(r, host, sessionName); err != nil {
		writeError(w, statusForSessionAccessError(err), err)
		return
	}
	password, err := s.sshPasswordForRequest(r, hostID, input.CredentialToken)
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
	if input.CredentialToken == "" {
		return tmuxHistoryRequest{}, errCredentialRequired
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

func statusForSummaryError(err error) int {
	if errors.Is(err, errEmptyTranscript) || errors.Is(err, tmux.ErrInvalidSessionName) {
		return http.StatusBadRequest
	}
	return http.StatusBadGateway
}
