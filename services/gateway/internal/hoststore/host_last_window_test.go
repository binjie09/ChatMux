package hoststore

import (
	"context"
	"errors"
	"testing"
)

func TestSaveAndGetHostLastWindow(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()

	saved, err := store.SaveHostLastWindow(ctx, SaveHostLastWindowInput{
		HostID: "host_1", SessionName: "deploy", WindowIndex: 2,
	})
	if err != nil {
		t.Fatalf("SaveHostLastWindow failed: %v", err)
	}
	if saved.SessionName != "deploy" || saved.WindowIndex != 2 {
		t.Fatalf("unexpected saved value: %#v", saved)
	}

	got, err := store.GetHostLastWindow(ctx, "host_1")
	if err != nil {
		t.Fatalf("GetHostLastWindow failed: %v", err)
	}
	if got.SessionName != "deploy" || got.WindowIndex != 2 {
		t.Fatalf("unexpected got value: %#v", got)
	}
}

func TestSaveHostLastWindowUpsertsPerHost(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()

	if _, err := store.SaveHostLastWindow(ctx, SaveHostLastWindowInput{
		HostID: "host_1", SessionName: "deploy", WindowIndex: 0,
	}); err != nil {
		t.Fatalf("initial save failed: %v", err)
	}
	updated, err := store.SaveHostLastWindow(ctx, SaveHostLastWindowInput{
		HostID: "host_1", SessionName: "logs", WindowIndex: 4,
	})
	if err != nil {
		t.Fatalf("upsert save failed: %v", err)
	}
	if updated.SessionName != "logs" || updated.WindowIndex != 4 {
		t.Fatalf("expected upserted value, got %#v", updated)
	}

	got, err := store.GetHostLastWindow(ctx, "host_1")
	if err != nil {
		t.Fatalf("GetHostLastWindow failed: %v", err)
	}
	if got.SessionName != "logs" || got.WindowIndex != 4 {
		t.Fatalf("expected upserted value on read, got %#v", got)
	}

	count := 0
	rows, err := store.db.QueryContext(ctx, "SELECT host_id FROM host_last_window WHERE host_id = ?", "host_1")
	if err != nil {
		t.Fatalf("count rows failed: %v", err)
	}
	for rows.Next() {
		count++
	}
	rows.Close()
	if count != 1 {
		t.Fatalf("expected a single row per host, got %d", count)
	}
}

func TestGetHostLastWindowMissing(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()

	_, err := store.GetHostLastWindow(ctx, "missing")
	if !errors.Is(err, ErrLastWindowNotFound) {
		t.Fatalf("expected ErrLastWindowNotFound, got %v", err)
	}
}

func TestSaveHostLastWindowValidates(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()

	cases := []SaveHostLastWindowInput{
		{HostID: "", SessionName: "deploy", WindowIndex: 0},
		{HostID: "host_1", SessionName: "  ", WindowIndex: 0},
		{HostID: "host_1", SessionName: "deploy", WindowIndex: -1},
	}
	for _, input := range cases {
		if _, err := store.SaveHostLastWindow(ctx, input); err == nil {
			t.Fatalf("expected error for input %#v", input)
		}
	}
}
