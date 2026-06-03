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
	if hosts[0].Owner != "local-dev" || !hosts[0].Shared {
		t.Fatalf("expected default owner/shared, got %#v", hosts[0])
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

func TestTrustHostKey(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	created, err := store.CreateHost(context.Background(), CreateHostInput{
		Name:     "trust",
		Hostname: "example.test",
		Username: "deploy",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}

	host, err := store.TrustHostKey(context.Background(), created.ID, "SHA256:abc")
	if err != nil {
		t.Fatalf("TrustHostKey failed: %v", err)
	}
	if host.HostKeyFingerprint != "SHA256:abc" {
		t.Fatalf("expected fingerprint, got %q", host.HostKeyFingerprint)
	}
}

func TestSetHostPinned(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	created, err := store.CreateHost(context.Background(), CreateHostInput{
		Name:     "pin",
		Hostname: "example.test",
		Username: "deploy",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}

	host, err := store.SetHostPinned(context.Background(), created.ID, true)
	if err != nil {
		t.Fatalf("SetHostPinned failed: %v", err)
	}
	if !host.Pinned {
		t.Fatal("expected pinned host")
	}
}

func TestSetHostShared(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	created, err := store.CreateHost(context.Background(), CreateHostInput{
		Name:     "share",
		Hostname: "example.test",
		Username: "deploy",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}

	host, err := store.SetHostShared(context.Background(), created.ID, false)
	if err != nil {
		t.Fatalf("SetHostShared failed: %v", err)
	}
	if host.Shared {
		t.Fatal("expected private host")
	}
}

func TestListHostsVisibleTo(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	privateHost, err := store.CreateHost(context.Background(), CreateHostInput{Name: "private", Hostname: "private.test", Username: "deploy", Owner: "alice"})
	if err != nil {
		t.Fatalf("CreateHost private failed: %v", err)
	}
	if _, err := store.SetHostShared(context.Background(), privateHost.ID, false); err != nil {
		t.Fatalf("SetHostShared failed: %v", err)
	}
	if _, err := store.CreateHost(context.Background(), CreateHostInput{Name: "shared", Hostname: "shared.test", Username: "deploy", Owner: "bob"}); err != nil {
		t.Fatalf("CreateHost shared failed: %v", err)
	}

	hosts, err := store.ListHostsVisibleTo(context.Background(), "alice")
	if err != nil {
		t.Fatalf("ListHostsVisibleTo failed: %v", err)
	}
	if len(hosts) != 2 {
		t.Fatalf("expected owner to see private and shared hosts, got %d", len(hosts))
	}
	hosts, err = store.ListHostsVisibleTo(context.Background(), "charlie")
	if err != nil {
		t.Fatalf("ListHostsVisibleTo other failed: %v", err)
	}
	if len(hosts) != 1 || !hosts[0].Shared {
		t.Fatalf("expected other user to see only shared host, got %#v", hosts)
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
