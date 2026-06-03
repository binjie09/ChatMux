package main

import (
	"testing"

	"github.com/muxchat/muxchat/services/gateway/internal/api"
)

func TestStaticUsersFromEnvIncludesGatewayToken(t *testing.T) {
	t.Setenv("MUXCHAT_GATEWAY_TOKEN", "admin-token")

	users, err := staticUsersFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 || users[0].Name != "gateway" || users[0].Role != api.RoleAdmin {
		t.Fatalf("unexpected users: %#v", users)
	}
}

func TestStaticUsersFromEnvParsesConfiguredUsers(t *testing.T) {
	t.Setenv("MUXCHAT_USERS_JSON", `[{"name":"ops","role":"operator","token":"ops-token"}]`)

	users, err := staticUsersFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 || users[0].Name != "ops" || users[0].Role != api.RoleOperator {
		t.Fatalf("unexpected users: %#v", users)
	}
}

func TestStaticUsersFromEnvRejectsInvalidRole(t *testing.T) {
	t.Setenv("MUXCHAT_USERS_JSON", `[{"name":"ops","role":"owner","token":"ops-token"}]`)

	_, err := staticUsersFromEnv()

	if err == nil {
		t.Fatal("expected invalid role error")
	}
}

func TestCommandPolicyFromEnvParsesPatterns(t *testing.T) {
	t.Setenv("MUXCHAT_COMMAND_POLICY_MODE", "enforce")
	t.Setenv("MUXCHAT_COMMAND_DENY_PATTERNS_JSON", `["^rm\\s+-rf"]`)

	config, err := commandPolicyFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if config.Mode != api.CommandPolicyEnforce || len(config.DenyPatterns) != 1 || config.DenyPatterns[0] != `^rm\s+-rf` {
		t.Fatalf("unexpected command policy config: %#v", config)
	}
}

func TestCommandPolicyFromEnvRejectsInvalidPattern(t *testing.T) {
	t.Setenv("MUXCHAT_COMMAND_DENY_PATTERNS_JSON", `["["]`)

	_, err := commandPolicyFromEnv()

	if err == nil {
		t.Fatal("expected invalid command policy pattern")
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
