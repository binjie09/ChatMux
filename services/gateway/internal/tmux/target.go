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
		return target.SessionName
	}
	return target.SessionName + ":" + strconv.Itoa(*target.WindowIndex)
}
