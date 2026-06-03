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
	policy, err := commandPolicyFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	capabilities, capabilitiesConfigured, err := automationCapabilitiesFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	drafter, err := commandDrafterFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	summarizer, err := transcriptSummarizerFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	options := []api.ServerOption{api.WithStaticUsers(users), api.WithCommandPolicy(policy)}
	if capabilitiesConfigured {
		options = append(options, api.WithAutomationCapabilities(capabilities))
	}
	if drafter != nil {
		options = append(options, api.WithCommandDrafter(drafter))
	}
	if summarizer != nil {
		options = append(options, api.WithTranscriptSummarizer(summarizer))
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           api.NewServer(store, options...).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("muxchat gateway listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func automationCapabilitiesFromEnv() ([]string, bool, error) {
	configured := os.Getenv("MUXCHAT_AUTOMATION_CAPABILITIES_JSON")
	if configured == "" {
		return nil, false, nil
	}
	capabilities := []string{}
	if err := json.Unmarshal([]byte(configured), &capabilities); err != nil {
		return nil, true, err
	}
	return capabilities, true, nil
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

func commandPolicyFromEnv() (api.CommandPolicyConfig, error) {
	config := api.CommandPolicyConfig{
		Mode: api.CommandPolicyMode(os.Getenv("MUXCHAT_COMMAND_POLICY_MODE")),
	}
	patterns := os.Getenv("MUXCHAT_COMMAND_DENY_PATTERNS_JSON")
	if patterns == "" {
		return config, nil
	}
	if err := json.Unmarshal([]byte(patterns), &config.DenyPatterns); err != nil {
		return api.CommandPolicyConfig{}, err
	}
	if _, err := api.NewCommandPolicy(config); err != nil {
		return api.CommandPolicyConfig{}, err
	}
	return config, nil
}

func commandDrafterFromEnv() (api.CommandDrafter, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return nil, nil
	}
	return api.NewOpenAICommandDrafter(openAIConfigFromEnv(apiKey))
}

func transcriptSummarizerFromEnv() (api.TranscriptSummarizer, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return nil, nil
	}
	return api.NewOpenAITranscriptSummarizer(openAIConfigFromEnv(apiKey))
}

func openAIConfigFromEnv(apiKey string) api.OpenAIConfig {
	return api.OpenAIConfig{
		APIKey:  apiKey,
		BaseURL: os.Getenv("OPENAI_BASE_URL"),
		Model:   os.Getenv("OPENAI_MODEL"),
	}
}
