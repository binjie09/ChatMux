package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

func (s *Server) handleListHosts(w http.ResponseWriter, r *http.Request) {
	hosts, err := s.listHostsForPrincipal(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, hosts)
}

func (s *Server) handleCreateHost(w http.ResponseWriter, r *http.Request) {
	var input hoststore.CreateHostInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	input.Owner = principalName(r)

	host, err := s.hosts.CreateHost(r.Context(), input)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: "host.created", HostID: host.ID, Message: "created host"}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, host)
}

type pinHostRequest struct {
	Pinned bool `json:"pinned"`
}

func (s *Server) handlePinHost(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/pin")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	if _, err := s.visibleHost(r, hostID); err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}

	var input pinHostRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	host, err := s.hosts.SetHostPinned(r.Context(), hostID, input.Pinned)
	if errors.Is(err, hoststore.ErrHostNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	eventType := "host.unpinned"
	if host.Pinned {
		eventType = "host.pinned"
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: eventType, HostID: host.ID, Message: eventType}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, host)
}

type shareHostRequest struct {
	Shared bool `json:"shared"`
}

func (s *Server) handleShareHost(w http.ResponseWriter, r *http.Request) {
	hostID, ok := routeHostAction(r.URL.Path, "/share")
	if !ok {
		writeError(w, http.StatusNotFound, errors.New("route not found"))
		return
	}
	if _, err := s.visibleHost(r, hostID); err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}

	var input shareHostRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	host, err := s.hosts.SetHostShared(r.Context(), hostID, input.Shared)
	if err != nil {
		writeError(w, statusForHostAccessError(err), err)
		return
	}
	eventType := "host.unshared"
	if host.Shared {
		eventType = "host.shared"
	}
	if err := s.logAudit(r.Context(), hoststore.LogAuditEventInput{Type: eventType, HostID: host.ID, Message: eventType}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, host)
}

func (s *Server) listHostsForPrincipal(r *http.Request) ([]hoststore.Host, error) {
	principal, ok := principalFromContext(r.Context())
	if !ok || principal.Role == RoleAdmin {
		return s.hosts.ListHosts(r.Context())
	}
	return s.hosts.ListHostsVisibleTo(r.Context(), principal.Name)
}

func principalName(r *http.Request) string {
	principal, ok := principalFromContext(r.Context())
	if !ok {
		return localDevPrincipal.Name
	}
	return principal.Name
}
