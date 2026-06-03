package api

import (
	"context"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

func (s *Server) handleListAuditEvents(w http.ResponseWriter, r *http.Request) {
	events, err := s.hosts.ListAuditEvents(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, events)
}

func (s *Server) logAudit(ctx context.Context, input hoststore.LogAuditEventInput) error {
	_, err := s.hosts.LogAuditEvent(ctx, input)
	return err
}
