package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	defaultOpenAIBaseURL         = "https://api.openai.com/v1"
	defaultOpenAIModel           = "gpt-5.5"
	openAIRequestTimeout         = 60 * time.Second
	openAIErrorBodyLimit   int64 = 4096
	summaryMaxOutputTokens       = 320
)

var errEmptyTranscript = errors.New("transcript is empty")

type TranscriptSummarizer interface {
	Summarize(context.Context, TranscriptSummaryInput) (TranscriptSummary, error)
}

type TranscriptSummaryInput struct {
	HostName    string
	SessionName string
	Transcript  string
}

type TranscriptSummary struct {
	Summary string `json:"summary"`
	Model   string `json:"model"`
}

type OpenAITranscriptSummarizerConfig struct {
	APIKey     string
	BaseURL    string
	HTTPClient *http.Client
	Model      string
}

type openAITranscriptSummarizer struct {
	apiKey  string
	baseURL string
	client  *http.Client
	model   string
}

func NewOpenAITranscriptSummarizer(config OpenAITranscriptSummarizerConfig) (TranscriptSummarizer, error) {
	apiKey := strings.TrimSpace(config.APIKey)
	if apiKey == "" {
		return nil, errors.New("OpenAI API key is required")
	}
	return &openAITranscriptSummarizer{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(envDefault(config.BaseURL, defaultOpenAIBaseURL), "/"),
		client:  openAIHTTPClient(config.HTTPClient),
		model:   envDefault(config.Model, defaultOpenAIModel),
	}, nil
}

func (s *openAITranscriptSummarizer) Summarize(ctx context.Context, input TranscriptSummaryInput) (TranscriptSummary, error) {
	transcript := strings.TrimSpace(input.Transcript)
	if transcript == "" {
		return TranscriptSummary{}, errEmptyTranscript
	}
	body, err := json.Marshal(s.newRequest(input, transcript))
	if err != nil {
		return TranscriptSummary{}, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.baseURL+"/responses", bytes.NewReader(body))
	if err != nil {
		return TranscriptSummary{}, err
	}
	request.Header.Set("Authorization", "Bearer "+s.apiKey)
	request.Header.Set("Content-Type", "application/json")
	return s.doRequest(request)
}

func (s *openAITranscriptSummarizer) newRequest(input TranscriptSummaryInput, transcript string) openAIResponseRequest {
	return openAIResponseRequest{
		Input:           summaryPrompt(input, transcript),
		Instructions:    summaryInstructions(),
		MaxOutputTokens: summaryMaxOutputTokens,
		Model:           s.model,
		Store:           false,
	}
}

func (s *openAITranscriptSummarizer) doRequest(request *http.Request) (TranscriptSummary, error) {
	response, err := s.client.Do(request)
	if err != nil {
		return TranscriptSummary{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return TranscriptSummary{}, openAIStatusError(response)
	}
	var payload openAIResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return TranscriptSummary{}, err
	}
	summary := payload.outputText()
	if summary == "" {
		return TranscriptSummary{}, errors.New("OpenAI response did not include output text")
	}
	return TranscriptSummary{Summary: summary, Model: payload.Model}, nil
}

func summaryInstructions() string {
	return "Summarize this tmux terminal transcript for an operations workspace. Focus on current state, recent commands, errors, blockers, and useful next actions. Do not invent facts. Keep the summary under 160 words."
}

func summaryPrompt(input TranscriptSummaryInput, transcript string) string {
	return fmt.Sprintf("Host: %s\nSession: %s\n\nTranscript:\n%s", input.HostName, input.SessionName, transcript)
}

func openAIHTTPClient(client *http.Client) *http.Client {
	if client != nil {
		return client
	}
	return &http.Client{Timeout: openAIRequestTimeout}
}

func openAIStatusError(response *http.Response) error {
	body, _ := io.ReadAll(io.LimitReader(response.Body, openAIErrorBodyLimit))
	return fmt.Errorf("OpenAI response failed with status %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
}

func envDefault(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

type openAIResponseRequest struct {
	Input           string `json:"input"`
	Instructions    string `json:"instructions"`
	MaxOutputTokens int    `json:"max_output_tokens"`
	Model           string `json:"model"`
	Store           bool   `json:"store"`
}

type openAIResponse struct {
	Model  string             `json:"model"`
	Output []openAIOutputItem `json:"output"`
}

type openAIOutputItem struct {
	Content []openAIContentPart `json:"content"`
	Type    string              `json:"type"`
}

type openAIContentPart struct {
	Text string `json:"text"`
	Type string `json:"type"`
}

func (r openAIResponse) outputText() string {
	parts := []string{}
	for _, item := range r.Output {
		for _, content := range item.Content {
			if content.Type == "output_text" && strings.TrimSpace(content.Text) != "" {
				parts = append(parts, content.Text)
			}
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}
