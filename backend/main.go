package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/Rumeasiyan/triscript/backend/internal/session"
	"github.com/Rumeasiyan/triscript/backend/internal/storage"
)

func main() {
	store := session.NewStore(5 * time.Minute)
	var letters letterStore
	if connectionString := os.Getenv("DATABASE_URL"); connectionString != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		postgres, err := storage.Open(ctx, connectionString)
		cancel()
		if err != nil {
			log.Fatal(err)
		}
		defer postgres.Close()
		letters = postgres
		log.Printf("PostgreSQL connected; confirmed letter storage enabled")
	}

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
