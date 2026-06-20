package api

import (
	"errors"
	"strconv"
	"sync"
	"time"

	"github.com/chatmux/chatmux/services/gateway/internal/sshclient"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
)

const fallbackSSHProcessName = "ssh"

var (
	errFallbackWindowNotFound = errors.New("ssh fallback window is not visible")
	errFallbackLastWindow     = errors.New("cannot delete the last ssh fallback window")
)

type sshFallbackStore struct {
	mu       sync.Mutex
	sessions map[string]*sshFallbackSession
}

type sshFallbackSession struct {
	hostID  string
	windows []*sshFallbackWindow
}

type sshFallbackWindow struct {
	index     int
	name      string
	updatedAt time.Time
	terminal  *sshFallbackTerminal
}

func newSSHFallbackStore() *sshFallbackStore {
	return &sshFallbackStore{sessions: map[string]*sshFallbackSession{}}
}

func (s *sshFallbackStore) Session(hostID string, now time.Time) tmux.Session {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessionLocked(hostID, now).tmuxSession()
}

func (s *sshFallbackStore) CreateWindow(hostID string, name string, now time.Time) (tmux.Session, error) {
	if err := tmux.ValidateWindowName(name); err != nil {
		return tmux.Session{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessionLocked(hostID, now)
	session.windows = append(session.windows, &sshFallbackWindow{
		index:     session.nextWindowIndex(),
		name:      name,
		updatedAt: now.UTC(),
	})
	return session.tmuxSession(), nil
}

func (s *sshFallbackStore) RenameWindow(hostID string, windowIndex int, name string, now time.Time) (tmux.Session, error) {
	if err := tmux.ValidateWindowName(name); err != nil {
		return tmux.Session{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessionLocked(hostID, now)
	window := session.window(windowIndex)
	if window == nil {
		return tmux.Session{}, errFallbackWindowNotFound
	}
	window.name = name
	window.updatedAt = now.UTC()
	return session.tmuxSession(), nil
}

func (s *sshFallbackStore) DeleteWindow(hostID string, windowIndex int, now time.Time) (tmux.Session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessionLocked(hostID, now)
	if len(session.windows) <= 1 {
		return tmux.Session{}, errFallbackLastWindow
	}
	for index, window := range session.windows {
		if window.index != windowIndex {
			continue
		}
		session.windows = append(session.windows[:index], session.windows[index+1:]...)
		window.closeTerminal()
		return session.tmuxSession(), nil
	}
	return tmux.Session{}, errFallbackWindowNotFound
}

func (s *sshFallbackStore) HasWindow(hostID string, windowIndex int, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.sessionLocked(hostID, now).window(windowIndex) != nil
}

func (s *sshFallbackStore) BindTerminal(hostID string, windowIndex int, terminal *sshclient.Terminal, now time.Time) (*sshFallbackTerminal, error) {
	if terminal == nil {
		return nil, errors.New("ssh fallback terminal is nil")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessionLocked(hostID, now)
	window := session.window(windowIndex)
	if window == nil {
		_ = terminal.Close()
		return nil, errFallbackWindowNotFound
	}
	window.updatedAt = now.UTC()
	if window.terminal == nil || window.terminal.isClosed() {
		window.terminal = newSSHFallbackTerminal(terminal)
		return window.terminal, nil
	}
	_ = terminal.Close()
	return window.terminal, nil
}

func (s *sshFallbackStore) Terminal(hostID string, windowIndex int, now time.Time) (*sshFallbackTerminal, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	window := s.sessionLocked(hostID, now).window(windowIndex)
	if window == nil || window.terminal == nil || window.terminal.isClosed() {
		return nil, false
	}
	return window.terminal, true
}

func (s *sshFallbackStore) CloseHost(hostID string) {
	s.mu.Lock()
	session := s.sessions[hostID]
	delete(s.sessions, hostID)
	s.mu.Unlock()
	if session != nil {
		session.closeTerminals()
	}
}

func (s *sshFallbackStore) sessionLocked(hostID string, now time.Time) *sshFallbackSession {
	session := s.sessions[hostID]
	if session != nil {
		return session
	}
	session = &sshFallbackSession{
		hostID: hostID,
		windows: []*sshFallbackWindow{{
			index:     0,
			name:      "SSH shell",
			updatedAt: now.UTC(),
		}},
	}
	s.sessions[hostID] = session
	return session
}

func (s *sshFallbackSession) nextWindowIndex() int {
	next := 0
	for _, window := range s.windows {
		next = max(next, window.index+1)
	}
	return next
}

func (s *sshFallbackSession) window(index int) *sshFallbackWindow {
	for _, window := range s.windows {
		if window.index == index {
			return window
		}
	}
	return nil
}

func (s *sshFallbackSession) closeTerminals() {
	for _, window := range s.windows {
		window.closeTerminal()
	}
}

func (s *sshFallbackSession) tmuxSession() tmux.Session {
	windows := make([]tmux.Window, 0, len(s.windows))
	updatedAt := time.Now().UTC()
	for index, window := range s.windows {
		if index == 0 || window.updatedAt.After(updatedAt) {
			updatedAt = window.updatedAt
		}
		windows = append(windows, window.tmuxWindow())
	}
	return tmux.Session{
		ID:          "ssh-fallback",
		Name:        fallbackSSHSessionName,
		Windows:     len(windows),
		WindowList:  windows,
		Attached:    true,
		UpdatedAt:   updatedAt,
		Status:      fallbackSessionStatus(windows),
		ProcessName: fallbackSSHProcessName,
		Title:       "SSH shells",
		Tags:        []string{},
		Mode:        terminalTokenModeSSH,
	}
}

func (w *sshFallbackWindow) tmuxWindow() tmux.Window {
	return tmux.Window{
		ID:          "ssh-fallback:" + strconv.Itoa(w.index),
		Index:       w.index,
		Name:        w.name,
		Active:      w.terminal != nil && !w.terminal.isClosed(),
		UpdatedAt:   w.updatedAt,
		Status:      fallbackWindowStatus(w.terminal),
		ProcessName: fallbackSSHProcessName,
		AutoRename:  false,
		PaneTitle:   w.name,
	}
}

func (w *sshFallbackWindow) closeTerminal() {
	if w.terminal != nil {
		w.terminal.Close()
	}
}

func fallbackWindowStatus(terminal *sshFallbackTerminal) string {
	if terminal != nil && !terminal.isClosed() {
		return "running"
	}
	return "unknown"
}

func fallbackSessionStatus(windows []tmux.Window) string {
	for _, window := range windows {
		if window.Status == "running" {
			return "running"
		}
	}
	return "unknown"
}
