package tmux

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

const listSessionFormat = "#{session_id}\t#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}"

type Session struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Windows   int       `json:"windows"`
	Attached  bool      `json:"attached"`
	UpdatedAt time.Time `json:"updatedAt"`
	Status    string    `json:"status"`
}

func ListSessionsCommand() string {
	return "tmux list-sessions -F '" + listSessionFormat + "'"
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
		Status:    "unknown",
	}, nil
}
