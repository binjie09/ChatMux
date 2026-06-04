package tmux

import (
	"strings"
	"testing"
)

func TestParseSessions(t *testing.T) {
	output := "$0\tdeploy\t2\t2\t1710000000\tnode\t0\t\n$1\tlogs\t1\t0\t1710000300\tzsh\t0\t\n"
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
	if sessions[0].Status != SessionStatusRunning {
		t.Fatalf("expected running, got %q", sessions[0].Status)
	}
	if sessions[1].Windows != 1 {
		t.Fatalf("expected one window, got %d", sessions[1].Windows)
	}
	if sessions[1].Status != SessionStatusIdle {
		t.Fatalf("expected idle, got %q", sessions[1].Status)
	}
	if sessions[1].Tags == nil {
		t.Fatal("expected empty tags slice")
	}
}

func TestParseSessionsDetectsPaneStatuses(t *testing.T) {
	output := strings.Join([]string{
		"$0\trunning\t1\t0\t1710000000\tnode\t0\t",
		"$1\twaiting\t1\t1\t1710000001\tzsh\t0\t",
		"$2\tidle\t1\t0\t1710000002\t/bin/bash\t0\t",
		"$3\tfailed\t1\t0\t1710000003\tsh\t1\t2",
		"$4\tunknown\t1\t0\t1710000004\t\t0\t",
	}, "\n")
	sessions, err := ParseSessions(output)
	if err != nil {
		t.Fatalf("ParseSessions failed: %v", err)
	}
	want := []string{
		SessionStatusRunning, SessionStatusWaiting, SessionStatusIdle,
		SessionStatusFailed, SessionStatusUnknown,
	}
	for index, status := range want {
		if sessions[index].Status != status {
			t.Fatalf("session %d expected %q, got %q", index, status, sessions[index].Status)
		}
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

func TestValidateSessionNameAllowsUnicode(t *testing.T) {
	validNames := []string{"部署", "发布_1", "deploy-生产.1", strings.Repeat("部", 64)}
	for _, name := range validNames {
		if err := ValidateSessionName(name); err != nil {
			t.Fatalf("expected %q to be valid: %v", name, err)
		}
	}
}

func TestValidateSessionNameRejectsInvalidNames(t *testing.T) {
	invalidNames := []string{"", "bad;name", "bad name", "bad/name", "bad:name", strings.Repeat("a", 65)}
	for _, name := range invalidNames {
		if err := ValidateSessionName(name); err == nil {
			t.Fatalf("expected %q to be invalid", name)
		}
	}
}

func TestCreateSessionCommand(t *testing.T) {
	command, err := CreateSessionCommand("deploy_1")
	if err != nil {
		t.Fatalf("CreateSessionCommand failed: %v", err)
	}
	if !strings.Contains(command, "CHATMUX_TMUX_HISTORY_LIMIT=\"${CHATMUX_TMUX_HISTORY_LIMIT:-100000}\"") {
		t.Fatalf("expected default history limit, got %q", command)
	}
	if !containsLoginShellFragment(command, "\"$TMUX_BIN\" start-server \\; set-option -gq history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\" \\; new-session -d -s 'deploy_1'") {
		t.Fatalf("expected new-session command with history limit, got %q", command)
	}
	if !containsLoginShellFragment(command, "new-session -d -s 'deploy_1'") {
		t.Fatalf("expected new-session command, got %q", command)
	}
	if !strings.Contains(command, "$HOME/.local/bin/tmux") {
		t.Fatalf("expected user-local tmux lookup, got %q", command)
	}
	if !strings.Contains(command, "pane_current_command") || !strings.Contains(command, "pane_dead_status") {
		t.Fatalf("expected status format fields, got %q", command)
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
	if !containsLoginShellFragment(command, "attach-session -t 'deploy_1'") {
		t.Fatalf("expected attach command, got %q", command)
	}
	if !strings.Contains(command, "set-option -gq history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\"") ||
		!containsLoginShellFragment(command, "set-option -t 'deploy_1' -q history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\"") {
		t.Fatalf("expected history limit prelude, got %q", command)
	}
	if !strings.Contains(command, "set-clipboard external") {
		t.Fatalf("expected clipboard synchronization option, got %q", command)
	}
	if !strings.Contains(command, "terminal-overrides[900]") || !strings.Contains(command, `]52;%p1%s;%p2%s`) {
		t.Fatalf("expected OSC 52 terminal capability, got %q", command)
	}
}

func TestKillSessionCommand(t *testing.T) {
	command, err := KillSessionCommand("deploy_1")
	if err != nil {
		t.Fatalf("KillSessionCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "kill-session -t 'deploy_1'") {
		t.Fatalf("expected kill command, got %q", command)
	}
}

func TestCapturePaneCommand(t *testing.T) {
	command, err := CapturePaneCommand("deploy_1")
	if err != nil {
		t.Fatalf("CapturePaneCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "capture-pane -p -t 'deploy_1' -S -200") {
		t.Fatalf("expected capture command, got %q", command)
	}
	if !containsLoginShellFragment(command, "set-option -t 'deploy_1' -q history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\"") {
		t.Fatalf("expected capture command to refresh history limit, got %q", command)
	}
}

func TestCreateSessionCommandQuotesUnicodeName(t *testing.T) {
	command, err := CreateSessionCommand("部署")
	if err != nil {
		t.Fatalf("CreateSessionCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "new-session -d -s '部署'") {
		t.Fatalf("expected quoted unicode session name, got %q", command)
	}
}

func TestCapturePaneCommandWithOptions(t *testing.T) {
	command, err := CapturePaneCommandWithOptions("deploy_1", CapturePaneOptions{Lines: 800, PreserveANSI: true})
	if err != nil {
		t.Fatalf("CapturePaneCommandWithOptions failed: %v", err)
	}
	if !containsLoginShellFragment(command, "capture-pane -p -e -C -t 'deploy_1' -S -800") {
		t.Fatalf("expected capture command with ANSI history, got %q", command)
	}
}

func containsLoginShellFragment(command string, fragment string) bool {
	return strings.Contains(command, strings.ReplaceAll(fragment, "'", "'\\''"))
}
