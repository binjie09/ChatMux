package api

import (
	"context"
	"testing"
)

func testContext(t *testing.T) context.Context {
	t.Helper()
	return context.Background()
}
