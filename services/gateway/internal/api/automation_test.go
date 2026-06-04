package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

type automationRunTestResponse struct {
	Result json.RawMessage `json:"result"`
	Tool   string          `json:"tool"`
}

func TestListAutomationToolsAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()

	req := httptest.NewRequest(http.MethodGet, "/api/automation/tools", nil)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var tools []automationTool
	if err := json.NewDecoder(rec.Body).Decode(&tools); err != nil {
		t.Fatalf("decode tools: %v", err)
	}
	if !hasAutomationTool(tools, automationToolHostsList) {
		t.Fatalf("expected hosts.list tool, got %#v", tools)
	}
	if !hasAutomationTool(tools, automationToolHostsGet) {
		t.Fatalf("expected hosts.get tool, got %#v", tools)
	}
	if !hasAutomationTool(tools, automationToolTmuxHistoryCapture) {
		t.Fatalf("expected tmux.history.capture tool, got %#v", tools)
	}
	if toolMissingCapabilities(tools) {
		t.Fatalf("expected every automation tool to declare capabilities: %#v", tools)
	}
	if automationToolHasInput(tools, automationToolTmuxSessionsList, "password") {
		t.Fatalf("tmux.sessions.list should not advertise password input: %#v", tools)
	}
}

func TestAutomationCapabilitiesFilterTools(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.automationCapabilities = automationCapabilitySet([]string{automationCapabilityHostsRead})

	req := httptest.NewRequest(http.MethodGet, "/api/automation/tools", nil)
	rec := httptest.NewRecorder()
	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var tools []automationTool
	if err := json.NewDecoder(rec.Body).Decode(&tools); err != nil {
		t.Fatalf("decode tools: %v", err)
	}
	if !hasAutomationTool(tools, automationToolHostsList) || !hasAutomationTool(tools, automationToolHostsGet) {
		t.Fatalf("expected host tools, got %#v", tools)
	}
	if hasAutomationTool(tools, automationToolAuditList) || hasAutomationTool(tools, automationToolTmuxSessionsList) {
		t.Fatalf("expected only host capability tools, got %#v", tools)
	}
	assertAuthStatus(t, server, http.MethodPost, "/api/automation/tools/audit.list/run", bytes.NewBufferString(`{}`), "", http.StatusNotFound)
}

func TestRunAutomationHostsListAudits(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTestHost(t, server.hosts)

	response := runAutomationTool(t, server, automationToolHostsList, `{}`)
	var hosts []hoststore.Host
	if err := json.Unmarshal(response.Result, &hosts); err != nil {
		t.Fatalf("decode hosts result: %v", err)
	}
	if response.Tool != automationToolHostsList || len(hosts) != 1 || hosts[0].ID != host.ID {
		t.Fatalf("unexpected hosts.list response: %#v %#v", response, hosts)
	}
	assertAuditEvent(t, server, automationToolRunAuditEvent, "ran automation tool: "+automationToolHostsList)
}

func TestRunAutomationHostsGet(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTestHost(t, server.hosts)

	response := runAutomationTool(t, server, automationToolHostsGet, `{"arguments":{"hostId":"`+host.ID+`"}}`)
	var actual hoststore.Host
	if err := json.Unmarshal(response.Result, &actual); err != nil {
		t.Fatalf("decode host result: %v", err)
	}
	if response.Tool != automationToolHostsGet || actual.ID != host.ID {
		t.Fatalf("unexpected hosts.get response: %#v %#v", response, actual)
	}
	assertAuditEvent(t, server, automationToolRunAuditEvent, "ran automation tool: "+automationToolHostsGet)
}

func TestRunAutomationUnknownToolReturnsNotFound(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()

	req := httptest.NewRequest(http.MethodPost, "/api/automation/tools/not.registered/run", bytes.NewBufferString(`{}`))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRunAutomationRequiresOperatorRole(t *testing.T) {
	server := newRoleTestServer(t, StaticUser{Name: "reader", Role: RoleViewer, Token: "viewer-token"})

	assertAuthStatus(t, server, http.MethodGet, "/api/automation/tools", nil, "viewer-token", http.StatusOK)
	assertAuthStatus(t, server, http.MethodPost, "/api/automation/tools/hosts.list/run", bytes.NewBufferString(`{}`), "viewer-token", http.StatusForbidden)
}

func TestRunAutomationTmuxHistoryCapture(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$ echo chatmux\nchatmux history\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := `{"arguments":{"hostId":"` + host.ID + `","sessionName":"deploy","credentialToken":"` + token + `"}}`
	response := runAutomationTool(t, server, automationToolTmuxHistoryCapture, body)

	var history tmuxHistoryResponse
	if err := json.Unmarshal(response.Result, &history); err != nil {
		t.Fatalf("decode history result: %v", err)
	}
	if !strings.Contains(history.Text, "chatmux history") || len(history.Chunks) == 0 {
		t.Fatalf("expected normalized history, got %#v", history)
	}
	if !containsLoginShellFragment(runner.command, "capture-pane -p -t 'deploy' -S -200") {
		t.Fatalf("unexpected tmux command: %q", runner.command)
	}
	if strings.Contains(runner.command, "secret") {
		t.Fatalf("password leaked into command: %q", runner.command)
	}
	assertAuditEvent(t, server, automationToolRunAuditEvent, "ran automation tool: "+automationToolTmuxHistoryCapture)
}

func TestRunAutomationTmuxSessionsListAcceptsCredentialToken(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$0\tdeploy\t1\t0\t1710000000\tzsh\t0\t\n"}
	server.ssh = runner
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	body := `{"arguments":{"hostId":"` + host.ID + `","credentialToken":"` + token + `"}}`
	response := runAutomationTool(t, server, automationToolTmuxSessionsList, body)

	var sessions []tmuxSessionForAutomationTest
	if err := json.Unmarshal(response.Result, &sessions); err != nil {
		t.Fatalf("decode sessions result: %v", err)
	}
	if len(sessions) != 1 || sessions[0].Name != "deploy" {
		t.Fatalf("expected deploy session, got %#v", sessions)
	}
	if runner.password != "secret" {
		t.Fatalf("expected credential token password, got %q", runner.password)
	}
}

func TestRunAutomationTmuxSessionsListRequiresHostID(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()

	req := httptest.NewRequest(http.MethodPost, "/api/automation/tools/tmux.sessions.list/run", bytes.NewBufferString(`{"arguments":{"credentialToken":"missing"}}`))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestRunAutomationTmuxSessionsListRejectsRawCredential(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)

	req := httptest.NewRequest(http.MethodPost, "/api/automation/tools/tmux.sessions.list/run", bytes.NewBufferString(`{"arguments":{"hostId":"`+host.ID+`","password":"secret"}}`))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", rec.Code, rec.Body.String())
	}
}

type tmuxSessionForAutomationTest struct {
	Name string `json:"name"`
}

func hasAutomationTool(tools []automationTool, name string) bool {
	for _, tool := range tools {
		if tool.Name == name {
			return true
		}
	}
	return false
}

func automationToolHasInput(tools []automationTool, name string, input string) bool {
	for _, tool := range tools {
		if tool.Name != name {
			continue
		}
		for _, candidate := range tool.Inputs {
			if candidate == input {
				return true
			}
		}
	}
	return false
}

func toolMissingCapabilities(tools []automationTool) bool {
	for _, tool := range tools {
		if len(tool.Capabilities) == 0 {
			return true
		}
	}
	return false
}

func runAutomationTool(t *testing.T, server *Server, name string, body string) automationRunTestResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/automation/tools/"+name+"/run", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var response automationRunTestResponse
	if err := json.NewDecoder(rec.Body).Decode(&response); err != nil {
		t.Fatalf("decode automation response: %v", err)
	}
	return response
}

func assertAuditEvent(t *testing.T, server *Server, eventType string, message string) {
	t.Helper()
	events, err := server.hosts.ListAuditEvents(testContext(t))
	if err != nil {
		t.Fatalf("ListAuditEvents failed: %v", err)
	}
	for _, event := range events {
		if event.Type == eventType && event.Message == message {
			return
		}
	}
	t.Fatalf("expected audit event %q %q, got %#v", eventType, message, events)
}
