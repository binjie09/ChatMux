package tmux

import (
	"fmt"
	"regexp"
	"strings"
)

var shellPromptPattern = regexp.MustCompile(`^[[:alnum:]_.-]+@[^[:space:]:]+:[^[:space:]]*[$#] .+`)

type TranscriptChunk struct {
	ID   string `json:"id"`
	Kind string `json:"kind"`
	Text string `json:"text"`
}

func NormalizeHistory(text string) []TranscriptChunk {
	lines := trimHistoryLines(splitHistoryLines(text))
	chunks := []TranscriptChunk{}
	block := []string{}
	for _, line := range lines {
		cleanLine := strings.TrimRight(line, " \t")
		if strings.TrimSpace(cleanLine) == "" {
			chunks = appendTranscriptChunk(chunks, "output", block)
			block = []string{}
			continue
		}
		if isCommandLine(cleanLine) {
			chunks = appendTranscriptChunk(chunks, "output", block)
			chunks = appendTranscriptChunk(chunks, "command", []string{cleanLine})
			block = []string{}
			continue
		}
		block = append(block, cleanLine)
	}
	return appendTranscriptChunk(chunks, "output", block)
}

func splitHistoryLines(text string) []string {
	normalized := strings.ReplaceAll(text, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	return strings.Split(normalized, "\n")
}

func trimHistoryLines(lines []string) []string {
	start := 0
	end := len(lines)
	for start < end && strings.TrimSpace(lines[start]) == "" {
		start++
	}
	for end > start && strings.TrimSpace(lines[end-1]) == "" {
		end--
	}
	return lines[start:end]
}

func appendTranscriptChunk(chunks []TranscriptChunk, kind string, lines []string) []TranscriptChunk {
	text := strings.TrimSpace(strings.Join(lines, "\n"))
	if text == "" {
		return chunks
	}
	return append(chunks, TranscriptChunk{
		ID:   fmt.Sprintf("chunk_%d", len(chunks)+1),
		Kind: kind,
		Text: text,
	})
}

func isCommandLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	if strings.HasPrefix(trimmed, "$ ") || strings.HasPrefix(trimmed, "# ") {
		return true
	}
	return shellPromptPattern.MatchString(trimmed)
}
