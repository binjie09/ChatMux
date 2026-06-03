package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOpenAICommandDrafterUsesStructuredOutputs(t *testing.T) {
	var captured openAIResponseRequest
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/responses" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&captured); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		writeJSON(w, http.StatusOK, openAIResponse{
			Model: "gpt-test",
			Output: []openAIOutputItem{{
				Type:    "message",
				Content: []openAIContentPart{{Type: "output_text", Text: `{"command":"kubectl get pods","explanation":"list pods","risk":"low"}`}},
			}},
		})
	}))
	defer upstream.Close()
	drafter, err := NewOpenAICommandDrafter(OpenAICommandDrafterConfig{
		APIKey: "test-key", BaseURL: upstream.URL, HTTPClient: upstream.Client(), Model: "gpt-test",
	})
	if err != nil {
		t.Fatal(err)
	}

	draft, err := drafter.Draft(context.Background(), CommandDraftInput{
		Goal: "show pods", HostName: "prod", SessionName: "deploy", Transcript: "$ kubectl get ns",
	})

	if err != nil {
		t.Fatal(err)
	}
	if draft.Command != "kubectl get pods" || draft.Risk != "low" || draft.Model != "gpt-test" {
		t.Fatalf("unexpected draft: %#v", draft)
	}
	if captured.Text == nil || captured.Text.Format.Type != "json_schema" || !captured.Text.Format.Strict {
		t.Fatalf("expected structured output request, got %#v", captured.Text)
	}
	if !strings.Contains(captured.Input, "User goal: show pods") {
		t.Fatalf("expected goal in prompt, got %q", captured.Input)
	}
}

func TestOpenAICommandDrafterRejectsEmptyGoal(t *testing.T) {
	drafter, err := NewOpenAICommandDrafter(OpenAICommandDrafterConfig{APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}

	_, err = drafter.Draft(context.Background(), CommandDraftInput{})

	if err == nil {
		t.Fatal("expected empty goal error")
	}
}
