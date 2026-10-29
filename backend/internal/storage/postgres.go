package storage

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Rumeasiyan/triscript/backend/internal/ocr"
	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed migrations/001_letters.sql
var schema string

type Postgres struct {
	db *sql.DB
}

type Letter struct {
	ID        int64           `json:"id"`
	Confirmed bool            `json:"confirmed"`
	FormType  string          `json:"formType"`
	Fields    json.RawMessage `json:"fields"`
	CreatedAt time.Time       `json:"createdAt"`
}

func Open(ctx context.Context, connectionString string) (*Postgres, error) {
	db, err := sql.Open("pgx", connectionString)
	if err != nil {
		return nil, fmt.Errorf("open PostgreSQL connection: %w", err)
	}
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect to PostgreSQL: %w", err)
	}
	if _, err := db.ExecContext(ctx, schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("apply PostgreSQL schema: %w", err)
	}
	return &Postgres{db: db}, nil
}

func (p *Postgres) Close() error {
	return p.db.Close()
}

func (p *Postgres) Save(ctx context.Context, confirmed bool, formType string, fields map[string]ocr.Field) (Letter, error) {
	if !confirmed {
		return Letter{}, fmt.Errorf("letter has not been explicitly confirmed")
	}
	encoded, err := json.Marshal(fields)
	if err != nil {
		return Letter{}, fmt.Errorf("encode letter fields: %w", err)
	}
	var letter Letter
	if err := p.db.QueryRowContext(ctx,
		`INSERT INTO letters (confirmed, form_type, fields) VALUES (TRUE, $1, $2)
		 RETURNING id, confirmed, form_type, fields, created_at`,
		formType, encoded,
	).Scan(&letter.ID, &letter.Confirmed, &letter.FormType, &letter.Fields, &letter.CreatedAt); err != nil {
		return Letter{}, fmt.Errorf("save confirmed letter: %w", err)
	}
	return letter, nil
}

func (p *Postgres) List(ctx context.Context, limit int) ([]Letter, error) {
	if limit < 1 || limit > 100 {
		limit = 100
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, confirmed, form_type, fields, created_at
		 FROM letters WHERE confirmed = TRUE
		 ORDER BY created_at DESC, id DESC LIMIT $1`,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list confirmed letters: %w", err)
	}
	defer rows.Close()
	letters := make([]Letter, 0)
	for rows.Next() {
		var letter Letter
		if err := rows.Scan(&letter.ID, &letter.Confirmed, &letter.FormType, &letter.Fields, &letter.CreatedAt); err != nil {
			return nil, fmt.Errorf("read confirmed letter: %w", err)
		}
		letters = append(letters, letter)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate confirmed letters: %w", err)
	}
	return letters, nil
}
