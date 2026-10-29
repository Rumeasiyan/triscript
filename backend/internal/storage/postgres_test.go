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
