package main

import (
	"bufio"
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"triscript-backend/db"
	"triscript-backend/handlers"
	"triscript-backend/storage"
)

// loadEnvFile reads key=value pairs from a .env file and sets them as
// environment variables — but only if the variable is not already set.
// This means real environment variables always take priority.
func loadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // file is optional — silently skip if missing
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		// Strip surrounding quotes if present
		if len(val) >= 2 && val[0] == '"' && val[len(val)-1] == '"' {
			val = val[1 : len(val)-1]
		}
		if key == "" {
			continue
		}
		// Only set if not already in environment
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
}

func main() {
	// Load backend/.env first — real env vars take priority over the file.
	loadEnvFile(".env")

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	ttl := handlers.GetTTL()

	// ── Storage directory ────────────────────────────────────────────────
	// Always initialize storage so photo files have a known safe location.
	// Default: ./photo_storage  (relative to the working directory).
	// Override: PHOTO_STORAGE_DIR env var.
	storageDir := os.Getenv("PHOTO_STORAGE_DIR")
	if err := storage.Init(storageDir); err != nil {
		log.Fatalf("TRISCRIPT: storage init failed: %v", err)
	}
	log.Printf("TRISCRIPT: photo storage at %s", storage.Dir)

	// ── Session store ────────────────────────────────────────────────────
	// Use the PostgreSQL repository when DATABASE_URL is set.
	// Fall back to the in-memory store so the app still works without a DB
	// (useful for quick local development and running existing tests).
	var store handlers.Storer
	var repo *db.Repository

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		if err := db.Connect(ctx); err != nil {
			cancel()
			log.Fatalf("TRISCRIPT: database connection failed: %v\n"+
				"  → Check DATABASE_URL and that PostgreSQL is running.\n"+
				"  → To run without a database, unset DATABASE_URL.", err)
		}
		cancel()
		repo = db.NewRepository(db.Pool, ttl)
		store = repo
		log.Printf("TRISCRIPT: connected to PostgreSQL (session TTL: %v)", ttl)
	} else {
		store = handlers.NewStore(ttl)
		log.Printf("TRISCRIPT: using in-memory session store (session TTL: %v)", ttl)
		log.Println("TRISCRIPT: set DATABASE_URL to persist sessions across restarts")
	}

	// ── Background cleanup goroutine (DB mode only) ──────────────────────
	var cleanupStop chan struct{}
	if repo != nil {
		cleanupStop = make(chan struct{})
		go func() {
			ticker := time.NewTicker(1 * time.Minute)
			defer ticker.Stop()
			for {
				select {
				case <-ticker.C:
					ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
					n, err := repo.CleanupExpired(ctx)
					cancel()
					if err != nil {
						log.Printf("TRISCRIPT: cleanup error: %v", err)
					} else if n > 0 {
						log.Printf("TRISCRIPT: cleaned up %d expired session(s)", n)
					}
				case <-cleanupStop:
					return
				}
			}
		}()
	}

	// ── HTTP server ──────────────────────────────────────────────────────
	router := handlers.NewRouter(store)
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("TRISCRIPT Go backend starting on http://localhost:%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// ── Graceful shutdown ────────────────────────────────────────────────
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("TRISCRIPT: shutting down gracefully…")
	if cleanupStop != nil {
		close(cleanupStop)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Printf("TRISCRIPT: shutdown error: %v", err)
	}
	db.Close()
	log.Println("TRISCRIPT: stopped.")
}
