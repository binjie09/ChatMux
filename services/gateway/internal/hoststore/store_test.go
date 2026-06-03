package hoststore

import (
	"context"
	"path/filepath"
	"testing"
)

func TestCreateAndListHosts(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	created, err := store.CreateHost(context.Background(), CreateHostInput{
		Name:     "local-dev",
		Hostname: "192.168.1.14",
		Port:     22001,
		Username: "binjie09",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}

	hosts, err := store.ListHosts(context.Background())
	if err != nil {
		t.Fatalf("ListHosts failed: %v", err)
	}
	if len(hosts) != 1 {
		t.Fatalf("expected 1 host, got %d", len(hosts))
	}
	if hosts[0].ID != created.ID {
		t.Fatalf("expected host id %q, got %q", created.ID, hosts[0].ID)
	}
	if hosts[0].Port != 22001 {
		t.Fatalf("expected port 22001, got %d", hosts[0].Port)
	}
}

func TestCreateHostDefaultsPort(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	host, err := store.CreateHost(context.Background(), CreateHostInput{
		Name:     "default-port",
		Hostname: "example.test",
		Username: "deploy",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}
	if host.Port != defaultSSHPort {
		t.Fatalf("expected default port %d, got %d", defaultSSHPort, host.Port)
	}
}

func TestGetHost(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	created, err := store.CreateHost(context.Background(), CreateHostInput{
		Name:     "lookup",
		Hostname: "example.test",
		Username: "deploy",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}

	host, err := store.GetHost(context.Background(), created.ID)
	if err != nil {
		t.Fatalf("GetHost failed: %v", err)
	}
	if host.ID != created.ID {
		t.Fatalf("expected id %q, got %q", created.ID, host.ID)
	}
}

func TestCreateHostValidatesRequiredFields(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	_, err := store.CreateHost(context.Background(), CreateHostInput{})
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func openTestStore(t *testing.T) *Store {
	t.Helper()
	store, err := Open(filepath.Join(t.TempDir(), "muxchat-test.db"))
	if err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	return store
}

func closeStore(t *testing.T, store *Store) {
	t.Helper()
	if err := store.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}
}
