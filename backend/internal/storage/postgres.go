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
var schema1 string

//go:embed migrations/002_letter_files.sql
var schema2 string

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

// LetterFile represents one stored page image for a confirmed letter.
type LetterFile struct {
	ID        int64     `json:"id"`
	LetterID  int64     `json:"letterId"`
	PageNo    int       `json:"pageNo"`
	Mime      string    `json:"mime"`
	SizeBytes int64     `json:"sizeBytes"`
	Sha256    string    `json:"sha256"`
	CreatedAt time.Time `json:"createdAt"`
}

// SavePageFileParams carries the metadata for one page image to be recorded.
type SavePageFileParams struct {
	PageNo    int
	Path      string
	Mime      string
	SizeBytes int64
	Sha256    string
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
	for _, migration := range []string{schema1, schema2} {
		if _, err := db.ExecContext(ctx, migration); err != nil {
			db.Close()
			return nil, fmt.Errorf("apply PostgreSQL schema: %w", err)
		}
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

// SavePageFiles inserts letter_files rows. Called only when the user opted in.
func (p *Postgres) SavePageFiles(ctx context.Context, letterID int64, pages []SavePageFileParams) ([]LetterFile, error) {
	if len(pages) == 0 {
		return nil, nil
	}
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin transaction for page files: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	files := make([]LetterFile, 0, len(pages))
	for _, pg := range pages {
		var f LetterFile
		if err := tx.QueryRowContext(ctx,
			`INSERT INTO letter_files (letter_id, page_no, path, mime, size_bytes, sha256)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id, letter_id, page_no, mime, size_bytes, sha256, created_at`,
			letterID, pg.PageNo, pg.Path, pg.Mime, pg.SizeBytes, pg.Sha256,
		).Scan(&f.ID, &f.LetterID, &f.PageNo, &f.Mime, &f.SizeBytes, &f.Sha256, &f.CreatedAt); err != nil {
			return nil, fmt.Errorf("insert page file row: %w", err)
		}
		files = append(files, f)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit page files: %w", err)
	}
	return files, nil
}

// ListPageFiles returns all stored page image metadata for a letter.
func (p *Postgres) ListPageFiles(ctx context.Context, letterID int64) ([]LetterFile, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, letter_id, page_no, mime, size_bytes, sha256, created_at
		 FROM letter_files WHERE letter_id = $1 ORDER BY page_no`,
		letterID,
	)
	if err != nil {
		return nil, fmt.Errorf("list page files: %w", err)
	}
	defer rows.Close()
	var files []LetterFile
	for rows.Next() {
		var f LetterFile
		if err := rows.Scan(&f.ID, &f.LetterID, &f.PageNo, &f.Mime, &f.SizeBytes, &f.Sha256, &f.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan page file: %w", err)
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

// GetPageFilePath returns the on-disk path and mime type for a single page image.
func (p *Postgres) GetPageFilePath(ctx context.Context, letterID int64, pageNo int) (string, string, error) {
	var path, mime string
	err := p.db.QueryRowContext(ctx,
		`SELECT path, mime FROM letter_files WHERE letter_id = $1 AND page_no = $2`,
		letterID, pageNo,
	).Scan(&path, &mime)
	if err == sql.ErrNoRows {
		return "", "", nil
	}
	if err != nil {
		return "", "", fmt.Errorf("get page file path: %w", err)
	}
	return path, mime, nil
}

// DeletePageFiles removes all letter_files rows and returns on-disk paths to delete.
func (p *Postgres) DeletePageFiles(ctx context.Context, letterID int64) ([]string, error) {
	rows, err := p.db.QueryContext(ctx,
		`DELETE FROM letter_files WHERE letter_id = $1 RETURNING path`, letterID,
	)
	if err != nil {
		return nil, fmt.Errorf("delete page files: %w", err)
	}
	defer rows.Close()
	var paths []string
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			return nil, fmt.Errorf("scan deleted path: %w", err)
		}
		paths = append(paths, path)
	}
	return paths, rows.Err()
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
