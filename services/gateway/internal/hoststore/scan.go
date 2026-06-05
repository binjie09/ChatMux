package hoststore

import "database/sql"

type hostScanner interface {
	Scan(dest ...any) error
}

func scanHost(row hostScanner) (Host, error) {
	var host Host
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
		&host.Owner,
		&host.CreatedAt,
		&host.UpdatedAt,
	); err != nil {
		return Host{}, err
	}
	return normalizeHostCredential(host), nil
}

var _ hostScanner = (*sql.Row)(nil)
var _ hostScanner = (*sql.Rows)(nil)
