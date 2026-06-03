package tmux

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const listSessionFormat = "#{session_id}\t#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}"

var sessionNamePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,64}$`)

var ErrInvalidSessionName = errors.New("session name must be 1-64 chars using letters, numbers, underscore, dot, or dash")

type Session struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Windows   int       `json:"windows"`
	Attached  bool      `json:"attached"`
	UpdatedAt time.Time `json:"updatedAt"`
	Status    string    `json:"status"`
	Title     string    `json:"title"`
	Tags      []string  `json:"tags"`
}

func ListSessionsCommand() string {
	return loginShellCommand(rawListSessionsCommand())
}

func CreateSessionCommand(name string) (string, error) {
	if err := ValidateSessionName(name); err != nil {
		return "", err
	}
	command := tmuxPrelude() + "\"$TMUX_BIN\" new-session -d -s " + name + " && " + rawListSessionsCommand()
	return loginShellCommand(command), nil
}

func AttachSessionCommand(name string) (string, error) {
	if err := ValidateSessionName(name); err != nil {
		return "", err
	}
	command := tmuxPrelude() + "exec \"$TMUX_BIN\" attach-session -t " + name
	return loginShellCommand(command), nil
}

func KillSessionCommand(name string) (string, error) {
	if err := ValidateSessionName(name); err != nil {
		return "", err
	}
	command := tmuxPrelude() + "\"$TMUX_BIN\" kill-session -t " + name
	return loginShellCommand(command), nil
}

func CapturePaneCommand(name string) (string, error) {
	if err := ValidateSessionName(name); err != nil {
		return "", err
	}
	command := tmuxPrelude() + "\"$TMUX_BIN\" capture-pane -p -t " + name + " -S -200"
	return loginShellCommand(command), nil
}

func ValidateSessionName(name string) error {
	if !sessionNamePattern.MatchString(name) {
		return ErrInvalidSessionName
	}
	return nil
}

func ParseSessions(output string) ([]Session, error) {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	sessions := []Session{}
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		session, err := parseSessionLine(line)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, nil
}

func parseSessionLine(line string) (Session, error) {
	parts := strings.Split(line, "\t")
	if len(parts) != 5 {
		return Session{}, fmt.Errorf("invalid tmux session line: %q", line)
	}
	windows, err := strconv.Atoi(parts[2])
	if err != nil {
		return Session{}, fmt.Errorf("parse tmux windows: %w", err)
	}
	activity, err := strconv.ParseInt(parts[4], 10, 64)
	if err != nil {
		return Session{}, fmt.Errorf("parse tmux activity: %w", err)
	}
	return Session{
		ID:        parts[0],
		Name:      parts[1],
		Windows:   windows,
		Attached:  parts[3] == "1",
		UpdatedAt: time.Unix(activity, 0).UTC(),
		Status:    sessionStatus(parts[3] == "1"),
	}, nil
}

func sessionStatus(attached bool) string {
	if attached {
		return "running"
	}
	return "idle"
}

func rawListSessionsCommand() string {
	return tmuxPrelude() + "\"$TMUX_BIN\" list-sessions -F " + shellQuote(listSessionFormat)
}

func loginShellCommand(command string) string {
	return "exec ${SHELL:-/bin/sh} -lc " + shellQuote(command)
}

func tmuxPrelude() string {
	return "TMUX_BIN=\"${MUXCHAT_TMUX_BIN:-$(command -v tmux || true)}\"; " +
		"if [ -z \"$TMUX_BIN\" ] && [ -x \"$HOME/.local/bin/tmux\" ]; then TMUX_BIN=\"$HOME/.local/bin/tmux\"; fi; " +
		"if [ -z \"$TMUX_BIN\" ]; then echo 'tmux not found in PATH, MUXCHAT_TMUX_BIN, or $HOME/.local/bin' >&2; exit 127; fi; "
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
