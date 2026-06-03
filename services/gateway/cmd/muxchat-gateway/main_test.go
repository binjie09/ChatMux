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
