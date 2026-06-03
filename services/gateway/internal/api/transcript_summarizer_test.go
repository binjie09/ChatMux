package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeTranscriptSummarizer struct {
	input  TranscriptSummaryInput
	output TranscriptSummary
}

func (s *fakeTranscriptSummarizer) Summarize(_ context.Context, input TranscriptSummaryInput) (TranscriptSummary, error) {
	s.input = input
	return s.output, nil
}

func TestSummarizeTmuxHistoryAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$ echo deploy\nok\n"}
	summarizer := &fakeTranscriptSummarizer{output: TranscriptSummary{Summary: "deploy is ok", Model: "gpt-test"}}
	server.ssh = runner
	server.summarizer = summarizer
	host := createTrustedTestHost(t, server)
	token := createCredentialTokenForTest(t, server, testCredentialInput{hostID: host.ID})

	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/summary", credentialTokenBody(token))
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "deploy is ok") || !strings.Contains(rec.Body.String(), "gpt-test") {
		t.Fatalf("expected summary response, got %s", rec.Body.String())
	}
	if !strings.Contains(runner.command, "capture-pane") {
		t.Fatalf("expected capture-pane command, got %q", runner.command)
	}
	if summarizer.input.Transcript != "$ echo deploy\nok\n" || summarizer.input.SessionName != "deploy" {
		t.Fatalf("unexpected summarizer input: %#v", summarizer.input)
	}
}

func TestSummarizeTmuxHistoryRequiresConfiguredSummarizer(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/summary", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestOpenAITranscriptSummarizerUsesResponsesAPI(t *testing.T) {
	var captured openAIResponseRequest
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/responses" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("unexpected authorization header")
		}
		if err := json.NewDecoder(r.Body).Decode(&captured); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		writeJSON(w, http.StatusOK, openAIResponse{
			Model: "gpt-test",
			Output: []openAIOutputItem{{
				Type:    "message",
				Content: []openAIContentPart{{Type: "output_text", Text: "deploy is healthy"}},
			}},
		})
	}))
	defer upstream.Close()
	summarizer, err := NewOpenAITranscriptSummarizer(OpenAITranscriptSummarizerConfig{
		APIKey: "test-key", BaseURL: upstream.URL, HTTPClient: upstream.Client(), Model: "gpt-test",
	})
	if err != nil {
		t.Fatal(err)
	}

	summary, err := summarizer.Summarize(context.Background(), TranscriptSummaryInput{
		HostName: "prod", SessionName: "deploy", Transcript: "$ echo ok\nok",
	})

	if err != nil {
		t.Fatal(err)
	}
	if summary.Summary != "deploy is healthy" || summary.Model != "gpt-test" {
		t.Fatalf("unexpected summary: %#v", summary)
	}
	if captured.Model != "gpt-test" || captured.Store || captured.MaxOutputTokens != summaryMaxOutputTokens {
		t.Fatalf("unexpected OpenAI request: %#v", captured)
	}
	if !strings.Contains(captured.Input, "Transcript:\n$ echo ok") {
		t.Fatalf("expected transcript in prompt, got %q", captured.Input)
	}
}
