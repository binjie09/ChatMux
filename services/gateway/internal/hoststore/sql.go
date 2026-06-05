package hoststore

const createHostsTableSQL = `
CREATE TABLE IF NOT EXISTS hosts (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	hostname TEXT NOT NULL,
	port INTEGER NOT NULL,
	username TEXT NOT NULL,
	status TEXT NOT NULL,
	host_key_fingerprint TEXT NOT NULL DEFAULT '',
	ssh_auth_method TEXT NOT NULL DEFAULT 'password',
	ssh_password TEXT NOT NULL DEFAULT '',
	ssh_private_key TEXT NOT NULL DEFAULT '',
	ssh_private_key_passphrase TEXT NOT NULL DEFAULT '',
	pinned BOOLEAN NOT NULL DEFAULT FALSE,
	owner TEXT NOT NULL DEFAULT 'local-dev',
	created_at TIMESTAMP NOT NULL,
	updated_at TIMESTAMP NOT NULL
);`

const createAuditEventsTableSQL = `
CREATE TABLE IF NOT EXISTS audit_events (
	id TEXT PRIMARY KEY,
	type TEXT NOT NULL,
	host_id TEXT NOT NULL DEFAULT '',
	session_name TEXT NOT NULL DEFAULT '',
	message TEXT NOT NULL DEFAULT '',
	created_at TIMESTAMP NOT NULL
);`

const createSessionMetadataTableSQL = `
CREATE TABLE IF NOT EXISTS session_metadata (
	host_id TEXT NOT NULL,
	session_name TEXT NOT NULL,
	title TEXT NOT NULL DEFAULT '',
	tags TEXT NOT NULL DEFAULT '[]',
	owner TEXT NOT NULL DEFAULT 'local-dev',
	updated_at TIMESTAMP NOT NULL,
	PRIMARY KEY (host_id, session_name)
);`

const addHostFingerprintSQL = `
ALTER TABLE hosts ADD COLUMN host_key_fingerprint TEXT NOT NULL DEFAULT '';`

const addHostSSHPasswordSQL = `
ALTER TABLE hosts ADD COLUMN ssh_password TEXT NOT NULL DEFAULT '';`

const addHostSSHAuthMethodSQL = `
ALTER TABLE hosts ADD COLUMN ssh_auth_method TEXT NOT NULL DEFAULT 'password';`

const addHostSSHPrivateKeySQL = `
ALTER TABLE hosts ADD COLUMN ssh_private_key TEXT NOT NULL DEFAULT '';`

const addHostSSHPrivateKeyPassphraseSQL = `
ALTER TABLE hosts ADD COLUMN ssh_private_key_passphrase TEXT NOT NULL DEFAULT '';`

const addHostPinnedSQL = `
ALTER TABLE hosts ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT FALSE;`

const addHostOwnerSQL = `
ALTER TABLE hosts ADD COLUMN owner TEXT NOT NULL DEFAULT 'local-dev';`

const addSessionOwnerSQL = `
ALTER TABLE session_metadata ADD COLUMN owner TEXT NOT NULL DEFAULT 'local-dev';`

const listHostsSQL = `
SELECT id, name, hostname, port, username, status, host_key_fingerprint, ssh_auth_method, ssh_password, ssh_private_key, ssh_private_key_passphrase, pinned, owner, created_at, updated_at
FROM hosts
ORDER BY pinned DESC, created_at DESC;`

const listVisibleHostsSQL = `
SELECT id, name, hostname, port, username, status, host_key_fingerprint, ssh_auth_method, ssh_password, ssh_private_key, ssh_private_key_passphrase, pinned, owner, created_at, updated_at
FROM hosts
WHERE owner = ?
ORDER BY pinned DESC, created_at DESC;`

const getHostSQL = `
SELECT id, name, hostname, port, username, status, host_key_fingerprint, ssh_auth_method, ssh_password, ssh_private_key, ssh_private_key_passphrase, pinned, owner, created_at, updated_at
FROM hosts
WHERE id = ?;`

const insertHostSQL = `
INSERT INTO hosts (id, name, hostname, port, username, status, host_key_fingerprint, ssh_auth_method, ssh_password, ssh_private_key, ssh_private_key_passphrase, pinned, owner, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`

const updateHostSQL = `
UPDATE hosts
SET name = ?, hostname = ?, port = ?, username = ?, ssh_auth_method = ?, ssh_password = ?, ssh_private_key = ?, ssh_private_key_passphrase = ?, updated_at = ?
WHERE id = ?;`

const trustHostKeySQL = `
UPDATE hosts
SET host_key_fingerprint = ?, updated_at = ?
WHERE id = ?;`

const setHostPinnedSQL = `
UPDATE hosts
SET pinned = ?, updated_at = ?
WHERE id = ?;`

const deleteHostSQL = `
DELETE FROM hosts
WHERE id = ?;`

const deleteSessionMetadataForHostSQL = `
DELETE FROM session_metadata
WHERE host_id = ?;`

const insertAuditEventSQL = `
INSERT INTO audit_events (id, type, host_id, session_name, message, created_at)
VALUES (?, ?, ?, ?, ?, ?);`

const listAuditEventsSQL = `
SELECT id, type, host_id, session_name, message, created_at
FROM audit_events
ORDER BY created_at DESC
LIMIT 200;`

const upsertSessionMetadataSQL = `
INSERT INTO session_metadata (host_id, session_name, title, tags, owner, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id, session_name) DO UPDATE SET
	title = excluded.title,
	tags = excluded.tags,
	owner = excluded.owner,
	updated_at = excluded.updated_at;`

const listSessionMetadataSQL = `
SELECT host_id, session_name, title, tags, owner, updated_at
FROM session_metadata
WHERE host_id = ?;`

const getSessionMetadataSQL = `
SELECT host_id, session_name, title, tags, owner, updated_at
FROM session_metadata
WHERE host_id = ? AND session_name = ?;`

const renameSessionMetadataSQL = `
UPDATE session_metadata
SET session_name = ?, updated_at = ?
WHERE host_id = ? AND session_name = ?;`
