package api

import (
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
)

func (s *Server) withGatewayAuth(next http.Handler) http.Handler {
	if s.gatewayAccessToken == "" {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isPublicGatewayRoute(r) || hasBearerToken(r, s.gatewayAccessToken) {
			next.ServeHTTP(w, r)
			return
		}
		writeError(w, http.StatusUnauthorized, errors.New("gateway token is required"))
	})
}

func isPublicGatewayRoute(r *http.Request) bool {
	if r.Method == http.MethodGet && r.URL.Path == "/healthz" {
		return true
	}
	return r.Method == http.MethodGet && r.URL.Path == "/api/terminal"
}

func hasBearerToken(r *http.Request, expected string) bool {
	scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(expected)) == 1
}
