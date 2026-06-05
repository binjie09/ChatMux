package tmux

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const listSessionFormat = "session\t#{session_id}\t#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_activity}\t#{pane_current_command}\t#{pane_dead}\t#{pane_dead_status}"
const listWindowFormat = "window\t#{session_name}\t#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_activity}\t#{pane_current_command}\t#{pane_dead}\t#{pane_dead_status}"
const listSessionNowPrefix = "__chatmux_now\t"
const terminalOverridesClipboardSlot = "terminal-overrides[900]"
const tmuxDefaultHistoryLimit = 100000
const maxSessionNameRunes = 64
const maxWindowNameRunes = 256

var ErrInvalidSessionName = errors.New("session name must be 1-64 Unicode letters or numbers, underscore, dot, or dash")
var ErrInvalidWindowTarget = errors.New("window target must have a non-negative window index")

type Session struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Windows     int       `json:"windows"`
	WindowList  []Window  `json:"windowList"`
	Attached    bool      `json:"attached"`
	UpdatedAt   time.Time `json:"updatedAt"`
	Status      string    `json:"status"`
	ProcessName string    `json:"processName"`
	Title       string    `json:"title"`
	Tags        []string  `json:"tags"`
	Owner       string    `json:"owner"`
	Mode        string    `json:"mode"`
}

func ListSessionsCommand() string {
	return loginShellCommand(rawListSessionsCommand())
}

func CreateSessionCommand(name string) (string, error) {
	if err := ValidateSessionName(name); err != nil {
		return "", err
	}
	command := tmuxPrelude() + tmuxCreateSessionCommand(name) + rawListSessionsAfterSuccessCommand()
	return loginShellCommand(command), nil
}

func AttachSessionCommand(name string) (string, error) {
	return AttachTargetCommand(Target{SessionName: name})
}

func AttachTargetCommand(target Target) (string, error) {
	if err := ValidateTarget(target); err != nil {
		return "", err
	}
	sessionName := target.SessionName
	command := tmuxPrelude() + tmuxHistoryPrelude(sessionName) + tmuxClipboardPrelude() +
		"exec \"$TMUX_BIN\" attach-session -t " + shellQuote(formatTarget(target))
	return loginShellCommand(command), nil
}

func LoginShellCommand() string {
	return "exec \"${SHELL:-/bin/sh}\""
}

func KillSessionCommand(name string) (string, error) {
	if err := ValidateSessionName(name); err != nil {
		return "", err
	}
	command := tmuxPrelude() + "\"$TMUX_BIN\" kill-session -t " + shellQuote(formatSessionTarget(name))
	return loginShellCommand(command), nil
}

func CapturePaneCommand(name string) (string, error) {
	return CapturePaneCommandWithOptions(name, CapturePaneOptions{Lines: 200})
}

type CapturePaneOptions struct {
	Lines        int
	PreserveANSI bool
}

func CapturePaneCommandWithOptions(name string, options CapturePaneOptions) (string, error) {
	return CaptureTargetPaneCommand(Target{SessionName: name}, options)
}

func CaptureTargetPaneCommand(target Target, options CapturePaneOptions) (string, error) {
	if err := ValidateTarget(target); err != nil {
		return "", err
	}
	lines := normalizeCapturePaneLines(options.Lines)
	ansiFlag := ""
	if options.PreserveANSI {
		ansiFlag = " -e -C"
	}
	sessionName := target.SessionName
	command := tmuxPrelude() + tmuxHistoryPrelude(sessionName) + "\"$TMUX_BIN\" capture-pane -p" + ansiFlag +
		" -t " + shellQuote(formatTarget(target)) + " -S -" + strconv.Itoa(lines)
	return loginShellCommand(command), nil
}

func normalizeCapturePaneLines(lines int) int {
	if lines <= 0 {
		return 200
	}
	return lines
}

func ValidateSessionName(name string) error {
	if name == "" || utf8.RuneCountInString(name) > maxSessionNameRunes {
		return ErrInvalidSessionName
	}
	for _, value := range name {
		if !isSessionNameRune(value) {
			return ErrInvalidSessionName
		}
	}
	return nil
}

func isSessionNameRune(value rune) bool {
	return unicode.IsLetter(value) || unicode.IsDigit(value) || value == '_' || value == '.' || value == '-'
}

func ParseSessions(output string) ([]Session, error) {
	return ParseSessionsAt(output, time.Now())
}

func ParseSessionsAt(output string, now time.Time) ([]Session, error) {
	trimmed := strings.TrimRight(output, "\r\n")
	if strings.TrimSpace(trimmed) == "" {
		return []Session{}, nil
	}
	lines := strings.Split(trimmed, "\n")
	lines, now = parseSessionNow(lines, now)
	sessions := []Session{}
	sessionIndexes := map[string]int{}
	pendingWindows := map[string][]Window{}
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if strings.HasPrefix(line, "window\t") {
			window, sessionName, err := parseWindowLine(line, now)
			if err != nil {
				return nil, err
			}
			pendingWindows[sessionName] = append(pendingWindows[sessionName], window)
			continue
		}
		session, err := parseSessionLine(line, now)
		if err != nil {
			return nil, err
		}
		sessionIndexes[session.Name] = len(sessions)
		sessions = append(sessions, session)
	}
	sessions = applyParsedWindows(sessions, pendingWindows, sessionIndexes)
	return sessions, nil
}

func parseSessionNow(lines []string, fallback time.Time) ([]string, time.Time) {
	if len(lines) == 0 || !strings.HasPrefix(lines[0], listSessionNowPrefix) {
		return lines, fallback
	}
	epoch, err := strconv.ParseInt(strings.TrimPrefix(lines[0], listSessionNowPrefix), 10, 64)
	if err != nil {
		return lines[1:], fallback
	}
	return lines[1:], time.Unix(epoch, 0).UTC()
}

func parseSessionLine(line string, now time.Time) (Session, error) {
	line = strings.TrimPrefix(line, "session\t")
	parts := strings.Split(line, "\t")
	if len(parts) != 8 {
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
	attached, err := parseTmuxAttached(parts[3])
	if err != nil {
		return Session{}, err
	}
	paneDead, err := parseTmuxBool(parts[6], "pane dead")
	if err != nil {
		return Session{}, err
	}
	updatedAt := time.Unix(activity, 0).UTC()
	processName := normalizePaneCommand(parts[5])
	status := sessionStatus(sessionStatusInput{
		currentCommand: parts[5],
		now:            now,
		paneDead:       paneDead,
		paneDeadStatus: parts[7],
		updatedAt:      updatedAt,
	})
	return Session{
		ID:          parts[0],
		Name:        parts[1],
		Windows:     windows,
		WindowList:  defaultWindowList(parts[1], updatedAt, processName, status),
		Attached:    attached,
		UpdatedAt:   updatedAt,
		ProcessName: processName,
		Tags:        []string{},
		Status:      status,
		Mode:        "tmux",
	}, nil
}

func parseTmuxAttached(value string) (bool, error) {
	attachedCount, err := strconv.Atoi(value)
	if err != nil {
		return false, fmt.Errorf("parse tmux session attached: %q", value)
	}
	if attachedCount < 0 {
		return false, fmt.Errorf("parse tmux session attached: %q", value)
	}
	return attachedCount > 0, nil
}

func parseTmuxBool(value string, name string) (bool, error) {
	switch value {
	case "0":
		return false, nil
	case "1":
		return true, nil
	default:
		return false, fmt.Errorf("parse tmux %s: %q", name, value)
	}
}

func rawListSessionsCommand() string {
	return tmuxPrelude() + tmuxNoSessionsPrelude() +
		"sessions_output=$(\"$TMUX_BIN\" list-sessions -F " + shellQuote(listSessionFormat) + " 2>&1); " +
		"sessions_status=$?; " +
		"if [ \"$sessions_status\" -ne 0 ]; then if chatmux_tmux_no_sessions \"$sessions_output\"; then exit 0; fi; printf '%s\\n' \"$sessions_output\" >&2; exit \"$sessions_status\"; fi; " +
		"windows_output=$(\"$TMUX_BIN\" list-windows -a -F " + shellQuote(listWindowFormat) + " 2>&1); " +
		"windows_status=$?; " +
		"if [ \"$windows_status\" -ne 0 ]; then if chatmux_tmux_no_sessions \"$windows_output\"; then exit 0; fi; printf '%s\\n' \"$windows_output\" >&2; exit \"$windows_status\"; fi; " +
		"printf '__chatmux_now\\t%s\\n' \"$(date +%s)\"; printf '%s\\n' \"$sessions_output\"; printf '%s\\n' \"$windows_output\""
}

func rawListSessionsAfterSuccessCommand() string {
	return " && { " + rawListSessionsCommand() + "; }"
}

func loginShellCommand(command string) string {
	return "exec ${SHELL:-/bin/sh} -lc " + shellQuote(command)
}

func tmuxNoSessionsPrelude() string {
	return "chatmux_tmux_no_sessions() { case \"$1\" in *\"no server running\"*|*\"no sessions\"*) return 0;; *) return 1;; esac; }; "
}

func MissingTmux(output string) bool {
	return strings.Contains(output, "tmux not found in PATH, CHATMUX_TMUX_BIN, or $HOME/.local/bin")
}

func tmuxPrelude() string {
	return "TMUX_BIN=\"${CHATMUX_TMUX_BIN:-$(command -v tmux || true)}\"; " +
		"CHATMUX_TMUX_HISTORY_LIMIT=\"${CHATMUX_TMUX_HISTORY_LIMIT:-" + strconv.Itoa(tmuxDefaultHistoryLimit) + "}\"; " +
		"if [ -z \"$TMUX_BIN\" ] && [ -x \"$HOME/.local/bin/tmux\" ]; then TMUX_BIN=\"$HOME/.local/bin/tmux\"; fi; " +
		"if [ -z \"$TMUX_BIN\" ]; then echo 'tmux not found in PATH, CHATMUX_TMUX_BIN, or $HOME/.local/bin' >&2; exit 127; fi; "
}

func tmuxCreateSessionCommand(name string) string {
	quotedName := shellQuote(name)
	quotedTarget := shellQuote(formatSessionTarget(name))
	return "\"$TMUX_BIN\" start-server \\; " +
		"set-option -gq history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\" \\; " +
		"new-session -d -s " + quotedName + " \\; " +
		"set-option -t " + quotedTarget + " -q history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\""
}

func tmuxHistoryPrelude(name string) string {
	quotedTarget := shellQuote(formatSessionTarget(name))
	return "\"$TMUX_BIN\" set-option -gq history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\" || exit $?; " +
		"\"$TMUX_BIN\" set-option -t " + quotedTarget + " -q history-limit \"$CHATMUX_TMUX_HISTORY_LIMIT\" || exit $?; "
}

func tmuxClipboardPrelude() string {
	msCapability := "xterm*:Ms=\\E]52;%p1%s;%p2%s\\007"
	return "\"$TMUX_BIN\" set-option -sq set-clipboard external; " +
		"\"$TMUX_BIN\" set-option -sq " + shellQuote(terminalOverridesClipboardSlot) + " " + shellQuote(msCapability) + "; "
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}
