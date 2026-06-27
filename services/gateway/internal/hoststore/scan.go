package hoststore

import "database/sql"

type hostScanner interface {
	Scan(dest ...any) error
}

func scanHost(row hostScanner) (Host, error) {
	var host Host
	var sortOrder sql.NullFloat64
	if err := row.Scan(
		&host.ID,
		&host.Name,
		&host.Hostname,
		&host.Port,
		&host.Username,
		&host.Status,
		&host.HostKeyFingerprint,
		&host.SSHAuthMethod,
		&host.SSHPassword,
		&host.SSHPrivateKey,
		&host.SSHKeyPassphrase,
		&host.Pinned,
		&sortOrder,
		&host.Owner,
		&host.CreatedAt,
		&host.UpdatedAt,
	); err != nil {
		return Host{}, err
	}
	if sortOrder.Valid {
		value := sortOrder.Float64
		host.SortOrder = &value
	}
	return normalizeHostCredential(host), nil
}

var _ hostScanner = (*sql.Row)(nil)
var _ hostScanner = (*sql.Rows)(nil)
