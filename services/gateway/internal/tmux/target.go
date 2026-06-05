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

func formatSessionTarget(sessionName string) string {
	return "=" + sessionName
}

func formatSessionWindowTarget(sessionName string) string {
	return formatSessionTarget(sessionName) + ":"
}

func formatNewWindowTarget(sessionName string) string {
	return formatSessionWindowTarget(sessionName)
}
