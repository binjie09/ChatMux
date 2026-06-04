package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
)

const (
	automationToolAuditList          = "audit.list"
	automationToolHostsList          = "hosts.list"
	automationToolTmuxHistoryCapture = "tmux.history.capture"
	automationToolTmuxSessionsList   = "tmux.sessions.list"
	automationToolRunAuditEvent      = "automation.tool.ran"
	automationToolRequiredRole       = "operator"
	automationToolSideEffectNone     = "none"
	automationToolSideEffectSSHRead  = "ssh-read"
)

var (
	errAutomationArgumentRequired = errors.New("automation tool argument is required")
	errUnknownAutomationTool      = errors.New("automation tool is not registered")
)

type automationTool struct {
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Capabilities []string `json:"capabilities"`
	Inputs       []string `json:"inputs"`
	RequiredRole string   `json:"requiredRole"`
	SideEffect   string   `json:"sideEffect"`
}

type automationRunRequest struct {
	Arguments map[string]string `json:"arguments"`
}

type automationRunResponse struct {
	Result any    `json:"result"`
	Tool   string `json:"tool"`
}

type automationStatusError struct {
	err    error
	status int
}

func (e automationStatusError) Error() string {
	return e.err.Error()
}

func (e automationStatusError) Unwrap() error {
	return e.err
}

func (s *Server) handleListAutomationTools(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.automationTools())
}

func (s *Server) handleRunAutomationTool(w http.ResponseWriter, r *http.Request) {
	toolName, ok := routeAutomationToolRun(r.URL.Path)
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	args, err := decodeAutomationRunRequest(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	result, err := s.runAutomationTool(r, toolName, args)
	if err != nil {
		writeError(w, statusForAutomationError(err), err)
		return
	}
	writeJSON(w, http.StatusOK, automationRunResponse{Result: result, Tool: toolName})
}

func routeAutomationToolRun(path string) (string, bool) {
	const prefix = "/api/automation/tools/"
	const suffix = "/run"
	if !strings.HasPrefix(path, prefix) || !strings.HasSuffix(path, suffix) {
		return "", false
	}
	toolName := strings.TrimSuffix(strings.TrimPrefix(path, prefix), suffix)
	if toolName == "" || strings.Contains(toolName, "/") {
		return "", false
	}
	return toolName, true
}

func decodeAutomationRunRequest(r *http.Request) (map[string]string, error) {
	var input automationRunRequest
	if err := json.NewDecoder(r.Body).Decode(&input); errors.Is(err, io.EOF) {
		return map[string]string{}, nil
	} else if err != nil {
		return nil, err
	}
	if input.Arguments == nil {
		return map[string]string{}, nil
	}
	return input.Arguments, nil
}

func (s *Server) runAutomationHostsList(r *http.Request) (any, error) {
	hosts, err := s.listHostsForPrincipal(r)
	if err != nil {
		return nil, automationStatus(http.StatusInternalServerError, err)
	}
	return hosts, s.logAutomationRun(r, automationToolHostsList, "", "")
}

func (s *Server) runAutomationHostsGet(r *http.Request, args map[string]string) (any, error) {
	hostID, err := automationArg(args, "hostId")
	if err != nil {
		return nil, err
	}
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		return nil, err
	}
	return host, s.logAutomationRun(r, automationToolHostsGet, host.ID, "")
}

func (s *Server) runAutomationAuditList(r *http.Request) (any, error) {
	events, err := s.hosts.ListAuditEvents(r.Context())
	if err != nil {
		return nil, automationStatus(http.StatusInternalServerError, err)
	}
	return events, s.logAutomationRun(r, automationToolAuditList, "", "")
}

func (s *Server) runAutomationTmuxSessionsList(r *http.Request, args map[string]string) (any, error) {
	hostID, credential, err := s.hostCredentialArgs(r, args)
	if err != nil {
		return nil, err
	}
	sessions, err := s.runTmuxListCommand(r, hostID, credential, tmux.ListSessionsCommand())
	if err != nil {
		return nil, statusWrappedTmuxError(err)
	}
	return sessions, s.logAutomationRun(r, automationToolTmuxSessionsList, hostID, "")
}

func (s *Server) runAutomationTmuxHistoryCapture(r *http.Request, args map[string]string) (any, error) {
	host, credential, sessionName, err := s.historyCaptureArgs(r, args)
	if err != nil {
		return nil, err
	}
	command, err := tmux.CapturePaneCommand(sessionName)
	if err != nil {
		return nil, err
	}
	output, err := s.ssh.Run(r.Context(), hostToSSHConfig(host), credential, command)
	if err != nil {
		return nil, automationStatus(http.StatusBadGateway, err)
	}
	text := string(output)
	result := tmuxHistoryResponse{Chunks: tmux.NormalizeHistory(text), Text: text}
	return result, s.logAutomationRun(r, automationToolTmuxHistoryCapture, host.ID, sessionName)
}

func (s *Server) hostCredentialArgs(r *http.Request, args map[string]string) (string, sshclient.Credential, error) {
	hostID, err := automationArg(args, "hostId")
	if err != nil {
		return "", sshclient.Credential{}, err
	}
	credential, err := s.sshCredentialForRequest(r, hostID, strings.TrimSpace(args["credentialToken"]))
	if err != nil {
		return "", sshclient.Credential{}, automationStatus(statusForCredentialError(err), err)
	}
	return hostID, credential, nil
}

func (s *Server) historyCaptureArgs(r *http.Request, args map[string]string) (hoststore.Host, sshclient.Credential, string, error) {
	hostID, credential, err := s.hostCredentialArgs(r, args)
	if err != nil {
		return hoststore.Host{}, sshclient.Credential{}, "", err
	}
	sessionName, err := automationArg(args, "sessionName")
	if err != nil {
		return hoststore.Host{}, sshclient.Credential{}, "", err
	}
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		return hoststore.Host{}, sshclient.Credential{}, "", err
	}
	if err := s.visibleSession(r, host, sessionName); err != nil {
		return hoststore.Host{}, sshclient.Credential{}, "", err
	}
	return host, credential, sessionName, nil
}

func automationArg(args map[string]string, name string) (string, error) {
	value := strings.TrimSpace(args[name])
	if value == "" {
		return "", fmt.Errorf("%s: %w", name, errAutomationArgumentRequired)
	}
	return value, nil
}

func (s *Server) logAutomationRun(r *http.Request, toolName string, hostID string, sessionName string) error {
	err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{
		Type: automationToolRunAuditEvent, HostID: hostID, SessionName: sessionName,
		Message: "ran automation tool: " + toolName,
	})
	if err != nil {
		return automationStatus(http.StatusInternalServerError, err)
	}
	return nil
}

func statusForAutomationError(err error) int {
	var statusErr automationStatusError
	if errors.As(err, &statusErr) {
		return statusErr.status
	}
	if errors.Is(err, errUnknownAutomationTool) {
		return http.StatusNotFound
	}
	if errors.Is(err, errAutomationArgumentRequired) || errors.Is(err, tmux.ErrInvalidSessionName) {
		return http.StatusBadRequest
	}
	if errors.Is(err, hoststore.ErrHostNotFound) || errors.Is(err, errHostNotVisible) || errors.Is(err, errSessionNotVisible) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}

func statusWrappedTmuxError(err error) error {
	if errors.Is(err, hoststore.ErrHostNotFound) || errors.Is(err, errHostNotVisible) || errors.Is(err, errSessionNotVisible) {
		return err
	}
	if errors.Is(err, tmux.ErrInvalidSessionName) {
		return err
	}
	return automationStatus(http.StatusBadGateway, err)
}

func automationStatus(status int, err error) error {
	return automationStatusError{err: err, status: status}
}
