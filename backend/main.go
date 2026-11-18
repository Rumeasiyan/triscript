package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/Rumeasiyan/triscript/backend/internal/session"
	"github.com/Rumeasiyan/triscript/backend/internal/storage"
)

func main() {
	store := session.NewStore(5 * time.Minute)
	var letters letterStore

	connectionString := os.Getenv("DATABASE_URL")

	// No DATABASE_URL set — start an embedded PostgreSQL instance.
	if connectionString == "" {
		log.Printf("DATABASE_URL not set; starting embedded PostgreSQL...")

		// Store data in a fixed path so letters survive restarts.
		home, err := os.UserHomeDir()
		if err != nil {
			log.Fatalf("find home directory: %v", err)
		}
		dataDir := home + "/.triscript-data"

		ep := embeddedpostgres.NewDatabase(
			embeddedpostgres.DefaultConfig().
				Username("triscript").
				Password("triscript").
				Database("triscript").
				Port(5433).
				DataPath(dataDir + "/pgdata").
				BinariesPath(dataDir + "/pgbin"),
		)
		if err := ep.Start(); err != nil {
			log.Fatalf("start embedded PostgreSQL: %v", err)
		}
		defer func() {
			if err := ep.Stop(); err != nil {
				log.Printf("stop embedded PostgreSQL: %v", err)
			}
		}()
		connectionString = "postgres://triscript:triscript@localhost:5433/triscript?sslmode=disable"
		log.Printf("Embedded PostgreSQL ready (data: %s)", dataDir)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	postgres, err := storage.Open(ctx, connectionString)
	cancel()
	if err != nil {
		log.Fatal(err)
	}
	defer postgres.Close()
	letters = postgres
	log.Printf("PostgreSQL connected; confirmed letter storage enabled")

	handler := newAPIHandler(apiConfig{
		store:     store,
		letters:   letters,
		publicURL: env("PUBLIC_URL", "http://localhost:8080"),
		webOrigin: env("WEB_ORIGIN", "http://localhost:3000"),
	})
	addr := env("LISTEN_ADDR", ":8080")
	log.Printf("TRISCRIPT API on %s (OCR: eng, sin+eng, tam+eng)", addr)
	log.Fatal(http.ListenAndServe(addr, handler))
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
