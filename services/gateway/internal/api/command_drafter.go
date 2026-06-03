package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

const commandDraftMaxOutputTokens = 420

var errEmptyCommandGoal = errors.New("command draft goal is required")

type CommandDrafter interface {
	Draft(context.Context, CommandDraftInput) (CommandDraft, error)
}

type CommandDraftInput struct {
	Goal        string
	HostName    string
	SessionName string
	Transcript  string
}

type CommandDraft struct {
	Command     string `json:"command"`
	Explanation string `json:"explanation"`
	Model       string `json:"model"`
	Risk        string `json:"risk"`
}

type OpenAICommandDrafterConfig = OpenAIConfig

type openAICommandDrafter struct {
	responses *openAIResponsesClient
}

type commandDraftPayload struct {
	Command     string `json:"command"`
	Explanation string `json:"explanation"`
	Risk        string `json:"risk"`
}

func NewOpenAICommandDrafter(config OpenAICommandDrafterConfig) (CommandDrafter, error) {
	client, err := newOpenAIResponsesClient(OpenAIConfig(config))
	if err != nil {
		return nil, err
	}
	return &openAICommandDrafter{responses: client}, nil
}

func (d *openAICommandDrafter) Draft(ctx context.Context, input CommandDraftInput) (CommandDraft, error) {
	goal := strings.TrimSpace(input.Goal)
	if goal == "" {
		return CommandDraft{}, errEmptyCommandGoal
	}
	response, err := d.responses.CreateText(ctx, openAITextRequest{
		Input:           commandDraftPrompt(input, goal),
		Instructions:    commandDraftInstructions(),
		MaxOutputTokens: commandDraftMaxOutputTokens,
		Text:            commandDraftTextFormat(),
	})
	if err != nil {
		return CommandDraft{}, err
	}
	return parseCommandDraft(response)
}

func parseCommandDraft(response openAITextResponse) (CommandDraft, error) {
	var payload commandDraftPayload
	if err := json.Unmarshal([]byte(response.Text), &payload); err != nil {
		return CommandDraft{}, fmt.Errorf("parse command draft JSON: %w", err)
	}
	payload.Command = strings.TrimSpace(payload.Command)
	if payload.Command == "" {
		return CommandDraft{}, errors.New("command draft response did not include a command")
	}
	return CommandDraft{
		Command: payload.Command, Explanation: strings.TrimSpace(payload.Explanation),
		Model: response.Model, Risk: strings.TrimSpace(payload.Risk),
	}, nil
}

func commandDraftInstructions() string {
	return "Draft one shell command or terminal input for a tmux operations workspace. Return only structured JSON. Do not execute anything. Do not include secrets, passwords, or API keys. Prefer low-risk read-only commands unless the user explicitly asks for a mutation. Set risk to low, medium, or high."
}

func commandDraftPrompt(input CommandDraftInput, goal string) string {
	return fmt.Sprintf("Host: %s\nSession: %s\nUser goal: %s\n\nRecent transcript:\n%s", input.HostName, input.SessionName, goal, input.Transcript)
}

func commandDraftTextFormat() *openAIResponseText {
	return &openAIResponseText{Format: openAIResponseTextFormat{
		Type: "json_schema", Name: "command_draft", Strict: true, Schema: commandDraftSchema(),
	}}
}

func commandDraftSchema() map[string]any {
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"command", "explanation", "risk"},
		"properties": map[string]any{
			"command":     map[string]any{"type": "string"},
			"explanation": map[string]any{"type": "string"},
			"risk":        map[string]any{"type": "string", "enum": []string{"low", "medium", "high"}},
		},
	}
}
