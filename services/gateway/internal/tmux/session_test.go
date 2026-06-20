package tmux

import (
	"strings"
	"testing"
	"time"
)

func TestParseSessions(t *testing.T) {
	output := strings.Join([]string{
		"session\t$0\tdeploy\t2\t2\t1710000000\tnode\t0\t",
		"session\t$1\tlogs\t1\t0\t1710000300\tzsh\t0\t",
		"window\tdeploy\t@0\t0\tapi\t1\t1710000002\tnode\t0\t\t0\tdeploy-api",
		"window\tdeploy\t@1\t1\tworker\t0\t1710000000\tzsh\t0\t\t1\t",
		"window\tlogs\t@2\t0\tlogs\t1\t1710000300\tzsh\t0\t\t0\tlogs-tail",
	}, "\n")
	now := time.Unix(1710000005, 0).UTC()
	sessions, err := ParseSessionsAt(output, now)
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
	if sessions[0].ProcessName != "node" {
		t.Fatalf("expected process name node, got %q", sessions[0].ProcessName)
	}
	if sessions[1].Windows != 1 {
		t.Fatalf("expected one window, got %d", sessions[1].Windows)
	}
	if len(sessions[0].WindowList) != 2 {
		t.Fatalf("expected two parsed windows, got %#v", sessions[0].WindowList)
	}
	if sessions[0].WindowList[0].Name != "api" || !sessions[0].WindowList[0].Active {
		t.Fatalf("expected active api window, got %#v", sessions[0].WindowList[0])
	}
	if sessions[0].WindowList[0].AutoRename {
		t.Fatalf("expected api window autoRename=false, got %#v", sessions[0].WindowList[0])
	}
	if !sessions[0].WindowList[1].AutoRename {
		t.Fatalf("expected worker window autoRename=true, got %#v", sessions[0].WindowList[1])
	}
	if sessions[0].WindowList[0].PaneTitle != "deploy-api" {
		t.Fatalf("expected api window paneTitle=deploy-api, got %#v", sessions[0].WindowList[0])
	}
	if sessions[0].WindowList[1].PaneTitle != "" {
		t.Fatalf("expected worker window empty paneTitle, got %#v", sessions[0].WindowList[1])
	}
	if sessions[1].Status != SessionStatusDone {
		t.Fatalf("expected done, got %q", sessions[1].Status)
	}
	if sessions[1].Tags == nil {
		t.Fatal("expected empty tags slice")
	}
}

func TestParseSessionsAddsDefaultWindowForLegacyOutput(t *testing.T) {
	output := "$0\tdeploy\t1\t0\t1710000000\tzsh\t0\t\n"
	sessions, err := ParseSessionsAt(output, time.Unix(1710000040, 0).UTC())
	if err != nil {
		t.Fatalf("ParseSessions failed: %v", err)
	}
	if len(sessions) != 1 || len(sessions[0].WindowList) != 1 {
		t.Fatalf("expected default window list, got %#v", sessions)
	}
	if sessions[0].WindowList[0].Index != 0 || sessions[0].WindowList[0].ID != "deploy:0" {
		t.Fatalf("unexpected default window: %#v", sessions[0].WindowList[0])
	}
}

func TestParseSessionsDetectsPaneStatuses(t *testing.T) {
	now := time.Unix(1710000040, 0).UTC()
	output := strings.Join([]string{
		"$0\trunning\t1\t0\t1710000020\tnode\t0\t",
		"$1\tattached-done\t1\t1\t1710000001\tzsh\t0\t",
		"$2\tshell-done\t1\t0\t1710000002\t/bin/bash\t0\t",
		"$3\tfailed\t1\t0\t1710000003\tsh\t1\t2",
		"$4\tunknown\t1\t0\t1710000004\t\t0\t",
		"$5\tdone\t1\t0\t1710000005\tnode\t0\t",
		"$6\tdead-done\t1\t0\t1710000006\tsh\t1\t0",
	}, "\n")
	sessions, err := ParseSessionsAt(output, now)
	if err != nil {
		t.Fatalf("ParseSessions failed: %v", err)
	}
	want := []string{
		SessionStatusRunning, SessionStatusDone, SessionStatusDone,
		SessionStatusFailed, SessionStatusUnknown, SessionStatusDone, SessionStatusDone,
	}
	for index, status := range want {
		if sessions[index].Status != status {
			t.Fatalf("session %d expected %q, got %q", index, status, sessions[index].Status)
		}
	}
}

func TestParseSessionsUsesRemoteNowPrefix(t *testing.T) {
	output := "__chatmux_now\t1710000040\n$0\tdeploy\t1\t0\t1710000020\tcodex\t0\t\n"
	sessions, err := ParseSessionsAt(output, time.Unix(2000000000, 0).UTC())
	if err != nil {
		t.Fatalf("ParseSessions failed: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].Status != SessionStatusRunning {
		t.Fatalf("expected remote-now running, got %q", sessions[0].Status)
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
	if !strings.Contains(command, "__chatmux_now") || !strings.Contains(command, "date +%s") {
		t.Fatalf("expected remote now prefix, got %q", command)
	}
	if !containsLoginShellFragment(command, "&& { TMUX_BIN=") {
		t.Fatalf("expected list refresh to be gated by command success, got %q", command)
	}
	if !containsLoginShellFragment(command, `chatmux_tmux_no_sessions() { case "$1" in *"no server running"*|*"no sessions"*) return 0`) {
		t.Fatalf("expected no-session tmux guard, got %q", command)
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
	if !containsLoginShellFragment(command, "attach-session -t '=deploy_1:'") {
		t.Fatalf("expected attach command, got %q", command)
	}
	if !strings.Contains(command, "set-option -gq history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\"") ||
		!containsLoginShellFragment(command, "set-option -t '=deploy_1' -q history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\"") {
		t.Fatalf("expected history limit prelude, got %q", command)
	}
	if !strings.Contains(command, "set-clipboard external") {
		t.Fatalf("expected clipboard synchronization option, got %q", command)
	}
	if !strings.Contains(command, "terminal-overrides[900]") || !strings.Contains(command, `]52;%p1%s;%p2%s`) {
		t.Fatalf("expected OSC 52 terminal capability, got %q", command)
	}
}

func TestAttachTargetCommandTargetsWindow(t *testing.T) {
	windowIndex := 1
	command, err := AttachTargetCommand(Target{SessionName: "deploy_1", WindowIndex: &windowIndex})
	if err != nil {
		t.Fatalf("AttachTargetCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "attach-session -t '=deploy_1:1'") {
		t.Fatalf("expected attach window target, got %q", command)
	}
}

func TestKillSessionCommand(t *testing.T) {
	command, err := KillSessionCommand("deploy_1")
	if err != nil {
		t.Fatalf("KillSessionCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "kill-session -t '=deploy_1'") {
		t.Fatalf("expected kill command, got %q", command)
	}
}

func TestCapturePaneCommand(t *testing.T) {
	command, err := CapturePaneCommand("deploy_1")
	if err != nil {
		t.Fatalf("CapturePaneCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "capture-pane -p -t '=deploy_1:' -S -200") {
		t.Fatalf("expected capture command, got %q", command)
	}
	if !containsLoginShellFragment(command, "set-option -t '=deploy_1' -q history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\"") {
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
	if !containsLoginShellFragment(command, "capture-pane -p -e -C -t '=deploy_1:' -S -800") {
		t.Fatalf("expected capture command with ANSI history, got %q", command)
	}
}

func TestCaptureTargetPaneCommandTargetsWindow(t *testing.T) {
	windowIndex := 2
	command, err := CaptureTargetPaneCommand(Target{SessionName: "deploy_1", WindowIndex: &windowIndex}, CapturePaneOptions{Lines: 800, PreserveANSI: true})
	if err != nil {
		t.Fatalf("CaptureTargetPaneCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "capture-pane -p -e -C -t '=deploy_1:2' -S -800") {
		t.Fatalf("expected capture command with window target, got %q", command)
	}
}

func TestCreateWindowCommand(t *testing.T) {
	command, err := CreateWindowCommand("deploy_1", "logs", nil)
	if err != nil {
		t.Fatalf("CreateWindowCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "display-message -p -t '=deploy_1:' '#{pane_current_path}'") {
		t.Fatalf("expected current path lookup, got %q", command)
	}
	if !strings.Contains(command, "-c \"$CHATMUX_TMUX_CURRENT_PATH\"") {
		t.Fatalf("expected new-window to inherit current path, got %q", command)
	}
	if !containsLoginShellFragment(command, "new-window -d -t '=deploy_1:' -c \"$CHATMUX_TMUX_CURRENT_PATH\" -n 'logs'") {
		t.Fatalf("expected new-window command, got %q", command)
	}
	if !strings.Contains(command, "list-windows -a") {
		t.Fatalf("expected refreshed list command, got %q", command)
	}
}

func TestCreateWindowCommandUsesSourceWindowPath(t *testing.T) {
	windowIndex := 2
	command, err := CreateWindowCommand("deploy_1", "logs", &windowIndex)
	if err != nil {
		t.Fatalf("CreateWindowCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "display-message -p -t '=deploy_1:2' '#{pane_current_path}'") {
		t.Fatalf("expected source window current path lookup, got %q", command)
	}
	if !containsLoginShellFragment(command, "new-window -d -t '=deploy_1:' -c \"$CHATMUX_TMUX_CURRENT_PATH\" -n 'logs'") {
		t.Fatalf("expected new-window command with current path, got %q", command)
	}
}

func TestCreateWindowCommandTargetsNumericSessionName(t *testing.T) {
	command, err := CreateWindowCommand("14", "logs", nil)
	if err != nil {
		t.Fatalf("CreateWindowCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "set-option -t '=14' -q history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\"") {
		t.Fatalf("expected exact numeric session target in history prelude, got %q", command)
	}
	if !containsLoginShellFragment(command, "new-window -d -t '=14:' -c \"$CHATMUX_TMUX_CURRENT_PATH\" -n 'logs'") {
		t.Fatalf("expected exact numeric session target for new-window, got %q", command)
	}
}

func TestRenameWindowCommand(t *testing.T) {
	windowIndex := 1
	command, err := RenameWindowCommand(Target{SessionName: "deploy_1", WindowIndex: &windowIndex}, "api")
	if err != nil {
		t.Fatalf("RenameWindowCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "rename-window -t '=deploy_1:1' 'api'") {
		t.Fatalf("expected rename-window command, got %q", command)
	}
}

func TestKillWindowCommand(t *testing.T) {
	windowIndex := 1
	command, err := KillWindowCommand(Target{SessionName: "deploy_1", WindowIndex: &windowIndex})
	if err != nil {
		t.Fatalf("KillWindowCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "kill-window -t '=deploy_1:1'") {
		t.Fatalf("expected kill-window command, got %q", command)
	}
	if !containsLoginShellFragment(command, "&& { TMUX_BIN=") {
		t.Fatalf("expected list refresh to be gated by kill success, got %q", command)
	}
}

func TestRenameSessionCommand(t *testing.T) {
	command, err := RenameSessionCommand("deploy_1", "deploy_2")
	if err != nil {
		t.Fatalf("RenameSessionCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "rename-session -t '=deploy_1' 'deploy_2'") {
		t.Fatalf("expected rename-session command, got %q", command)
	}
}

func containsLoginShellFragment(command string, fragment string) bool {
	return strings.Contains(command, strings.ReplaceAll(fragment, "'", "'\\''"))
}
