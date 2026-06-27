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

// MoveWindowCommand reorders a tmux window by bubbling it from fromWindowIndex to
// toWindowIndex through a chain of adjacent swap-window calls. Each swap is a
// separate tmux invocation (run sequentially by the shell), so by the time the
// next swap runs the previous one has already taken effect and the indices it
// targets are current. The refreshed session list is appended so the caller
// receives the post-move ordering.
func MoveWindowCommand(sessionName string, fromWindowIndex int, toWindowIndex int) (string, error) {
	if err := ValidateSessionName(sessionName); err != nil {
		return "", err
	}
	if fromWindowIndex < 0 || toWindowIndex < 0 {
		return "", ErrInvalidWindowTarget
	}
	if fromWindowIndex == toWindowIndex {
		return ListSessionsCommand(), nil
	}
	swaps := moveWindowSwapChain(sessionName, fromWindowIndex, toWindowIndex)
	command := tmuxPrelude() + strings.Join(swaps, "; ") + rawListSessionsAfterSuccessCommand()
	return loginShellCommand(command), nil
}

func moveWindowSwapChain(sessionName string, fromWindowIndex int, toWindowIndex int) []string {
	swaps := []string{}
	current := fromWindowIndex
	for current != toWindowIndex {
		next := current - 1
		if toWindowIndex > current {
			next = current + 1
		}
		from := formatTarget(Target{SessionName: sessionName, WindowIndex: &current})
		to := formatTarget(Target{SessionName: sessionName, WindowIndex: &next})
		swaps = append(swaps, "\"$TMUX_BIN\" swap-window -s "+shellQuote(from)+" -t "+shellQuote(to))
		current = next
	}
	return swaps
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
