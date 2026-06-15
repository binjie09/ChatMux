package tmux

import "errors"

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
