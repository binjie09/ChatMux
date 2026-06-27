package tmux

import (
	"strings"
	"testing"
)

func TestMoveWindowCommandBuildsSwapChainForward(t *testing.T) {
	command, err := MoveWindowCommand("deploy", 1, 3)
	if err != nil {
		t.Fatalf("MoveWindowCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "swap-window -s '=deploy:1' -t '=deploy:2'") {
		t.Fatalf("expected first forward swap, got %q", command)
	}
	if !containsLoginShellFragment(command, "swap-window -s '=deploy:2' -t '=deploy:3'") {
		t.Fatalf("expected second forward swap, got %q", command)
	}
	if strings.Contains(command, "=deploy:3' -t '=deploy:4'") {
		t.Fatalf("unexpected overshoot swap, got %q", command)
	}
}

func TestMoveWindowCommandBuildsSwapChainBackward(t *testing.T) {
	command, err := MoveWindowCommand("deploy", 3, 1)
	if err != nil {
		t.Fatalf("MoveWindowCommand failed: %v", err)
	}
	if !containsLoginShellFragment(command, "swap-window -s '=deploy:3' -t '=deploy:2'") {
		t.Fatalf("expected first backward swap, got %q", command)
	}
	if !containsLoginShellFragment(command, "swap-window -s '=deploy:2' -t '=deploy:1'") {
		t.Fatalf("expected second backward swap, got %q", command)
	}
}

func TestMoveWindowCommandNoOpRefreshesList(t *testing.T) {
	command, err := MoveWindowCommand("deploy", 2, 2)
	if err != nil {
		t.Fatalf("MoveWindowCommand failed: %v", err)
	}
	if strings.Contains(command, "swap-window") {
		t.Fatalf("expected no swaps for same index, got %q", command)
	}
	if !strings.Contains(command, "list-sessions") {
		t.Fatalf("expected session list refresh, got %q", command)
	}
}

func TestMoveWindowCommandRejectsInvalidInput(t *testing.T) {
	if _, err := MoveWindowCommand("bad name", 0, 1); err == nil {
		t.Fatal("expected error for invalid session name")
	}
	if _, err := MoveWindowCommand("deploy", -1, 1); err == nil {
		t.Fatal("expected error for negative from index")
	}
	if _, err := MoveWindowCommand("deploy", 0, -1); err == nil {
		t.Fatal("expected error for negative to index")
	}
}
