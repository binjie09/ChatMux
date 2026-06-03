package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
	"github.com/muxchat/muxchat/services/gateway/internal/tmux"
)

type saveSessionMetadataRequest struct {
	Shared *bool    `json:"shared"`
	Tags   []string `json:"tags"`
	Title  string   `json:"title"`
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
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	if err := s.manageableSession(r, host, sessionName); err != nil {
		writeError(w, statusForSessionAccessError(err), err)
		return
	}

	var input saveSessionMetadataRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	metadata, err := s.hosts.SaveSessionMetadata(r.Context(), hoststore.SaveSessionMetadataInput{
		HostID: hostID, Owner: requestPrincipal(r).Name, SessionName: sessionName,
		Shared: input.Shared, Tags: input.Tags, Title: input.Title,
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

func (s *Server) applyVisibleSessionMetadata(r *http.Request, host hoststore.Host, sessions []tmux.Session) ([]tmux.Session, error) {
	items, err := s.hosts.ListSessionMetadata(r.Context(), host.ID)
	if err != nil {
		return nil, err
	}
	lookup := map[string]hoststore.SessionMetadata{}
	for _, item := range items {
		lookup[item.SessionName] = item
	}
	visible := make([]tmux.Session, 0, len(sessions))
	for _, session := range sessions {
		metadata, found := lookup[session.Name]
		if !principalCanAccessSession(r, host, metadata, found) {
			continue
		}
		visible = append(visible, applySessionMetadata(session, metadata, found))
	}
	return visible, nil
}

func applySessionMetadata(session tmux.Session, metadata hoststore.SessionMetadata, found bool) tmux.Session {
	if !found {
		return session
	}
	session.Title = metadata.Title
	session.Tags = metadata.Tags
	session.Owner = metadata.Owner
	session.Shared = metadata.Shared
	return session
}
