package api

import (
	"errors"
	"net/http"
)

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	principal, ok := principalFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, errors.New("gateway principal is missing"))
		return
	}
	writeJSON(w, http.StatusOK, principal)
}
