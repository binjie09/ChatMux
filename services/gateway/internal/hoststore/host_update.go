package hoststore

import (
	"context"
	"errors"
	"fmt"
	"time"
)

type UpdateHostInput struct {
	Hostname *string `json:"hostname"`
	Name     *string `json:"name"`
	Port     *int    `json:"port"`
	Username *string `json:"username"`
}

func (s *Store) UpdateHost(ctx context.Context, id string, input UpdateHostInput) (Host, error) {
	if !hasHostUpdate(input) {
		return Host{}, errors.New("at least one host field is required")
	}
	host, err := s.GetHost(ctx, id)
	if err != nil {
		return Host{}, err
	}
	host = applyHostUpdate(host, input)
	if err := validateCreateHost(CreateHostInput{
		Name: host.Name, Hostname: host.Hostname, Port: host.Port, Username: host.Username,
	}); err != nil {
		return Host{}, err
	}
	host.Port = normalizePort(host.Port)
	host.UpdatedAt = time.Now().UTC()
	result, err := s.db.ExecContext(ctx, updateHostSQL, host.Name, host.Hostname, host.Port, host.Username, host.UpdatedAt, id)
	if err != nil {
		return Host{}, fmt.Errorf("update host: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return Host{}, fmt.Errorf("update host affected rows: %w", err)
	}
	if affected == 0 {
		return Host{}, ErrHostNotFound
	}
	return s.GetHost(ctx, id)
}

func hasHostUpdate(input UpdateHostInput) bool {
	return input.Name != nil || input.Hostname != nil || input.Port != nil || input.Username != nil
}

func applyHostUpdate(host Host, input UpdateHostInput) Host {
	if input.Name != nil {
		host.Name = *input.Name
	}
	if input.Hostname != nil {
		host.Hostname = *input.Hostname
	}
	if input.Port != nil {
		host.Port = *input.Port
	}
	if input.Username != nil {
		host.Username = *input.Username
	}
	return host
}
