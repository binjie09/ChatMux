package hoststore

import (
	"context"
	"fmt"
)

func (s *Store) DeleteHost(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin delete host: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if _, err := tx.ExecContext(ctx, deleteSessionMetadataForHostSQL, id); err != nil {
		return fmt.Errorf("delete host session metadata: %w", err)
	}
	if _, err := tx.ExecContext(ctx, deleteHostLastWindowForHostSQL, id); err != nil {
		return fmt.Errorf("delete host last window: %w", err)
	}
	result, err := tx.ExecContext(ctx, deleteHostSQL, id)
	if err != nil {
		return fmt.Errorf("delete host: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete host affected rows: %w", err)
	}
	if affected == 0 {
		return ErrHostNotFound
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit delete host: %w", err)
	}
	committed = true
	return nil
}
