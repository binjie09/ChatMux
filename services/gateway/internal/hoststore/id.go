package hoststore

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
)

func newHostID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		panic(fmt.Errorf("generate host id: %w", err))
	}
	return "host_" + hex.EncodeToString(bytes)
}
