package api

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/chatmux/chatmux/services/gateway/internal/hoststore"
)

var errSessionNotVisible = errors.New("session is not visible")

func (s *Server) visibleSession(r *http.Request, host hoststore.Host, sessionName string) error {
	metadata, found, err := s.sessionMetadata(r, host.ID, sessionName)
	if err != nil {
		return err
	}
	if principalCanAccessSession(r, host, metadata, found) {
		return nil
	}
	return errSessionNotVisible
}

func (s *Server) manageableSession(r *http.Request, host hoststore.Host, sessionName string) error {
	metadata, found, err := s.sessionMetadata(r, host.ID, sessionName)
	if err != nil {
		return err
	}
	if principalCanManageSession(r, host, metadata, found) {
		return nil
	}
	return errSessionNotVisible
}

func (s *Server) sessionMetadata(r *http.Request, hostID string, sessionName string) (hoststore.SessionMetadata, bool, error) {
	metadata, err := s.hosts.GetSessionMetadata(r.Context(), hostID, sessionName)
	if err == nil {
		return metadata, true, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return hoststore.SessionMetadata{}, false, nil
	}
	return hoststore.SessionMetadata{}, false, err
}

func principalCanAccessSession(r *http.Request, host hoststore.Host, metadata hoststore.SessionMetadata, found bool) bool {
	principal := requestPrincipal(r)
	if principal.Role == RoleAdmin || host.Owner == principal.Name {
		return true
	}
	if !found {
		return false
	}
	return metadata.Owner == principal.Name
}

func principalCanManageSession(r *http.Request, host hoststore.Host, metadata hoststore.SessionMetadata, found bool) bool {
	principal := requestPrincipal(r)
	if principal.Role == RoleAdmin || host.Owner == principal.Name {
		return true
	}
	return found && metadata.Owner == principal.Name
}

func requestPrincipal(r *http.Request) Principal {
	principal, ok := principalFromContext(r.Context())
	if ok {
		return principal
	}
	return localDevPrincipal
}

func statusForSessionAccessError(err error) int {
	if errors.Is(err, hoststore.ErrHostNotFound) || errors.Is(err, errHostNotVisible) || errors.Is(err, errSessionNotVisible) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}
