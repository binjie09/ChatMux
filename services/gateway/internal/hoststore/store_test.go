package hoststore

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
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

func TestCreateHostStoresPasswordWithoutJSONExposure(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	created, err := store.CreateHost(context.Background(), CreateHostInput{
		Name: "secure", Hostname: "secure.test", Username: "deploy", Password: "secret",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}
	if created.SSHPassword != "secret" || !created.HasPassword {
		t.Fatalf("expected stored password flag, got %#v", created)
	}
	if created.SSHAuthMethod != SSHAuthMethodPassword || !created.HasCredential {
		t.Fatalf("expected password credential flag, got %#v", created)
	}
	payload, err := json.Marshal(created)
	if err != nil {
		t.Fatalf("marshal host: %v", err)
	}
	if strings.Contains(string(payload), "secret") || strings.Contains(string(payload), "sshPassword") {
		t.Fatalf("expected password to stay out of JSON, got %s", string(payload))
	}
}

func TestCreateHostStoresPrivateKeyWithoutJSONExposure(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	created, err := store.CreateHost(context.Background(), CreateHostInput{
		Name: "key", Hostname: "key.test", Username: "deploy",
		SSHAuthMethod: SSHAuthMethodPrivateKey, PrivateKey: "private-key", PrivateKeyPassphrase: "passphrase",
	})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}
	if created.SSHAuthMethod != SSHAuthMethodPrivateKey || !created.HasCredential || created.HasPassword {
		t.Fatalf("expected private key credential flag, got %#v", created)
	}
	if created.SSHPrivateKey != "private-key" || created.SSHKeyPassphrase != "passphrase" {
		t.Fatalf("expected stored private key, got %#v", created)
	}
	payload, err := json.Marshal(created)
	if err != nil {
		t.Fatalf("marshal host: %v", err)
	}
	if strings.Contains(string(payload), "private-key") || strings.Contains(string(payload), "passphrase") {
		t.Fatalf("expected private key to stay out of JSON, got %s", string(payload))
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

func TestUpdateHost(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()
	created, err := store.CreateHost(ctx, CreateHostInput{Name: "old", Hostname: "old.test", Username: "deploy", Password: "secret"})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}
	trusted, err := store.TrustHostKey(ctx, created.ID, "SHA256:abc")
	if err != nil {
		t.Fatalf("TrustHostKey failed: %v", err)
	}

	port := 22001
	name := "new"
	updated, err := store.UpdateHost(ctx, created.ID, UpdateHostInput{Name: &name, Port: &port})
	if err != nil {
		t.Fatalf("UpdateHost failed: %v", err)
	}
	if updated.Name != "new" || updated.Hostname != "old.test" || updated.Port != 22001 {
		t.Fatalf("unexpected updated host: %#v", updated)
	}
	if updated.HostKeyFingerprint != trusted.HostKeyFingerprint || updated.Owner != trusted.Owner {
		t.Fatalf("expected preserved metadata, got %#v", updated)
	}
	if updated.SSHPassword != "secret" || !updated.HasPassword {
		t.Fatalf("expected preserved password, got %#v", updated)
	}
	if !updated.HasCredential {
		t.Fatalf("expected preserved credential flag, got %#v", updated)
	}
}

func TestUpdateHostPassword(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()
	created, err := store.CreateHost(ctx, CreateHostInput{Name: "old", Hostname: "old.test", Username: "deploy", Password: "secret"})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}

	password := "new-secret"
	updated, err := store.UpdateHost(ctx, created.ID, UpdateHostInput{Password: &password})
	if err != nil {
		t.Fatalf("UpdateHost failed: %v", err)
	}
	if updated.SSHPassword != "new-secret" || !updated.HasPassword {
		t.Fatalf("expected updated password, got %#v", updated)
	}

	password = ""
	updated, err = store.UpdateHost(ctx, created.ID, UpdateHostInput{Password: &password})
	if err != nil {
		t.Fatalf("UpdateHost clear failed: %v", err)
	}
	if updated.SSHPassword != "" || updated.HasPassword {
		t.Fatalf("expected cleared password, got %#v", updated)
	}
	if updated.HasCredential {
		t.Fatalf("expected cleared credential flag, got %#v", updated)
	}
}

func TestUpdateHostPrivateKey(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()
	created, err := store.CreateHost(ctx, CreateHostInput{Name: "old", Hostname: "old.test", Username: "deploy", Password: "secret"})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}

	method := SSHAuthMethodPrivateKey
	privateKey := "new-private-key"
	passphrase := "new-passphrase"
	updated, err := store.UpdateHost(ctx, created.ID, UpdateHostInput{
		SSHAuthMethod: &method, PrivateKey: &privateKey, PrivateKeyPassphrase: &passphrase,
	})
	if err != nil {
		t.Fatalf("UpdateHost failed: %v", err)
	}
	if updated.SSHAuthMethod != SSHAuthMethodPrivateKey || !updated.HasCredential {
		t.Fatalf("expected private key credential, got %#v", updated)
	}
	if updated.SSHPassword != "" || updated.HasPassword {
		t.Fatalf("expected password cleared after auth switch, got %#v", updated)
	}
	if updated.SSHPrivateKey != "new-private-key" || updated.SSHKeyPassphrase != "new-passphrase" {
		t.Fatalf("expected updated private key, got %#v", updated)
	}
}

func TestUpdateHostRequiresField(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	_, err := store.UpdateHost(context.Background(), "host_missing", UpdateHostInput{})
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestUpdateHostMissing(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	name := "missing"

	_, err := store.UpdateHost(context.Background(), "host_missing", UpdateHostInput{Name: &name})
	if !errors.Is(err, ErrHostNotFound) {
		t.Fatalf("expected host not found, got %v", err)
	}
}

func TestDeleteHostRemovesMetadata(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()
	host, err := store.CreateHost(ctx, CreateHostInput{Name: "delete", Hostname: "delete.test", Username: "deploy"})
	if err != nil {
		t.Fatalf("CreateHost failed: %v", err)
	}
	if _, err := store.SaveSessionMetadata(ctx, SaveSessionMetadataInput{HostID: host.ID, SessionName: "deploy", Tags: []string{"ops"}}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}

	if err := store.DeleteHost(ctx, host.ID); err != nil {
		t.Fatalf("DeleteHost failed: %v", err)
	}
	if _, err := store.GetHost(ctx, host.ID); !errors.Is(err, ErrHostNotFound) {
		t.Fatalf("expected host not found, got %v", err)
	}
	items, err := store.ListSessionMetadata(ctx, host.ID)
	if err != nil {
		t.Fatalf("ListSessionMetadata failed: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected metadata removal, got %#v", items)
	}
}

func TestDeleteHostMissing(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)

	err := store.DeleteHost(context.Background(), "host_missing")
	if !errors.Is(err, ErrHostNotFound) {
		t.Fatalf("expected host not found, got %v", err)
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
	store, err := Open(filepath.Join(t.TempDir(), "chatmux-test.db"))
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
