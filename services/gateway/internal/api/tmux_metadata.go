package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/tmux"
)

type saveSessionMetadataRequest struct {
	Tags  []string `json:"tags"`
	Title string   `json:"title"`
}

func (s *Server) handleSaveTmuxSessionMetadata(w http.ResponseWriter, r *http.Request) {
	hostID, sessionName, ok := routeHostSessionAction(r.URL.Path, "/metadata")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	if err := tmux.ValidateSessionName(sessionName); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.ensureHostExists(r, hostID); err != nil {
		writeError(w, statusForHostError(err), err)
		return
	}

	var input saveSessionMetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	metadata, err := s.hosts.SaveSessionMetadata(r.Context(), hoststore.SaveSessionMetadataInput{
		HostID: hostID, SessionName: sessionName, Tags: input.Tags, Title: input.Title,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.session.metadata.saved", HostID: hostID, SessionName: sessionName, Message: "saved session metadata"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, metadata)
}

func (s *Server) applySessionMetadata(ctx context.Context, hostID string, sessions []tmux.Session) ([]tmux.Session, error) {
	items, err := s.hosts.ListSessionMetadata(ctx, hostID)
	if err != nil {
		return nil, err
	}
	lookup := map[string]hoststore.SessionMetadata{}
	for _, item := range items {
		lookup[item.SessionName] = item
	}
	for index := range sessions {
		if metadata, ok := lookup[sessions[index].Name]; ok {
			sessions[index].Title = metadata.Title
			sessions[index].Tags = metadata.Tags
		}
	}
	return sessions, nil
}
