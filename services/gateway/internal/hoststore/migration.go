package hoststore

import (
	"context"
	"fmt"
)

type tableColumnMigration struct {
	column string
	sql    string
	label  string
}

func (s *Store) migrate(ctx context.Context) error {
	if err := s.createBaseTables(ctx); err != nil {
		return err
	}
	hostColumns := []tableColumnMigration{
		{column: "host_key_fingerprint", sql: addHostFingerprintSQL, label: "host fingerprint"},
		{column: "ssh_auth_method", sql: addHostSSHAuthMethodSQL, label: "host ssh auth method"},
		{column: "ssh_password", sql: addHostSSHPasswordSQL, label: "host ssh password"},
		{column: "ssh_private_key", sql: addHostSSHPrivateKeySQL, label: "host ssh private key"},
		{column: "ssh_private_key_passphrase", sql: addHostSSHPrivateKeyPassphraseSQL, label: "host ssh private key passphrase"},
		{column: "pinned", sql: addHostPinnedSQL, label: "host pinned"},
		{column: "owner", sql: addHostOwnerSQL, label: "host owner"},
		{column: "shared", sql: addHostSharedSQL, label: "host shared"},
	}
	if err := s.migrateColumns(ctx, "hosts", hostColumns); err != nil {
		return err
	}
	return s.migrateSessionMetadata(ctx)
}

func (s *Store) createBaseTables(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, createHostsTableSQL); err != nil {
		return fmt.Errorf("migrate hosts table: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, createAuditEventsTableSQL); err != nil {
		return fmt.Errorf("migrate audit events table: %w", err)
	}
	if _, err := s.db.ExecContext(ctx, createSessionMetadataTableSQL); err != nil {
		return fmt.Errorf("migrate session metadata table: %w", err)
	}
	return nil
}

func (s *Store) migrateSessionMetadata(ctx context.Context) error {
	columns := []tableColumnMigration{
		{column: "owner", sql: addSessionOwnerSQL, label: "session owner"},
		{column: "shared", sql: addSessionSharedSQL, label: "session shared"},
		{column: "collaborators", sql: addSessionCollaboratorsSQL, label: "session collaborators"},
	}
	return s.migrateColumns(ctx, "session_metadata", columns)
}

func (s *Store) migrateColumns(ctx context.Context, table string, columns []tableColumnMigration) error {
	for _, migration := range columns {
		exists, err := s.columnExists(ctx, table, migration.column)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		if _, err := s.db.ExecContext(ctx, migration.sql); err != nil {
			return fmt.Errorf("migrate %s: %w", migration.label, err)
		}
	}
	return nil
}

func (s *Store) columnExists(ctx context.Context, table string, column string) (bool, error) {
	rows, err := s.db.QueryContext(ctx, "PRAGMA table_info("+table+")")
	if err != nil {
		return false, fmt.Errorf("inspect table columns: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, dataType string
		var notNull int
		var defaultValue any
		var pk int
		if err := rows.Scan(&cid, &name, &dataType, &notNull, &defaultValue, &pk); err != nil {
			return false, fmt.Errorf("scan table column: %w", err)
		}
		if name == column {
			return true, nil
		}
	}
	return false, rows.Err()
}
