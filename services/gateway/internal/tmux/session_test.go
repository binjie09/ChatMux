package tmux

import (
	"strings"
	"testing"
)

func TestParseSessions(t *testing.T) {
	output := "$0\tdeploy\t2\t1\t1710000000\n$1\tlogs\t1\t0\t1710000300\n"
	sessions, err := ParseSessions(output)
	if err != nil {
		t.Fatalf("ParseSessions failed: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessions))
	}
	if sessions[0].Name != "deploy" {
		t.Fatalf("expected deploy, got %q", sessions[0].Name)
	}
	if !sessions[0].Attached {
		t.Fatal("expected first session to be attached")
	}
	if sessions[0].Status != "running" {
		t.Fatalf("expected running, got %q", sessions[0].Status)
	}
	if sessions[1].Windows != 1 {
		t.Fatalf("expected one window, got %d", sessions[1].Windows)
	}
	if sessions[1].Status != "idle" {
		t.Fatalf("expected idle, got %q", sessions[1].Status)
	}
}

func TestParseSessionsRejectsBadLine(t *testing.T) {
	_, err := ParseSessions("bad line")
	if err == nil {
		t.Fatal("expected parse error")
	}
}

func TestCreateSessionCommandRejectsUnsafeName(t *testing.T) {
	_, err := CreateSessionCommand("bad;rm-rf")
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestCreateSessionCommand(t *testing.T) {
	command, err := CreateSessionCommand("deploy_1")
	if err != nil {
		t.Fatalf("CreateSessionCommand failed: %v", err)
	}
	if !strings.Contains(command, "\"$TMUX_BIN\" new-session -d -s deploy_1") {
		t.Fatalf("expected new-session command, got %q", command)
	}
	if !strings.Contains(command, "$HOME/.local/bin/tmux") {
		t.Fatalf("expected user-local tmux lookup, got %q", command)
	}
	if !strings.Contains(command, "exec ${SHELL:-/bin/sh} -lc") {
		t.Fatalf("expected login shell wrapper, got %q", command)
	}
}

func TestAttachSessionCommand(t *testing.T) {
	command, err := AttachSessionCommand("deploy_1")
	if err != nil {
		t.Fatalf("AttachSessionCommand failed: %v", err)
	}
	if !strings.Contains(command, "attach-session -t deploy_1") {
		t.Fatalf("expected attach command, got %q", command)
	}
}

func TestKillSessionCommand(t *testing.T) {
	command, err := KillSessionCommand("deploy_1")
	if err != nil {
		t.Fatalf("KillSessionCommand failed: %v", err)
	}
	if !strings.Contains(command, "kill-session -t deploy_1") {
		t.Fatalf("expected kill command, got %q", command)
	}
}

func TestCapturePaneCommand(t *testing.T) {
	command, err := CapturePaneCommand("deploy_1")
	if err != nil {
		t.Fatalf("CapturePaneCommand failed: %v", err)
	}
	if !strings.Contains(command, "capture-pane -p -t deploy_1 -S -200") {
		t.Fatalf("expected capture command, got %q", command)
	}
}
