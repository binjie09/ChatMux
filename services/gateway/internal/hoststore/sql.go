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
