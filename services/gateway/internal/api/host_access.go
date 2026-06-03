package api

import (
	"errors"
	"net/http"

	"github.com/muxchat/muxchat/services/gateway/internal/hoststore"
)

var errHostNotVisible = errors.New("host is not visible")

func (s *Server) visibleHost(r *http.Request, hostID string) (hoststore.Host, error) {
	host, err := s.hosts.GetHost(r.Context(), hostID)
	if err != nil {
		return hoststore.Host{}, err
	}
	if !principalCanAccessHost(r, host) {
		return hoststore.Host{}, errHostNotVisible
	}
	return host, nil
}

func principalCanAccessHost(r *http.Request, host hoststore.Host) bool {
	principal := requestPrincipal(r)
	if principal.Role == RoleAdmin {
		return true
	}
	return host.Shared || host.Owner == principal.Name
}

func statusForHostAccessError(err error) int {
	if errors.Is(err, hoststore.ErrHostNotFound) || errors.Is(err, errHostNotVisible) {
		return http.StatusNotFound
	}
	return http.StatusInternalServerError
}
