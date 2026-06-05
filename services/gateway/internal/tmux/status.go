package tmux

import (
	"strconv"
	"strings"
	"time"
)

const sessionRunningActivityWindow = 30 * time.Second

const (
	SessionStatusDone    = "done"
	SessionStatusFailed  = "failed"
	SessionStatusRunning = "running"
	SessionStatusUnknown = "unknown"
)

type sessionStatusInput struct {
	currentCommand string
	now            time.Time
	paneDead       bool
	paneDeadStatus string
	updatedAt      time.Time
}

func sessionStatus(input sessionStatusInput) string {
	if input.paneDead {
		return deadPaneStatus(input.paneDeadStatus)
	}
	if sessionActivityIsRecent(input.updatedAt, input.now) {
		return SessionStatusRunning
	}
	command := normalizePaneCommand(input.currentCommand)
	if command == "" {
		return SessionStatusUnknown
	}
	return SessionStatusDone
}

func sessionActivityIsRecent(updatedAt time.Time, now time.Time) bool {
	if updatedAt.IsZero() {
		return false
	}
	if now.IsZero() {
		now = time.Now()
	}
	return !now.Before(updatedAt) && now.Sub(updatedAt) <= sessionRunningActivityWindow
}

func deadPaneStatus(status string) string {
	trimmed := strings.TrimSpace(status)
	if trimmed == "" {
		return SessionStatusUnknown
	}
	exitCode, err := strconv.Atoi(trimmed)
	if err != nil {
		return SessionStatusUnknown
	}
	if exitCode == 0 {
		return SessionStatusDone
	}
	return SessionStatusFailed
}

func normalizePaneCommand(command string) string {
	command = strings.ToLower(strings.TrimSpace(command))
	if index := strings.LastIndex(command, "/"); index >= 0 {
		command = command[index+1:]
	}
	return strings.TrimPrefix(command, "-")
}
