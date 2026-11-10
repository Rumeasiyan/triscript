package storage

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Rumeasiyan/triscript/backend/internal/ocr"
)

func TestPostgresConfirmedLetterRoundTrip(t *testing.T) {
	connectionString := os.Getenv("TEST_DATABASE_URL")
	if connectionString == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	store, err := Open(ctx, connectionString)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if _, err := store.Save(ctx, false, "test-letter", map[string]ocr.Field{}); err == nil {
		t.Fatal("unconfirmed letter was accepted")
	}
	fields := map[string]ocr.Field{
		"subject": {Value: "TEST SUBJECT, NOT VALID", Conf: 90},
		"body":    {Value: "TEST BODY, NOT VALID", Conf: 88},
	}
	letter, err := store.Save(ctx, true, "test-letter", fields)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_, err := store.db.ExecContext(context.Background(), "DELETE FROM letters WHERE id = $1", letter.ID)
		if err != nil {
			t.Errorf("remove PostgreSQL test row: %v", err)
		}
	}()
	if !letter.Confirmed || letter.FormType != "test-letter" || letter.ID < 1 {
		t.Fatalf("unexpected saved record: %+v", letter)
	}
	letters, err := store.List(ctx, 10)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, listed := range letters {
		if listed.ID == letter.ID {
			found = listed.Confirmed && listed.FormType == "test-letter"
		}
	}
	if !found {
		t.Fatal("saved confirmed letter was not returned by the list endpoint")
	}
}

// TestTagCRUD exercises create, list, update and delete for tags.
func TestTagCRUD(t *testing.T) {
	connectionString := os.Getenv("TEST_DATABASE_URL")
	if connectionString == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	store, err := Open(ctx, connectionString)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Create
	tag, err := store.CreateTag(ctx, "TEST Urgent", "#ff0000")
	if err != nil {
		t.Fatalf("create tag: %v", err)
	}
	if tag.ID < 1 || tag.Name != "TEST Urgent" || tag.Colour != "#ff0000" {
		t.Fatalf("unexpected tag: %+v", tag)
	}
	defer func() {
		_ = store.DeleteTag(context.Background(), tag.ID)
	}()

	// List contains new tag
	tags, err := store.ListTags(ctx)
	if err != nil {
		t.Fatalf("list tags: %v", err)
	}
	found := false
	for _, tg := range tags {
		if tg.ID == tag.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("created tag not found in list")
	}

	// Update
	updated, err := store.UpdateTag(ctx, tag.ID, "TEST Land", "#00ff00")
	if err != nil {
		t.Fatalf("update tag: %v", err)
	}
	if updated.Name != "TEST Land" || updated.Colour != "#00ff00" {
		t.Fatalf("unexpected updated tag: %+v", updated)
	}

	// Delete
	if err := store.DeleteTag(ctx, tag.ID); err != nil {
		t.Fatalf("delete tag: %v", err)
	}
	if err := store.DeleteTag(ctx, tag.ID); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound on second delete, got: %v", err)
	}
}

// TestCorrespondentCRUD exercises create, list, update, suggest and delete for correspondents.
func TestCorrespondentCRUD(t *testing.T) {
	connectionString := os.Getenv("TEST_DATABASE_URL")
	if connectionString == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	store, err := Open(ctx, connectionString)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	c, err := store.CreateCorrespondent(ctx, "TEST Divisional Secretariat Colombo")
	if err != nil {
		t.Fatalf("create correspondent: %v", err)
	}
	if c.ID < 1 || c.Name != "TEST Divisional Secretariat Colombo" {
		t.Fatalf("unexpected correspondent: %+v", c)
	}
	defer func() { _ = store.DeleteCorrespondent(context.Background(), c.ID) }()

	// List
	items, err := store.ListCorrespondents(ctx)
	if err != nil {
		t.Fatalf("list correspondents: %v", err)
	}
	found := false
	for _, item := range items {
		if item.ID == c.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("created correspondent not found in list")
	}

	// Suggest
	suggestions, err := store.SuggestCorrespondent(ctx, "Secretariat")
	if err != nil {
		t.Fatalf("suggest correspondents: %v", err)
	}
	suggestFound := false
	for _, s := range suggestions {
		if s.ID == c.ID {
			suggestFound = true
		}
	}
	if !suggestFound {
		t.Fatal("correspondent not found in suggestions")
	}

	// Update
	updated, err := store.UpdateCorrespondent(ctx, c.ID, "TEST Divisional Secretariat Kandy")
	if err != nil {
		t.Fatalf("update correspondent: %v", err)
	}
	if updated.Name != "TEST Divisional Secretariat Kandy" {
		t.Fatalf("unexpected updated correspondent: %+v", updated)
	}

	// Delete
	if err := store.DeleteCorrespondent(ctx, c.ID); err != nil {
		t.Fatalf("delete correspondent: %v", err)
	}
	if err := store.DeleteCorrespondent(ctx, c.ID); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got: %v", err)
	}
}

// TestDocumentTypeCRUD exercises create, list, update and delete for document types.
func TestDocumentTypeCRUD(t *testing.T) {
	connectionString := os.Getenv("TEST_DATABASE_URL")
	if connectionString == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	store, err := Open(ctx, connectionString)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	dt, err := store.CreateDocumentType(ctx, "TEST Circular")
	if err != nil {
		t.Fatalf("create document type: %v", err)
	}
	defer func() { _ = store.DeleteDocumentType(context.Background(), dt.ID) }()

	items, err := store.ListDocumentTypes(ctx)
	if err != nil {
		t.Fatalf("list document types: %v", err)
	}
	found := false
	for _, item := range items {
		if item.ID == dt.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("created document type not found in list")
	}

	updated, err := store.UpdateDocumentType(ctx, dt.ID, "TEST Internal Memo")
	if err != nil {
		t.Fatalf("update document type: %v", err)
	}
	if updated.Name != "TEST Internal Memo" {
		t.Fatalf("unexpected updated document type: %+v", updated)
	}

	if err := store.DeleteDocumentType(ctx, dt.ID); err != nil {
		t.Fatalf("delete document type: %v", err)
	}
	if err := store.DeleteDocumentType(ctx, dt.ID); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got: %v", err)
	}
}

// TestLetterTagsAndPatch exercises assigning tags and patching metadata on a saved letter.
func TestLetterTagsAndPatch(t *testing.T) {
	connectionString := os.Getenv("TEST_DATABASE_URL")
	if connectionString == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	store, err := Open(ctx, connectionString)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Create supporting rows
	tag, err := store.CreateTag(ctx, "TEST Patch Tag", "#123456")
	if err != nil {
		t.Fatalf("setup tag: %v", err)
	}
	defer func() { _ = store.DeleteTag(context.Background(), tag.ID) }()

	corr, err := store.CreateCorrespondent(ctx, "TEST Patch Correspondent")
	if err != nil {
		t.Fatalf("setup correspondent: %v", err)
	}
	defer func() { _ = store.DeleteCorrespondent(context.Background(), corr.ID) }()

	dt, err := store.CreateDocumentType(ctx, "TEST Patch DocType")
	if err != nil {
		t.Fatalf("setup document type: %v", err)
	}
	defer func() { _ = store.DeleteDocumentType(context.Background(), dt.ID) }()

	// Save a confirmed letter
	letter, err := store.Save(ctx, true, "test-letter", map[string]ocr.Field{
		"subject": {Value: "TEST PATCH SUBJECT", Conf: 95},
		"body":    {Value: "TEST PATCH BODY", Conf: 92},
	})
	if err != nil {
		t.Fatalf("save letter: %v", err)
	}
	defer func() {
		_, _ = store.db.ExecContext(context.Background(), "DELETE FROM letters WHERE id = $1", letter.ID)
	}()

	// Patch: set tags, correspondent, doc type
	patched, err := store.Patch(ctx, letter.ID, LetterPatch{
		TagIDs:          []int64{tag.ID},
		CorrespondentID: &corr.ID,
		DocumentTypeID:  &dt.ID,
	})
	if err != nil {
		t.Fatalf("patch letter: %v", err)
	}
	if len(patched.Tags) != 1 || patched.Tags[0].ID != tag.ID {
		t.Fatalf("expected tag %d, got %+v", tag.ID, patched.Tags)
	}
	if patched.CorrespondentID == nil || *patched.CorrespondentID != corr.ID {
		t.Fatalf("expected correspondent %d, got %v", corr.ID, patched.CorrespondentID)
	}
	if patched.DocumentTypeID == nil || *patched.DocumentTypeID != dt.ID {
		t.Fatalf("expected document type %d, got %v", dt.ID, patched.DocumentTypeID)
	}
	if patched.Correspondent == nil || patched.Correspondent.Name != "TEST Patch Correspondent" {
		t.Fatalf("correspondent not hydrated: %+v", patched.Correspondent)
	}
	if patched.DocumentType == nil || patched.DocumentType.Name != "TEST Patch DocType" {
		t.Fatalf("document type not hydrated: %+v", patched.DocumentType)
	}

	// Patch again: clear tags and unset correspondent/document type
	cleared, err := store.Patch(ctx, letter.ID, LetterPatch{
		TagIDs:             []int64{},
		ClearCorrespondent: true,
		ClearDocumentType:  true,
	})
	if err != nil {
		t.Fatalf("clear patch: %v", err)
	}
	if len(cleared.Tags) != 0 {
		t.Fatalf("expected no tags after clearing, got %+v", cleared.Tags)
	}
	if cleared.CorrespondentID != nil {
		t.Fatalf("expected nil correspondent after clearing")
	}

	// Patch on non-existent letter
	_, err = store.Patch(ctx, 999999, LetterPatch{TagIDs: []int64{}})
	if err != ErrNotFound {
		t.Fatalf("expected ErrNotFound for missing letter, got: %v", err)
	}
}
