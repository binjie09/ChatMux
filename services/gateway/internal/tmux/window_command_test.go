package tmux

import (
	"strings"
	"testing"
)

func TestMoveWindowsCommandBuildsSwapChainForward(t *testing.T) {
	command, err := MoveWindowsCommand("deploy", [][]int{{1, 2}, {2, 3}})
	if err != nil {
		t.Fatalf("MoveWindowsCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "swap-window -s '=deploy:1' -t '=deploy:2'") {
		t.Fatalf("expected first forward swap, got %q", command)
	}
	if !containsLoginShellFragment(command, "swap-window -s '=deploy:2' -t '=deploy:3'") {
		t.Fatalf("expected second forward swap, got %q", command)
	}
	if !strings.Contains(command, " && ") {
		t.Fatalf("expected swaps joined with && so a failure stops the chain, got %q", command)
	}
	if strings.Contains(command, "=deploy:3' -t '=deploy:4'") {
		t.Fatalf("unexpected overshoot swap, got %q", command)
	}
}

func TestMoveWindowsCommandBuildsSwapChainBackward(t *testing.T) {
	command, err := MoveWindowsCommand("deploy", [][]int{{3, 2}, {2, 1}})
	if err != nil {
		t.Fatalf("MoveWindowsCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "swap-window -s '=deploy:3' -t '=deploy:2'") {
		t.Fatalf("expected first backward swap, got %q", command)
	}
	if !containsLoginShellFragment(command, "swap-window -s '=deploy:2' -t '=deploy:1'") {
		t.Fatalf("expected second backward swap, got %q", command)
	}
}

// Swaps carry real window indices (which may be non-contiguous when a window
// has been deleted), so the chain must never invent an intermediate index.
func TestMoveWindowsCommandSkipsHolesInWindowIndices(t *testing.T) {
	command, err := MoveWindowsCommand("deploy", [][]int{{1, 3}})
	if err != nil {
		t.Fatalf("MoveWindowsCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "swap-window -s '=deploy:1' -t '=deploy:3'") {
		t.Fatalf("expected direct swap across the hole at index 2, got %q", command)
	}
	if strings.Contains(command, "=deploy:2'") {
		t.Fatalf("swap chain must not reference the missing index 2, got %q", command)
	}
}

func TestMoveWindowsCommandEmptySwapsRefreshesList(t *testing.T) {
	command, err := MoveWindowsCommand("deploy", nil)
	if err != nil {
		t.Fatalf("MoveWindowsCommand failed: %v", err)
	}
	if strings.Contains(command, "swap-window") {
		t.Fatalf("expected no swaps for empty chain, got %q", command)
	}
	if !strings.Contains(command, "list-sessions") {
		t.Fatalf("expected session list refresh, got %q", command)
	}
}

func TestMoveWindowsCommandRejectsInvalidInput(t *testing.T) {
	if _, err := MoveWindowsCommand("bad name", [][]int{{0, 1}}); err == nil {
		t.Fatal("expected error for invalid session name")
	}
	if _, err := MoveWindowsCommand("deploy", [][]int{{-1, 1}}); err == nil {
		t.Fatal("expected error for negative swap index")
	}
	if _, err := MoveWindowsCommand("deploy", [][]int{{0}}); err == nil {
		t.Fatal("expected error for malformed swap pair")
	}
}
