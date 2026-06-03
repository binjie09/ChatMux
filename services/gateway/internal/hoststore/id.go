package hoststore

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

func newHostID() string {
	return newID("host_")
}

func newAuditEventID() string {
	return newID("audit_")
}

func newID(prefix string) string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		panic(fmt.Errorf("generate id: %w", err))
	}
	return prefix + hex.EncodeToString(bytes)
}
