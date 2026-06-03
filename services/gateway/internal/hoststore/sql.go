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
	pinned BOOLEAN NOT NULL DEFAULT FALSE,
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

const addHostFingerprintSQL = `
ALTER TABLE hosts ADD COLUMN host_key_fingerprint TEXT NOT NULL DEFAULT '';`

const addHostPinnedSQL = `
ALTER TABLE hosts ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT FALSE;`

const listHostsSQL = `
SELECT id, name, hostname, port, username, status, host_key_fingerprint, pinned, created_at, updated_at
FROM hosts
ORDER BY pinned DESC, created_at DESC;`

const getHostSQL = `
SELECT id, name, hostname, port, username, status, host_key_fingerprint, pinned, created_at, updated_at
FROM hosts
WHERE id = ?;`

const insertHostSQL = `
INSERT INTO hosts (id, name, hostname, port, username, status, host_key_fingerprint, pinned, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`

const trustHostKeySQL = `
UPDATE hosts
SET host_key_fingerprint = ?, updated_at = ?
WHERE id = ?;`

const setHostPinnedSQL = `
UPDATE hosts
SET pinned = ?, updated_at = ?
WHERE id = ?;`

const insertAuditEventSQL = `
INSERT INTO audit_events (id, type, host_id, session_name, message, created_at)
VALUES (?, ?, ?, ?, ?, ?);`

const listAuditEventsSQL = `
SELECT id, type, host_id, session_name, message, created_at
FROM audit_events
ORDER BY created_at DESC
LIMIT 200;`
