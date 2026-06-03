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
	defaultOpenAIBaseURL       = "https://api.openai.com/v1"
	defaultOpenAIModel         = "gpt-5.5"
	openAIRequestTimeout       = 60 * time.Second
	openAIErrorBodyLimit int64 = 4096
)

type OpenAIConfig struct {
	APIKey     string
	BaseURL    string
	HTTPClient *http.Client
	Model      string
}

type openAIResponsesClient struct {
	apiKey  string
	baseURL string
	client  *http.Client
	model   string
}

type openAITextRequest struct {
	Input           string
	Instructions    string
	MaxOutputTokens int
	Text            *openAIResponseText
}

type openAITextResponse struct {
	Model string
	Text  string
}

func newOpenAIResponsesClient(config OpenAIConfig) (*openAIResponsesClient, error) {
	apiKey := strings.TrimSpace(config.APIKey)
	if apiKey == "" {
		return nil, errors.New("OpenAI API key is required")
	}
	return &openAIResponsesClient{
		apiKey:  apiKey,
		baseURL: strings.TrimRight(envDefault(config.BaseURL, defaultOpenAIBaseURL), "/"),
		client:  openAIHTTPClient(config.HTTPClient),
		model:   envDefault(config.Model, defaultOpenAIModel),
	}, nil
}

func (c *openAIResponsesClient) CreateText(ctx context.Context, input openAITextRequest) (openAITextResponse, error) {
	request, err := c.newHTTPRequest(ctx, input)
	if err != nil {
		return openAITextResponse{}, err
	}
	return c.doRequest(request)
}

func (c *openAIResponsesClient) newHTTPRequest(ctx context.Context, input openAITextRequest) (*http.Request, error) {
	body, err := json.Marshal(c.newRequest(input))
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/responses", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+c.apiKey)
	request.Header.Set("Content-Type", "application/json")
	return request, nil
}

func (c *openAIResponsesClient) newRequest(input openAITextRequest) openAIResponseRequest {
	return openAIResponseRequest{
		Input:           input.Input,
		Instructions:    input.Instructions,
		MaxOutputTokens: input.MaxOutputTokens,
		Model:           c.model,
		Store:           false,
		Text:            input.Text,
	}
}

func (c *openAIResponsesClient) doRequest(request *http.Request) (openAITextResponse, error) {
	response, err := c.client.Do(request)
	if err != nil {
		return openAITextResponse{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return openAITextResponse{}, openAIStatusError(response)
	}
	var payload openAIResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		return openAITextResponse{}, err
	}
	text := payload.outputText()
	if text == "" {
		return openAITextResponse{}, errors.New("OpenAI response did not include output text")
	}
	return openAITextResponse{Model: payload.Model, Text: text}, nil
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
	Input           string              `json:"input"`
	Instructions    string              `json:"instructions"`
	MaxOutputTokens int                 `json:"max_output_tokens"`
	Model           string              `json:"model"`
	Store           bool                `json:"store"`
	Text            *openAIResponseText `json:"text,omitempty"`
}

type openAIResponseText struct {
	Format openAIResponseTextFormat `json:"format"`
}

type openAIResponseTextFormat struct {
	Name   string         `json:"name,omitempty"`
	Schema map[string]any `json:"schema,omitempty"`
	Strict bool           `json:"strict,omitempty"`
	Type   string         `json:"type"`
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
