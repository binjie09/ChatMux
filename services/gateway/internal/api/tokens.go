package api

import (
	"crypto/rand"
	"encoding/hex"
)

func newOpaqueToken() string {
	bytes := make([]byte, 18)
	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}
	return hex.EncodeToString(bytes)
}
