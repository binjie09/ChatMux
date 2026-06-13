package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

type saveHostLastWindowRequest struct {
	SessionName string `json:"sessionName"`
	WindowIndex *int   `json:"windowIndex"`
}

func (s *Server) handleGetHostLastWindow(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/last-window")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	if _, err := s.visibleHost(r, hostID); err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	lastWindow, err := s.hosts.GetHostLastWindow(r.Context(), hostID)
	if err != nil {
		if errors.Is(err, hoststore.ErrLastWindowNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, lastWindow)
}

func (s *Server) handleSaveHostLastWindow(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/last-window")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	if _, err := s.visibleHost(r, hostID); err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	var input saveHostLastWindowRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	windowIndex := 0
	if input.WindowIndex != nil {
		windowIndex = *input.WindowIndex
	}
	lastWindow, err := s.hosts.SaveHostLastWindow(r.Context(), hoststore.SaveHostLastWindowInput{
		HostID:      hostID,
		SessionName: input.SessionName,
		WindowIndex: windowIndex,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, lastWindow)
}
