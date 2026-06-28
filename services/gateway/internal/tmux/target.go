package tmux

import "strconv"

type Target struct {
	SessionName string
	WindowIndex *int
}

func ValidateTarget(target Target) error {
	if err := ValidateSessionName(target.SessionName); err != nil {
		return err
	}
	if target.WindowIndex != nil && *target.WindowIndex < 0 {
		return ErrInvalidWindowTarget
	}
	return nil
}

func formatTarget(target Target) string {
	if target.WindowIndex == nil {
		return formatSessionWindowTarget(target.SessionName)
	}
	return formatSessionTarget(target.SessionName) + ":" + strconv.Itoa(*target.WindowIndex)
}

// formatSessionOptionTarget returns the target string for commands that take a
// pure session target where tmux does NOT accept the `=` exact-match prefix.
//
// tmux's `=` prefix (e.g. `=name`) only disambiguates session names for
// targets that include a window component (such as `swap-window -s '=name:1'`
// or `new-window -t '=name:'`). For `set-option -t '<session>'` — a pure
// session target with no window — tmux treats `=name` as the literal session
// name and reports `no such session: =name` (verified on tmux 3.1c). Dropping
// the prefix is safe: tmux looks up the session by exact match first, then by
// prefix, and set-option runs immediately after new-session, so the session
// name already exists and is unique. The session name is validated by
// ValidateSessionName (no shell metacharacters or newlines), so passing the
// bare name is safe.
func formatSessionOptionTarget(sessionName string) string {
	return sessionName
}

func formatSessionTarget(sessionName string) string {
	return "=" + sessionName
}

func formatSessionWindowTarget(sessionName string) string {
	return formatSessionTarget(sessionName) + ":"
}

func formatNewWindowTarget(sessionName string) string {
	return formatSessionWindowTarget(sessionName)
}
