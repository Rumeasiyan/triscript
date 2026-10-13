// Package db provides the PostgreSQL connection pool and helpers.
package db

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool is the shared connection pool.  Initialized by Connect().
var Pool *pgxpool.Pool

// Connect parses DATABASE_URL, creates a connection pool, and verifies
// connectivity.  Call once at startup.
func Connect(ctx context.Context) error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("db: DATABASE_URL environment variable is not set")
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("db: invalid DATABASE_URL: %w", err)
	}

	// Conservative pool sizing for a single-instance demo server.
	cfg.MaxConns = 10
	cfg.MinConns = 2
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return fmt.Errorf("db: failed to create pool: %w", err)
	}

	// Verify we can actually reach the database.
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return fmt.Errorf("db: cannot reach PostgreSQL — check DATABASE_URL and that PostgreSQL is running: %w", err)
	}

	Pool = pool
	return nil
}

// Close gracefully closes the pool.  Call on shutdown.
func Close() {
	if Pool != nil {
		Pool.Close()
	}
}
