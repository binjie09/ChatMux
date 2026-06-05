package tmux

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type Window struct {
	ID          string    `json:"id"`
	Index       int       `json:"index"`
	Name        string    `json:"name"`
	Active      bool      `json:"active"`
	UpdatedAt   time.Time `json:"updatedAt"`
	Status      string    `json:"status"`
	ProcessName string    `json:"processName"`
}

func parseWindowLine(line string, now time.Time) (Window, string, error) {
	parts := strings.Split(line, "\t")
	if len(parts) != 10 {
		return Window{}, "", fmt.Errorf("invalid tmux window line: %q", line)
	}
	index, err := strconv.Atoi(parts[3])
	if err != nil {
		return Window{}, "", fmt.Errorf("parse tmux window index: %w", err)
	}
	active, err := parseTmuxBool(parts[5], "window active")
	if err != nil {
		return Window{}, "", err
	}
	activity, err := strconv.ParseInt(parts[6], 10, 64)
	if err != nil {
		return Window{}, "", fmt.Errorf("parse tmux window activity: %w", err)
	}
	paneDead, err := parseTmuxBool(parts[8], "pane dead")
	if err != nil {
		return Window{}, "", err
	}
	updatedAt := time.Unix(activity, 0).UTC()
	processName := normalizePaneCommand(parts[7])
	status := sessionStatus(sessionStatusInput{
		currentCommand: parts[7],
		now:            now,
		paneDead:       paneDead,
		paneDeadStatus: parts[9],
		updatedAt:      updatedAt,
	})
	return Window{
		ID: parts[2], Index: index, Name: normalizeWindowName(parts[4]),
		Active: active, UpdatedAt: updatedAt, ProcessName: processName, Status: status,
	}, parts[1], nil
}

func applyParsedWindows(
	sessions []Session,
	pendingWindows map[string][]Window,
	sessionIndexes map[string]int,
) []Session {
	for sessionName, windows := range pendingWindows {
		index, ok := sessionIndexes[sessionName]
		if !ok {
			continue
		}
		sessions[index].WindowList = windows
		sessions[index].Windows = len(windows)
	}
	return sessions
}

func defaultWindowList(sessionName string, updatedAt time.Time, processName string, status string) []Window {
	return []Window{{
		ID: sessionName + ":0", Index: 0, Name: "0",
		Active: true, UpdatedAt: updatedAt, ProcessName: processName, Status: status,
	}}
}

func normalizeWindowName(name string) string {
	if utf8.RuneCountInString(name) <= maxWindowNameRunes {
		return name
	}
	return string([]rune(name)[:maxWindowNameRunes])
}
