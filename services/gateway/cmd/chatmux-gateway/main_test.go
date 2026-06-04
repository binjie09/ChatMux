package main

import (
	"testing"

	"github.com/chatmux/chatmux/services/gateway/internal/api"
)

func TestStaticUsersFromEnvIncludesGatewayToken(t *testing.T) {
	t.Setenv("CHATMUX_GATEWAY_TOKEN", "admin-token")

	users, err := staticUsersFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 || users[0].Name != "gateway" || users[0].Role != api.RoleAdmin {
		t.Fatalf("unexpected users: %#v", users)
	}
}

func TestStaticUsersFromEnvRequiresGatewayToken(t *testing.T) {
	_, err := staticUsersFromEnv()

	if err == nil {
		t.Fatal("expected required gateway token error")
	}
}

func TestStaticUsersFromEnvParsesConfiguredUsers(t *testing.T) {
	t.Setenv("CHATMUX_GATEWAY_TOKEN", "admin-token")
	t.Setenv("CHATMUX_USERS_JSON", `[{"name":"ops","role":"operator","token":"ops-token"}]`)

	users, err := staticUsersFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 2 || users[1].Name != "ops" || users[1].Role != api.RoleOperator {
		t.Fatalf("unexpected users: %#v", users)
	}
}

func TestStaticUsersFromEnvRejectsInvalidRole(t *testing.T) {
	t.Setenv("CHATMUX_GATEWAY_TOKEN", "admin-token")
	t.Setenv("CHATMUX_USERS_JSON", `[{"name":"ops","role":"owner","token":"ops-token"}]`)

	_, err := staticUsersFromEnv()

	if err == nil {
		t.Fatal("expected invalid role error")
	}
}

func TestCommandPolicyFromEnvParsesPatterns(t *testing.T) {
	t.Setenv("CHATMUX_COMMAND_POLICY_MODE", "enforce")
	t.Setenv("CHATMUX_COMMAND_DENY_PATTERNS_JSON", `["^rm\\s+-rf"]`)

	config, err := commandPolicyFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if config.Mode != api.CommandPolicyEnforce || len(config.DenyPatterns) != 1 || config.DenyPatterns[0] != `^rm\s+-rf` {
		t.Fatalf("unexpected command policy config: %#v", config)
	}
}

func TestCommandPolicyFromEnvRejectsInvalidPattern(t *testing.T) {
	t.Setenv("CHATMUX_COMMAND_DENY_PATTERNS_JSON", `["["]`)

	_, err := commandPolicyFromEnv()

	if err == nil {
		t.Fatal("expected invalid command policy pattern")
	}
}

func TestAutomationCapabilitiesFromEnvParsesConfiguredCapabilities(t *testing.T) {
	t.Setenv("CHATMUX_AUTOMATION_CAPABILITIES_JSON", `["hosts.read","audit.read"]`)

	capabilities, configured, err := automationCapabilitiesFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if !configured || len(capabilities) != 2 || capabilities[0] != "hosts.read" || capabilities[1] != "audit.read" {
		t.Fatalf("unexpected automation capabilities: %#v configured=%v", capabilities, configured)
	}
}

func TestAutomationCapabilitiesFromEnvDisabledWithoutConfig(t *testing.T) {
	capabilities, configured, err := automationCapabilitiesFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if configured || capabilities != nil {
		t.Fatalf("expected no automation capability override, got %#v configured=%v", capabilities, configured)
	}
}

func TestAutomationCapabilitiesFromEnvRejectsInvalidJSON(t *testing.T) {
	t.Setenv("CHATMUX_AUTOMATION_CAPABILITIES_JSON", `{`)

	_, _, err := automationCapabilitiesFromEnv()

	if err == nil {
		t.Fatal("expected invalid automation capability JSON")
	}
}

func TestTranscriptSummarizerFromEnvDisabledWithoutKey(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")

	summarizer, err := transcriptSummarizerFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if summarizer != nil {
		t.Fatal("expected nil summarizer without OPENAI_API_KEY")
	}
}

func TestTranscriptSummarizerFromEnvCreatesOpenAIClient(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "test-key")
	t.Setenv("OPENAI_MODEL", "gpt-test")

	summarizer, err := transcriptSummarizerFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if summarizer == nil {
		t.Fatal("expected configured summarizer")
	}
}

func TestCommandDrafterFromEnvDisabledWithoutKey(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "")

	drafter, err := commandDrafterFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if drafter != nil {
		t.Fatal("expected nil drafter without OPENAI_API_KEY")
	}
}

func TestCommandDrafterFromEnvCreatesOpenAIClient(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "test-key")
	t.Setenv("OPENAI_MODEL", "gpt-test")

	drafter, err := commandDrafterFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if drafter == nil {
		t.Fatal("expected configured drafter")
	}
}
