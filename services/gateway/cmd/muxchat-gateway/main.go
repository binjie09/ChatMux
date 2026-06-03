package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/muxchat/muxchat/services/gateway/internal/api"
	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

func main() {
	store, err := hoststore.Open(envOrDefault("MUXCHAT_DB", "muxchat.db"))
	if err != nil {
		log.Fatal(err)
	}
	defer store.Close()

	addr := envOrDefault("MUXCHAT_ADDR", ":8080")
	users, err := staticUsersFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           api.NewServer(store, api.WithStaticUsers(users)).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("muxchat gateway listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func envOrDefault(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

type envStaticUser struct {
	Name  string   `json:"name"`
	Role  api.Role `json:"role"`
	Token string   `json:"token"`
}

func staticUsersFromEnv() ([]api.StaticUser, error) {
	users := []api.StaticUser{}
	if token := os.Getenv("MUXCHAT_GATEWAY_TOKEN"); token != "" {
		users = append(users, api.StaticUser{Name: "gateway", Role: api.RoleAdmin, Token: token})
	}
	configured := os.Getenv("MUXCHAT_USERS_JSON")
	if configured == "" {
		return users, api.ValidateStaticUsers(users)
	}
	var envUsers []envStaticUser
	if err := json.Unmarshal([]byte(configured), &envUsers); err != nil {
		return nil, err
	}
	for _, user := range envUsers {
		users = append(users, api.StaticUser{Name: user.Name, Role: user.Role, Token: user.Token})
	}
	if err := api.ValidateStaticUsers(users); err != nil {
		return nil, err
	}
	return users, nil
}
