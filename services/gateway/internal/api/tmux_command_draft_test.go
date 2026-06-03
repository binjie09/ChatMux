package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeCommandDrafter struct {
	input  CommandDraftInput
	output CommandDraft
}

func (d *fakeCommandDrafter) Draft(_ context.Context, input CommandDraftInput) (CommandDraft, error) {
	d.input = input
	return d.output, nil
}

func TestDraftTmuxCommandAPI(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	runner := &fakeSSHRunner{output: "$ kubectl get ns\nprod\n"}
	drafter := &fakeCommandDrafter{output: CommandDraft{
		Command: "kubectl get pods", Explanation: "list pods", Model: "gpt-test", Risk: "low",
	}}
	server.ssh = runner
	server.drafter = drafter
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"password":"secret","prompt":"show pods"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/command-draft", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "kubectl get pods") {
		t.Fatalf("expected command draft, got %s", rec.Body.String())
	}
	if !strings.Contains(runner.command, "capture-pane") {
		t.Fatalf("expected history capture only, got %q", runner.command)
	}
	if drafter.input.Goal != "show pods" || drafter.input.Transcript != "$ kubectl get ns\nprod\n" {
		t.Fatalf("unexpected drafter input: %#v", drafter.input)
	}
}

func TestDraftTmuxCommandRequiresConfiguredDrafter(t *testing.T) {
	server, closeServer := newTestServer(t)
	defer closeServer()
	host := createTrustedTestHost(t, server)

	body := bytes.NewBufferString(`{"password":"secret","prompt":"show pods"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hosts/"+host.ID+"/tmux/sessions/deploy/command-draft", body)
	rec := httptest.NewRecorder()

	server.Handler().ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", rec.Code, rec.Body.String())
	}
}
