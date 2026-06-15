package api

import (
	"errors"
	"path"
	"sort"
	"strings"

	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
)

func remoteFileEntries(entries []sshclient.FileEntry) []remoteFileEntry {
	sort.Slice(entries, func(left int, right int) bool {
		if entries[left].IsDir != entries[right].IsDir {
			return entries[left].IsDir
		}
		return strings.ToLower(entries[left].Name) < strings.ToLower(entries[right].Name)
	})
	result := make([]remoteFileEntry, 0, len(entries))
	for _, entry := range entries {
		result = append(result, remoteFileEntry{
			Name:    entry.Name,
			Path:    entry.Path,
			Size:    entry.Size,
			Mode:    entry.Mode,
			ModTime: entry.ModTime,
			IsDir:   entry.IsDir,
		})
	}
	return result
}

func remoteListPath(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return defaultFileTreePath
	}
	return trimmed
}

func remoteParent(value string) string {
	cleaned := path.Clean(value)
	if cleaned == "." || cleaned == "/" {
		return ""
	}
	return path.Dir(cleaned)
}

func normalizeRemotePathOutput(output []byte) string {
	path := strings.TrimSpace(string(output))
	if path == "" {
		return defaultFileTreePath
	}
	return path
}

func uploadRemotePath(directory string, fileName string) (string, error) {
	dir := remoteListPath(directory)
	name := sanitizeRemoteUploadFileName(fileName)
	if name == "" {
		return "", errors.New("remote file name is required")
	}
	return path.Join(dir, name), nil
}

func sanitizeRemoteUploadFileName(fileName string) string {
	name := path.Base(strings.ReplaceAll(strings.TrimSpace(fileName), "\\", "/"))
	if name == "." || name == "/" {
		return ""
	}
	return strings.ReplaceAll(name, "\x00", "_")
}
