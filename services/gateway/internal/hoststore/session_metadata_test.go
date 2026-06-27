package hoststore

import (
	"context"
	"testing"
)

func TestSaveAndListSessionMetadata(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()

	metadata, err := store.SaveSessionMetadata(ctx, SaveSessionMetadataInput{
		HostID:      "host_1",
		Owner:       "ops",
		SessionName: "deploy",
		Title:       " Deploy shell ",
		Tags:        []string{"prod", " deploy ", "prod", ""},
	})
	if err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}
	if metadata.Title != "Deploy shell" {
		t.Fatalf("expected trimmed title, got %q", metadata.Title)
	}
	if metadata.Owner != "ops" {
		t.Fatalf("expected owner field, got %#v", metadata)
	}
	assertTags(t, metadata.Tags, []string{"prod", "deploy"})

	items, err := store.ListSessionMetadata(ctx, "host_1")
	if err != nil {
		t.Fatalf("ListSessionMetadata failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected one metadata row, got %d", len(items))
	}
	assertTags(t, items[0].Tags, []string{"prod", "deploy"})
}

func TestSaveSessionMetadataPreservesOwner(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()

	if _, err := store.SaveSessionMetadata(ctx, SaveSessionMetadataInput{
		HostID: "host_1", Owner: "ops", SessionName: "deploy",
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}
	updated, err := store.SaveSessionMetadata(ctx, SaveSessionMetadataInput{
		HostID: "host_1", Owner: "other", SessionName: "deploy", Title: "Updated",
	})
	if err != nil {
		t.Fatalf("SaveSessionMetadata update failed: %v", err)
	}
	if updated.Owner != "ops" {
		t.Fatalf("expected owner preservation, got %#v", updated)
	}
}

func TestDeleteSessionMetadataRemovesOnlyTarget(t *testing.T) {
	store := openTestStore(t)
	defer closeStore(t, store)
	ctx := context.Background()

	if _, err := store.SaveSessionMetadata(ctx, SaveSessionMetadataInput{
		HostID: "host_1", Owner: "ops", SessionName: "deploy",
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}
	if _, err := store.SaveSessionMetadata(ctx, SaveSessionMetadataInput{
		HostID: "host_1", Owner: "ops", SessionName: "logs",
	}); err != nil {
		t.Fatalf("SaveSessionMetadata failed: %v", err)
	}

	if err := store.DeleteSessionMetadata(ctx, "host_1", "deploy"); err != nil {
		t.Fatalf("DeleteSessionMetadata failed: %v", err)
	}

	items, err := store.ListSessionMetadata(ctx, "host_1")
	if err != nil {
		t.Fatalf("ListSessionMetadata failed: %v", err)
	}
	if len(items) != 1 || items[0].SessionName != "logs" {
		t.Fatalf("expected only the logs session metadata to remain, got %#v", items)
	}
}

func assertTags(t *testing.T, actual []string, expected []string) {
	t.Helper()
	if len(actual) != len(expected) {
		t.Fatalf("expected tags %#v, got %#v", expected, actual)
	}
	for index, tag := range expected {
		if actual[index] != tag {
			t.Fatalf("expected tags %#v, got %#v", expected, actual)
		}
	}
}
