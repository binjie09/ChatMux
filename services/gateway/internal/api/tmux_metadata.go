package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"time"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
	"github.com/chatmux/chatmux/services/gateway/internal/tmux"
)

type saveSessionMetadataRequest struct {
	Tags  []string `json:"tags"`
	Title string   `json:"title"`
}

type reorderTmuxSessionsRequest struct {
	CredentialToken string   `json:"credentialToken"`
	OrderedNames    []string `json:"orderedNames"`
}

func (s *Server) handleReorderTmuxSessions(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/tmux/sessions/order")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	var input reorderTmuxSessionsRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if len(input.OrderedNames) == 0 {
		writeError(w, http.StatusBadRequest, errors.New("orderedNames is required"))
		return
	}
	for _, name := range input.OrderedNames {
		if err := tmux.ValidateSessionName(name); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
	}
	host, err := s.visibleHost(r, hostID)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	// Stamp evenly-spaced ranks above every existing key so the posted order is
	// the exact result. Ranks stay on the epoch-second scale, so sessions a user
	// has never dragged (key = creation time) continue to interleave naturally.
	base := float64(time.Now().UTC().Unix())
	items, err := s.hosts.ListSessionMetadata(r.Context(), host.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	for _, item := range items {
		if item.SortOrder != nil && *item.SortOrder > base {
			base = *item.SortOrder
		}
	}
	base += float64(len(input.OrderedNames)) + 1
	orders := make([]hoststore.SessionOrderInput, 0, len(input.OrderedNames))
	for index, name := range input.OrderedNames {
		orders = append(orders, hoststore.SessionOrderInput{SessionName: name, SortOrder: base - float64(index)})
	}
	if err := s.hosts.SaveSessionOrders(r.Context(), host.ID, orders); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "tmux.sessions.reordered", HostID: hostID, Message: "reordered tmux sessions"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	credential, err := s.sshCredentialForRequest(r, hostID, input.CredentialToken)
	if err != nil {
		writeError(w, statusForCredentialError(err), err)
		return
	}
	sessions, err := s.runTmuxListCommand(r, hostID, credential, tmux.ListSessionsCommand())
	if err != nil {
		writeError(w, statusForTmuxMutationError(err), err)
		return
	}
	writeJSON(w, http.StatusOK, sessions)
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
		Tags: input.Tags, Title: input.Title,
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
	type visibleEntry struct {
		session tmux.Session
		key     float64
	}
	visible := make([]visibleEntry, 0, len(sessions))
	for _, session := range sessions {
		metadata, found := lookup[session.Name]
		if !principalCanAccessSession(r, host, metadata, found) {
			continue
		}
		visible = append(visible, visibleEntry{
			session: applySessionMetadata(session, metadata, found),
			key:     sessionSortKey(session, metadata, found),
		})
	}
	// Newest first: sessions a user has dragged get an explicit sort_order; the
	// rest fall back to their tmux creation time. Sorting here (the single merge
	// point for every list/poll/mutation response) keeps ordering consistent and
	// stable across renames, since renaming never touches sort_order.
	sort.SliceStable(visible, func(i int, j int) bool {
		if visible[i].key != visible[j].key {
			return visible[i].key > visible[j].key
		}
		if visible[i].session.Name != visible[j].session.Name {
			return visible[i].session.Name < visible[j].session.Name
		}
		return visible[i].session.ID < visible[j].session.ID
	})
	ordered := make([]tmux.Session, len(visible))
	for index, entry := range visible {
		ordered[index] = entry.session
	}
	return ordered, nil
}

// sessionSortKey returns the value used to rank a session. An explicit
// sort_order (set by drag-to-reorder) wins; otherwise the tmux creation time is
// used so the default order is chronological and immune to renames. The activity
// timestamp is a last-resort fallback when creation time is unavailable.
func sessionSortKey(session tmux.Session, metadata hoststore.SessionMetadata, found bool) float64 {
	if found && metadata.SortOrder != nil {
		return *metadata.SortOrder
	}
	if !session.CreatedAt.IsZero() {
		return float64(session.CreatedAt.Unix())
	}
	return float64(session.UpdatedAt.Unix())
}

func applySessionMetadata(session tmux.Session, metadata hoststore.SessionMetadata, found bool) tmux.Session {
	if !found {
		return session
	}
	session.Title = metadata.Title
	session.Tags = metadata.Tags
	session.Owner = metadata.Owner
	return session
}
