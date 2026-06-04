package api

import "strings"

func containsLoginShellFragment(command string, fragment string) bool {
	return strings.Contains(command, strings.ReplaceAll(fragment, "'", "'\\''"))
}
