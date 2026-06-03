package api

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

type Role string

const (
	RoleViewer   Role = "viewer"
	RoleOperator Role = "operator"
	RoleAdmin    Role = "admin"
)

type StaticUser struct {
	Name  string
	Role  Role
	Token string
}

type Principal struct {
	Name string `json:"name"`
	Role Role   `json:"role"`
}

type authConfig struct {
	users []staticUserCredential
}

type staticUserCredential struct {
	principal Principal
	token     string
}

type principalContextKey struct{}

var localDevPrincipal = Principal{Name: "local-dev", Role: RoleAdmin}

func (s *Server) withGatewayAuth(next http.Handler) http.Handler {
	if !s.auth.Enabled() {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, requestWithPrincipal(r, localDevPrincipal))
		})
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.authorizeRequest(w, r, next)
	})
}

func (s *Server) authorizeRequest(w http.ResponseWriter, r *http.Request, next http.Handler) {
	if isPublicGatewayRoute(r) {
		next.ServeHTTP(w, r)
		return
	}
	principal, ok := s.auth.PrincipalForBearer(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, http.StatusUnauthorized, errors.New("gateway token is required"))
		return
	}
	if !roleAllows(principal.Role, requiredRole(r)) {
		writeError(w, http.StatusForbidden, errors.New("gateway role is not allowed"))
		return
	}
	next.ServeHTTP(w, requestWithPrincipal(r, principal))
}

func (c *authConfig) AddStaticUsers(users []StaticUser) {
	for _, user := range users {
		credential, err := staticUserCredentialFor(user)
		if err != nil {
			panic(err)
		}
		c.users = append(c.users, credential)
	}
}

func ValidateStaticUsers(users []StaticUser) error {
	for _, user := range users {
		if _, err := staticUserCredentialFor(user); err != nil {
			return err
		}
	}
	return nil
}

func (c authConfig) Enabled() bool {
	return len(c.users) > 0
}

func (c authConfig) PrincipalForBearer(header string) (Principal, bool) {
	token, ok := bearerToken(header)
	if !ok {
		return Principal{}, false
	}
	for _, user := range c.users {
		if subtle.ConstantTimeCompare([]byte(token), []byte(user.token)) == 1 {
			return user.principal, true
		}
	}
	return Principal{}, false
}

func staticUserCredentialFor(user StaticUser) (staticUserCredential, error) {
	name := strings.TrimSpace(user.Name)
	role, err := normalizedRole(user.Role)
	if err != nil {
		return staticUserCredential{}, err
	}
	token := strings.TrimSpace(user.Token)
	if name == "" {
		return staticUserCredential{}, errors.New("static user name is required")
	}
	if token == "" {
		return staticUserCredential{}, fmt.Errorf("static user %q token is required", name)
	}
	return staticUserCredential{
		principal: Principal{Name: name, Role: role},
		token:     token,
	}, nil
}

func normalizedRole(role Role) (Role, error) {
	switch role {
	case RoleViewer, RoleOperator, RoleAdmin:
		return role, nil
	case "":
		return RoleViewer, nil
	default:
		return "", fmt.Errorf("invalid static user role: %s", role)
	}
}

func bearerToken(header string) (string, bool) {
	scheme, token, ok := strings.Cut(header, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	return token, token != ""
}

func isPublicGatewayRoute(r *http.Request) bool {
	if r.Method == http.MethodGet && r.URL.Path == "/healthz" {
		return true
	}
	return r.Method == http.MethodGet && r.URL.Path == "/api/terminal"
}

func requiredRole(r *http.Request) Role {
	if r.Method == http.MethodGet {
		return RoleViewer
	}
	return RoleOperator
}

func roleAllows(actual Role, required Role) bool {
	return roleRank(actual) >= roleRank(required)
}

func roleRank(role Role) int {
	switch role {
	case RoleAdmin:
		return 3
	case RoleOperator:
		return 2
	case RoleViewer:
		return 1
	default:
		return 0
	}
}

func requestWithPrincipal(r *http.Request, principal Principal) *http.Request {
	ctx := context.WithValue(r.Context(), principalContextKey{}, principal)
	return r.WithContext(ctx)
}

func principalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalContextKey{}).(Principal)
	return principal, ok
}
