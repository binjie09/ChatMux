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
