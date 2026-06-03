package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

const (
	summaryMaxOutputTokens = 320
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

type OpenAITranscriptSummarizerConfig = OpenAIConfig

type openAITranscriptSummarizer struct {
	responses *openAIResponsesClient
}

func NewOpenAITranscriptSummarizer(config OpenAITranscriptSummarizerConfig) (TranscriptSummarizer, error) {
	client, err := newOpenAIResponsesClient(OpenAIConfig(config))
	if err != nil {
		return nil, err
	}
	return &openAITranscriptSummarizer{responses: client}, nil
}

func (s *openAITranscriptSummarizer) Summarize(ctx context.Context, input TranscriptSummaryInput) (TranscriptSummary, error) {
	transcript := strings.TrimSpace(input.Transcript)
	if transcript == "" {
		return TranscriptSummary{}, errEmptyTranscript
	}
	response, err := s.responses.CreateText(ctx, openAITextRequest{
		Input:           summaryPrompt(input, transcript),
		Instructions:    summaryInstructions(),
		MaxOutputTokens: summaryMaxOutputTokens,
	})
	return TranscriptSummary{Summary: response.Text, Model: response.Model}, err
}

func summaryInstructions() string {
	return "Summarize this tmux terminal transcript for an operations workspace. Focus on current state, recent commands, errors, blockers, and useful next actions. Do not invent facts. Keep the summary under 160 words."
}

func summaryPrompt(input TranscriptSummaryInput, transcript string) string {
	return fmt.Sprintf("Host: %s\nSession: %s\n\nTranscript:\n%s", input.HostName, input.SessionName, transcript)
}
