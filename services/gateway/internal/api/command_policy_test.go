package api

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCommandPolicyBlocksDeniedComposerInput(t *testing.T) {
	policy, err := NewCommandPolicy(CommandPolicyConfig{
		Mode:         CommandPolicyEnforce,
		DenyPatterns: []string{`^rm\s+-rf\s+/`},
	})
	if err != nil {
		t.Fatal(err)
	}

	decision := policy.Evaluate("rm -rf /\n")

	if decision.Allowed {
		t.Fatal("expected policy to block command")
	}
	if decision.Pattern == "" {
		t.Fatal("expected matched pattern")
	}
}

func TestCommandPolicyAuditModeAllowsMatchedInput(t *testing.T) {
	policy, err := NewCommandPolicy(CommandPolicyConfig{
		Mode:         CommandPolicyAudit,
		DenyPatterns: []string{`^shutdown`},
	})
	if err != nil {
		t.Fatal(err)
	}

	decision := policy.Evaluate("shutdown now\n")

	if !decision.Allowed {
		t.Fatal("expected audit mode to allow matched command")
	}
	if decision.Pattern == "" {
		t.Fatal("expected matched pattern")
	}
}

func TestCommandPolicyNormalizesBracketedPaste(t *testing.T) {
	policy, err := NewCommandPolicy(CommandPolicyConfig{
		Mode:         CommandPolicyEnforce,
		DenyPatterns: []string{`^mkfs`},
	})
	if err != nil {
		t.Fatal(err)
	}

	decision := policy.Evaluate("\x1b[200~mkfs /dev/sda\x1b[201~")

	if decision.Allowed {
		t.Fatal("expected bracketed paste to be normalized before policy check")
	}
}

func TestCommandPolicyRejectsInvalidPattern(t *testing.T) {
	_, err := NewCommandPolicy(CommandPolicyConfig{DenyPatterns: []string{"["}})

	if err == nil {
		t.Fatal("expected invalid regex error")
	}
}

func TestComposerInputAuditMatchDoesNotRecordRawCommand(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.commandPolicy = mustCommandPolicy(CommandPolicyConfig{
		Mode:         CommandPolicyAudit,
		DenyPatterns: []string{`^shutdown`},
	})

	allowed := server.allowTerminalInput(testTerminalInputContext(), terminalClientMessage{
		Type: "input", Data: "shutdown now\n", Source: "composer",
	})

	if !allowed {
		t.Fatal("expected audit mode to allow composer input")
	}
	events, err := server.hosts.ListAuditEvents(testContext(t))
	if err != nil {
		t.Fatalf("ListAuditEvents failed: %v", err)
	}
	if len(events) != 1 || events[0].Type != "terminal.input.policy_match" {
		t.Fatalf("expected one policy match event, got %#v", events)
	}
	if strings.Contains(events[0].Message, "shutdown now") {
		t.Fatalf("expected raw command to stay out of audit log, got %q", events[0].Message)
	}
}

func TestTerminalInputBypassesComposerPolicy(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.commandPolicy = mustCommandPolicy(CommandPolicyConfig{
		Mode:         CommandPolicyEnforce,
		DenyPatterns: []string{`^rm\s+-rf`},
	})

	allowed := server.allowTerminalInput(testTerminalInputContext(), terminalClientMessage{
		Type: "input", Data: "rm -rf /\n", Source: "terminal",
	})

	if !allowed {
		t.Fatal("expected native terminal input to bypass composer policy")
	}
	events, err := server.hosts.ListAuditEvents(testContext(t))
	if err != nil {
		t.Fatalf("ListAuditEvents failed: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("expected terminal input to skip audit recording, got %#v", events)
	}
}

func TestInstallerInputBypassesPolicyOnlyForSSHFallback(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	server.commandPolicy = mustCommandPolicy(CommandPolicyConfig{
		Mode:         CommandPolicyEnforce,
		DenyPatterns: []string{`^sudo`},
	})

	allowed := server.allowTerminalInput(testTerminalInputContextWithMode(terminalTokenModeSSH), terminalClientMessage{
		Type: "input", Data: "sudo apt-get install -y tmux\n", Source: "installer",
	})
	if !allowed {
		t.Fatal("expected installer input to run in ssh fallback")
	}
	events, err := server.hosts.ListAuditEvents(testContext(t))
	if err != nil {
		t.Fatalf("ListAuditEvents failed: %v", err)
	}
	if len(events) != 1 || events[0].Type != "terminal.tmux_install.started" {
		t.Fatalf("expected installer audit event, got %#v", events)
	}

	blocked := server.allowTerminalInput(testTerminalInputContextWithMode(terminalTokenModeTmux), terminalClientMessage{
		Type: "input", Data: "sudo apt-get install -y tmux\n", Source: "installer",
	})
	if blocked {
		t.Fatal("expected installer input to be blocked outside ssh fallback")
	}
}

func testTerminalInputContext() terminalInputContext {
	return testTerminalInputContextWithMode(terminalTokenModeTmux)
}

func testTerminalInputContextWithMode(mode string) terminalInputContext {
	return terminalInputContext{
		request: httptest.NewRequest("GET", "/api/terminal", nil),
		token: terminalToken{
			HostID:      "host_1",
			Mode:        mode,
			SessionName: "deploy",
		},
	}
}
