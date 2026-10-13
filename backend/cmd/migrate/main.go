// cmd/migrate applies or rolls back TRISCRIPT database migrations.
//
// Usage (from the backend/ directory):
//
//	go run ./cmd/migrate up      — apply all pending migrations
//	go run ./cmd/migrate down    — roll back the last applied migration
//	go run ./cmd/migrate status  — show which migrations have been applied
//
// Requires DATABASE_URL to be set in the environment.
// On Windows, set it in a terminal before running:
//
//	set DATABASE_URL=postgres://triscript_user:password@localhost:5432/triscript_db?sslmode=disable
//	go run ./cmd/migrate up
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: migrate <up|down|status>")
	}
	action := strings.ToLower(os.Args[1])

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("cannot connect: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("cannot reach database: %v", err)
	}

	// Ensure the migrations tracking table exists.
	if err := ensureTracker(ctx, pool); err != nil {
		log.Fatalf("tracker table: %v", err)
	}

	migrationsDir := migrationsPath()
	ups, downs, err := loadFiles(migrationsDir)
	if err != nil {
		log.Fatalf("load migration files: %v", err)
	}

	switch action {
	case "up":
		applied, err := appliedMigrations(ctx, pool)
		if err != nil {
			log.Fatalf("query applied: %v", err)
		}
		count := 0
		for _, name := range ups {
			if applied[name] {
				continue
			}
			if err := runFile(ctx, pool, filepath.Join(migrationsDir, name+".up.sql"), name, "up"); err != nil {
				log.Fatalf("apply %s: %v", name, err)
			}
			log.Printf("✓ applied %s", name)
			count++
		}
		if count == 0 {
			log.Println("nothing to apply — database is up to date")
		}

	case "down":
		applied, err := appliedMigrations(ctx, pool)
		if err != nil {
			log.Fatalf("query applied: %v", err)
		}
		// Roll back the most recently applied migration.
		var last string
		for _, name := range ups {
			if applied[name] {
				last = name
			}
		}
		if last == "" {
			log.Println("nothing to roll back")
			return
		}
		downFile, ok := downs[last]
		if !ok {
			log.Fatalf("no down file for %s", last)
		}
		if err := runFile(ctx, pool, filepath.Join(migrationsDir, downFile), last, "down"); err != nil {
			log.Fatalf("rollback %s: %v", last, err)
		}
		log.Printf("✓ rolled back %s", last)

	case "status":
		applied, err := appliedMigrations(ctx, pool)
		if err != nil {
			log.Fatalf("query applied: %v", err)
		}
		fmt.Println("Migration status:")
		for _, name := range ups {
			mark := "[ ]"
			if applied[name] {
				mark = "[x]"
			}
			fmt.Printf("  %s  %s\n", mark, name)
		}

	default:
		log.Fatalf("unknown action %q — use up, down, or status", action)
	}
}

func ensureTracker(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name       TEXT        PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`)
	return err
}

func appliedMigrations(ctx context.Context, pool *pgxpool.Pool) (map[string]bool, error) {
	rows, err := pool.Query(ctx, `SELECT name FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		m[name] = true
	}
	return m, rows.Err()
}

func runFile(ctx context.Context, pool *pgxpool.Pool, path, name, direction string) error {
	sql, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, string(sql)); err != nil {
		return fmt.Errorf("exec SQL: %w", err)
	}
	if direction == "up" {
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name); err != nil {
			return err
		}
	} else {
		if _, err := tx.Exec(ctx, `DELETE FROM schema_migrations WHERE name = $1`, name); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// loadFiles scans the migrations directory and returns sorted up/down file lists.
func loadFiles(dir string) ([]string, map[string]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil, fmt.Errorf("read dir %s: %w", dir, err)
	}
	upSet := make(map[string]bool)
	downs := make(map[string]string) // name -> filename
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		n := e.Name()
		if strings.HasSuffix(n, ".up.sql") {
			base := strings.TrimSuffix(n, ".up.sql")
			upSet[base] = true
		} else if strings.HasSuffix(n, ".down.sql") {
			base := strings.TrimSuffix(n, ".down.sql")
			downs[base] = n
		}
	}
	var ups []string
	for name := range upSet {
		ups = append(ups, name)
	}
	sort.Strings(ups)
	return ups, downs, nil
}

// migrationsPath returns the path to the migrations/ directory relative to
// the location of this source file, so it works regardless of the working
// directory the binary is invoked from.
func migrationsPath() string {
	// When run with "go run ./cmd/migrate", __file__ isn't available.
	// Use the executable path or fall back to a relative path.
	_, filename, _, ok := runtime.Caller(0)
	if ok {
		// filename is something like .../backend/cmd/migrate/main.go
		// We want .../backend/migrations
		return filepath.Join(filepath.Dir(filename), "..", "..", "migrations")
	}
	return filepath.Join("migrations")
}
