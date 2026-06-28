package tmux

import (
	"errors"
	"strings"
)

var ErrInvalidWindowName = errors.New("window name must be 1-256 characters without tabs or newlines")

func CreateWindowCommand(sessionName string, windowName string, sourceWindowIndex *int) (string, error) {
	if err := ValidateSessionName(sessionName); err != nil {
		return "", err
	}
	if err := ValidateWindowName(windowName); err != nil {
		return "", err
	}
	sourceTarget := Target{SessionName: sessionName, WindowIndex: sourceWindowIndex}
	if err := ValidateTarget(sourceTarget); err != nil {
		return "", err
	}
	command := tmuxPrelude() + tmuxHistoryPrelude(sessionName) + tmuxCurrentPathPrelude(sourceTarget) +
		"\"$TMUX_BIN\" new-window -d -t " + shellQuote(formatNewWindowTarget(sessionName)) + " -c \"$CHATMUX_TMUX_CURRENT_PATH\" -n " +
		shellQuote(windowName) + rawListSessionsAfterSuccessCommand()
	return loginShellCommand(command), nil
}

func tmuxCurrentPathPrelude(target Target) string {
	return "CHATMUX_TMUX_CURRENT_PATH=$(\"$TMUX_BIN\" display-message -p -t " + shellQuote(formatTarget(target)) + " " +
		shellQuote("#{pane_current_path}") + ") || exit $?; "
}

func CurrentPathCommand(target Target) (string, error) {
	if err := ValidateTarget(target); err != nil {
		return "", err
	}
	command := tmuxPrelude() + "\"$TMUX_BIN\" display-message -p -t " + shellQuote(formatTarget(target)) + " " +
		shellQuote("#{pane_current_path}")
	return loginShellCommand(command), nil
}

func KillWindowCommand(target Target) (string, error) {
	if err := ValidateTarget(target); err != nil {
		return "", err
	}
	command := tmuxPrelude() + "\"$TMUX_BIN\" kill-window -t " + shellQuote(formatTarget(target)) + rawListSessionsAfterSuccessCommand()
	return loginShellCommand(command), nil
}

func RenameWindowCommand(target Target, name string) (string, error) {
	if err := ValidateTarget(target); err != nil {
		return "", err
	}
	if err := ValidateWindowName(name); err != nil {
		return "", err
	}
	command := tmuxPrelude() + "\"$TMUX_BIN\" rename-window -t " + shellQuote(formatTarget(target)) + " " + shellQuote(name) +
		rawListSessionsAfterSuccessCommand()
	return loginShellCommand(command), nil
}

// MoveWindowsCommand reorders tmux windows by applying an explicit chain of
// swap-window calls. Each entry in swaps is a [fromIndex, toIndex] pair of real
// tmux window indices that the caller knows exist (the front end derives these
// from the current window list, so they never reference an index that has been
// left empty by a deleted window). Swaps are joined with "&&" so that a failed
// swap stops the chain instead of leaving later swaps to run against a stale
// layout (and report the same missing index repeatedly). The refreshed session
// list is appended so the caller receives the post-move ordering.
func MoveWindowsCommand(sessionName string, swaps [][]int) (string, error) {
	if err := ValidateSessionName(sessionName); err != nil {
		return "", err
	}
	if len(swaps) == 0 {
		return ListSessionsCommand(), nil
	}
	parts := make([]string, 0, len(swaps))
	for _, swap := range swaps {
		if len(swap) != 2 || swap[0] < 0 || swap[1] < 0 {
			return "", ErrInvalidWindowTarget
		}
		fromIndex := swap[0]
		toIndex := swap[1]
		from := formatTarget(Target{SessionName: sessionName, WindowIndex: &fromIndex})
		to := formatTarget(Target{SessionName: sessionName, WindowIndex: &toIndex})
		parts = append(parts, "\"$TMUX_BIN\" swap-window -s "+shellQuote(from)+" -t "+shellQuote(to))
	}
	command := tmuxPrelude() + strings.Join(parts, " && ") + rawListSessionsAfterSuccessCommand()
	return loginShellCommand(command), nil
}

func RenameSessionCommand(sessionName string, newName string) (string, error) {
	if err := ValidateSessionName(sessionName); err != nil {
		return "", err
	}
	if err := ValidateSessionName(newName); err != nil {
		return "", err
	}
	command := tmuxPrelude() + "\"$TMUX_BIN\" rename-session -t " + shellQuote(formatSessionTarget(sessionName)) + " " + shellQuote(newName) +
		rawListSessionsAfterSuccessCommand()
	return loginShellCommand(command), nil
}

func ValidateWindowName(name string) error {
	if name == "" || len([]rune(name)) > maxWindowNameRunes {
		return ErrInvalidWindowName
	}
	for _, value := range name {
		if value == '\t' || value == '\n' || value == '\r' {
			return ErrInvalidWindowName
		}
	}
	return nil
}
