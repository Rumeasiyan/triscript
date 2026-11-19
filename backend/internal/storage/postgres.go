package storage

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"strings"
	"time"

	"github.com/Rumeasiyan/triscript/backend/internal/ocr"
	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed migrations/001_letters.sql
var schema string

//go:embed migrations/002_letter_files.sql
var schemaFiles string

//go:embed migrations/020_search.sql
var schemaSearch string

//go:embed migrations/030_metadata.sql
var schemaMeta string

type Postgres struct {
	db *sql.DB
}

// ─── Core models ─────────────────────────────────────────────────────────────

type Letter struct {
	ID               int64           `json:"id"`
	Confirmed        bool            `json:"confirmed"`
	FormType         string          `json:"formType"`
	Fields           json.RawMessage `json:"fields"`
	CreatedAt        time.Time       `json:"createdAt"`
	UpdatedAt        *time.Time      `json:"updatedAt,omitempty"`
	CorrespondentID  *int64          `json:"correspondentId,omitempty"`
	DocumentTypeID   *int64          `json:"documentTypeId,omitempty"`
	Tags             []Tag           `json:"tags"`
	Correspondent    *Correspondent  `json:"correspondent,omitempty"`
	DocumentType     *DocumentType   `json:"documentType,omitempty"`
}

type Tag struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Colour    string    `json:"colour"`
	CreatedAt time.Time `json:"createdAt"`
}

type Correspondent struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

type DocumentType struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

// LetterPatch carries the editable fields for PATCH /api/letters/{id}.
type LetterPatch struct {
	FormType        *string
	Fields          map[string]ocr.Field
	CorrespondentID *int64 // nil = no change; zero value = clear
	DocumentTypeID  *int64 // nil = no change; zero value = clear
	TagIDs          []int64 // nil = no change; empty slice = clear all
	ClearCorrespondent bool
	ClearDocumentType  bool
}

// ─── Open ─────────────────────────────────────────────────────────────────────

func Open(ctx context.Context, connectionString string) (*Postgres, error) {
	db, err := sql.Open("pgx", connectionString)
	if err != nil {
		return nil, fmt.Errorf("open PostgreSQL connection: %w", err)
	}
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect to PostgreSQL: %w", err)
	}
	for _, migration := range []string{schema, schemaFiles, schemaSearch, schemaMeta} {
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

// ─── Letters ─────────────────────────────────────────────────────────────────

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
		`INSERT INTO letters (confirmed, form_type, fields)
		 VALUES (TRUE, $1, $2)
		 RETURNING id, confirmed, form_type, fields, created_at, updated_at,
		           correspondent_id, document_type_id`,
		formType, encoded,
	).Scan(
		&letter.ID, &letter.Confirmed, &letter.FormType, &letter.Fields,
		&letter.CreatedAt, &letter.UpdatedAt,
		&letter.CorrespondentID, &letter.DocumentTypeID,
	); err != nil {
		return Letter{}, fmt.Errorf("save confirmed letter: %w", err)
	}
	letter.Tags = []Tag{}
	return letter, nil
}

func (p *Postgres) List(ctx context.Context, limit int) ([]Letter, error) {
	if limit < 1 || limit > 100 {
		limit = 100
	}
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, confirmed, form_type, fields, created_at, updated_at,
		        correspondent_id, document_type_id
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
		var l Letter
		if err := rows.Scan(
			&l.ID, &l.Confirmed, &l.FormType, &l.Fields,
			&l.CreatedAt, &l.UpdatedAt,
			&l.CorrespondentID, &l.DocumentTypeID,
		); err != nil {
			return nil, fmt.Errorf("read confirmed letter: %w", err)
		}
		l.Tags = []Tag{}
		letters = append(letters, l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate confirmed letters: %w", err)
	}
	// Hydrate tags and related entities for all letters.
	if err := p.hydrateTags(ctx, letters); err != nil {
		return nil, err
	}
	if err := p.hydrateCorrespondents(ctx, letters); err != nil {
		return nil, err
	}
	if err := p.hydrateDocumentTypes(ctx, letters); err != nil {
		return nil, err
	}
	return letters, nil
}

// Get returns a single confirmed letter by ID.
func (p *Postgres) Get(ctx context.Context, id int64) (Letter, error) {
	var l Letter
	err := p.db.QueryRowContext(ctx,
		`SELECT id, confirmed, form_type, fields, created_at, updated_at,
		        correspondent_id, document_type_id
		 FROM letters WHERE id = $1 AND confirmed = TRUE`, id,
	).Scan(
		&l.ID, &l.Confirmed, &l.FormType, &l.Fields,
		&l.CreatedAt, &l.UpdatedAt,
		&l.CorrespondentID, &l.DocumentTypeID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Letter{}, ErrNotFound
	}
	if err != nil {
		return Letter{}, fmt.Errorf("get letter %d: %w", id, err)
	}
	l.Tags = []Tag{}
	letters := []Letter{l}
	if err := p.hydrateTags(ctx, letters); err != nil {
		return Letter{}, err
	}
	if err := p.hydrateCorrespondents(ctx, letters); err != nil {
		return Letter{}, err
	}
	if err := p.hydrateDocumentTypes(ctx, letters); err != nil {
		return Letter{}, err
	}
	return letters[0], nil
}

// Patch edits the metadata of a confirmed letter.
func (p *Postgres) Patch(ctx context.Context, id int64, patch LetterPatch) (Letter, error) {
	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return Letter{}, fmt.Errorf("begin patch transaction: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	// Verify the letter exists and is confirmed.
	var exists bool
	if err := tx.QueryRowContext(ctx,
		`SELECT EXISTS (SELECT 1 FROM letters WHERE id = $1 AND confirmed = TRUE)`, id,
	).Scan(&exists); err != nil || !exists {
		return Letter{}, ErrNotFound
	}

	// Build the SET clause dynamically.
	type arg struct {
		col string
		val any
	}
	args := []any{} // positional args: $1 ... $N, last is id
	setClauses := []string{"updated_at = NOW()"}

	addArg := func(col string, val any) {
		args = append(args, val)
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, len(args)))
	}

	if patch.FormType != nil {
		addArg("form_type", *patch.FormType)
	}
	if patch.Fields != nil {
		encoded, err := json.Marshal(patch.Fields)
		if err != nil {
			return Letter{}, fmt.Errorf("encode patched fields: %w", err)
		}
		addArg("fields", encoded)
	}
	if patch.ClearCorrespondent {
		setClauses = append(setClauses, fmt.Sprintf("correspondent_id = NULL"))
	} else if patch.CorrespondentID != nil {
		addArg("correspondent_id", *patch.CorrespondentID)
	}
	if patch.ClearDocumentType {
		setClauses = append(setClauses, fmt.Sprintf("document_type_id = NULL"))
	} else if patch.DocumentTypeID != nil {
		addArg("document_type_id", *patch.DocumentTypeID)
	}

	// Always at least update updated_at.
	idPos := len(args) + 1
	args = append(args, id)

	query := "UPDATE letters SET "
	for i, clause := range setClauses {
		if i > 0 {
			query += ", "
		}
		query += clause
	}
	query += fmt.Sprintf(" WHERE id = $%d AND confirmed = TRUE", idPos)

	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return Letter{}, fmt.Errorf("patch letter %d: %w", id, err)
	}

	// Replace tags if provided.
	if patch.TagIDs != nil {
		if _, err := tx.ExecContext(ctx,
			`DELETE FROM letter_tags WHERE letter_id = $1`, id,
		); err != nil {
			return Letter{}, fmt.Errorf("clear letter tags: %w", err)
		}
		for _, tagID := range patch.TagIDs {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO letter_tags (letter_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
				id, tagID,
			); err != nil {
				return Letter{}, fmt.Errorf("add tag %d to letter %d: %w", tagID, id, err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return Letter{}, fmt.Errorf("commit patch transaction: %w", err)
	}

	return p.Get(ctx, id)
}

// hydrateTags loads tags for a slice of letters in one query.
func (p *Postgres) hydrateTags(ctx context.Context, letters []Letter) error {
	if len(letters) == 0 {
		return nil
	}
	idIdx := make(map[int64]int, len(letters))
	ids := make([]any, len(letters))
	for i, l := range letters {
		ids[i] = l.ID
		idIdx[l.ID] = i
	}
	placeholders := ""
	for i := range ids {
		if i > 0 {
			placeholders += ","
		}
		placeholders += fmt.Sprintf("$%d", i+1)
	}
	rows, err := p.db.QueryContext(ctx, fmt.Sprintf(
		`SELECT lt.letter_id, t.id, t.name, t.colour, t.created_at
		 FROM letter_tags lt
		 JOIN tags t ON t.id = lt.tag_id
		 WHERE lt.letter_id IN (%s)
		 ORDER BY t.name`, placeholders,
	), ids...)
	if err != nil {
		return fmt.Errorf("hydrate tags: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var letterID int64
		var tag Tag
		if err := rows.Scan(&letterID, &tag.ID, &tag.Name, &tag.Colour, &tag.CreatedAt); err != nil {
			return fmt.Errorf("scan tag: %w", err)
		}
		idx := idIdx[letterID]
		letters[idx].Tags = append(letters[idx].Tags, tag)
	}
	return rows.Err()
}

// hydrateCorrespondents fills Correspondent on letters that have a correspondent_id.
func (p *Postgres) hydrateCorrespondents(ctx context.Context, letters []Letter) error {
	ids := map[int64]struct{}{}
	for _, l := range letters {
		if l.CorrespondentID != nil {
			ids[*l.CorrespondentID] = struct{}{}
		}
	}
	if len(ids) == 0 {
		return nil
	}
	args := make([]any, 0, len(ids))
	placeholders := ""
	for id := range ids {
		if len(args) > 0 {
			placeholders += ","
		}
		args = append(args, id)
		placeholders += fmt.Sprintf("$%d", len(args))
	}
	rows, err := p.db.QueryContext(ctx, fmt.Sprintf(
		`SELECT id, name, created_at FROM correspondents WHERE id IN (%s)`, placeholders,
	), args...)
	if err != nil {
		return fmt.Errorf("hydrate correspondents: %w", err)
	}
	defer rows.Close()
	byID := map[int64]Correspondent{}
	for rows.Next() {
		var c Correspondent
		if err := rows.Scan(&c.ID, &c.Name, &c.CreatedAt); err != nil {
			return fmt.Errorf("scan correspondent: %w", err)
		}
		byID[c.ID] = c
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range letters {
		if letters[i].CorrespondentID != nil {
			c := byID[*letters[i].CorrespondentID]
			letters[i].Correspondent = &c
		}
	}
	return nil
}

// hydrateDocumentTypes fills DocumentType on letters that have a document_type_id.
func (p *Postgres) hydrateDocumentTypes(ctx context.Context, letters []Letter) error {
	ids := map[int64]struct{}{}
	for _, l := range letters {
		if l.DocumentTypeID != nil {
			ids[*l.DocumentTypeID] = struct{}{}
		}
	}
	if len(ids) == 0 {
		return nil
	}
	args := make([]any, 0, len(ids))
	placeholders := ""
	for id := range ids {
		if len(args) > 0 {
			placeholders += ","
		}
		args = append(args, id)
		placeholders += fmt.Sprintf("$%d", len(args))
	}
	rows, err := p.db.QueryContext(ctx, fmt.Sprintf(
		`SELECT id, name, created_at FROM document_types WHERE id IN (%s)`, placeholders,
	), args...)
	if err != nil {
		return fmt.Errorf("hydrate document types: %w", err)
	}
	defer rows.Close()
	byID := map[int64]DocumentType{}
	for rows.Next() {
		var dt DocumentType
		if err := rows.Scan(&dt.ID, &dt.Name, &dt.CreatedAt); err != nil {
			return fmt.Errorf("scan document type: %w", err)
		}
		byID[dt.ID] = dt
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range letters {
		if letters[i].DocumentTypeID != nil {
			dt := byID[*letters[i].DocumentTypeID]
			letters[i].DocumentType = &dt
		}
	}
	return nil
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

func (p *Postgres) CreateTag(ctx context.Context, name, colour string) (Tag, error) {
	var tag Tag
	err := p.db.QueryRowContext(ctx,
		`INSERT INTO tags (name, colour) VALUES ($1, $2)
		 RETURNING id, name, colour, created_at`,
		name, colour,
	).Scan(&tag.ID, &tag.Name, &tag.Colour, &tag.CreatedAt)
	if err != nil {
		return Tag{}, fmt.Errorf("create tag: %w", err)
	}
	return tag, nil
}

func (p *Postgres) ListTags(ctx context.Context) ([]Tag, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, name, colour, created_at FROM tags ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	defer rows.Close()
	tags := make([]Tag, 0)
	for rows.Next() {
		var tag Tag
		if err := rows.Scan(&tag.ID, &tag.Name, &tag.Colour, &tag.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan tag: %w", err)
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

func (p *Postgres) UpdateTag(ctx context.Context, id int64, name, colour string) (Tag, error) {
	var tag Tag
	err := p.db.QueryRowContext(ctx,
		`UPDATE tags SET name = $2, colour = $3
		 WHERE id = $1
		 RETURNING id, name, colour, created_at`,
		id, name, colour,
	).Scan(&tag.ID, &tag.Name, &tag.Colour, &tag.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Tag{}, ErrNotFound
	}
	if err != nil {
		return Tag{}, fmt.Errorf("update tag %d: %w", id, err)
	}
	return tag, nil
}

func (p *Postgres) DeleteTag(ctx context.Context, id int64) error {
	result, err := p.db.ExecContext(ctx, `DELETE FROM tags WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete tag %d: %w", id, err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

// ─── Correspondents ───────────────────────────────────────────────────────────

func (p *Postgres) CreateCorrespondent(ctx context.Context, name string) (Correspondent, error) {
	var c Correspondent
	err := p.db.QueryRowContext(ctx,
		`INSERT INTO correspondents (name) VALUES ($1) RETURNING id, name, created_at`,
		name,
	).Scan(&c.ID, &c.Name, &c.CreatedAt)
	if err != nil {
		return Correspondent{}, fmt.Errorf("create correspondent: %w", err)
	}
	return c, nil
}

func (p *Postgres) ListCorrespondents(ctx context.Context) ([]Correspondent, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, name, created_at FROM correspondents ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list correspondents: %w", err)
	}
	defer rows.Close()
	items := make([]Correspondent, 0)
	for rows.Next() {
		var c Correspondent
		if err := rows.Scan(&c.ID, &c.Name, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan correspondent: %w", err)
		}
		items = append(items, c)
	}
	return items, rows.Err()
}

func (p *Postgres) UpdateCorrespondent(ctx context.Context, id int64, name string) (Correspondent, error) {
	var c Correspondent
	err := p.db.QueryRowContext(ctx,
		`UPDATE correspondents SET name = $2 WHERE id = $1
		 RETURNING id, name, created_at`,
		id, name,
	).Scan(&c.ID, &c.Name, &c.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Correspondent{}, ErrNotFound
	}
	if err != nil {
		return Correspondent{}, fmt.Errorf("update correspondent %d: %w", id, err)
	}
	return c, nil
}

func (p *Postgres) DeleteCorrespondent(ctx context.Context, id int64) error {
	result, err := p.db.ExecContext(ctx, `DELETE FROM correspondents WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete correspondent %d: %w", id, err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

// SuggestCorrespondent returns a correspondent whose name contains the search
// string (case-insensitive), to power the "from field suggestion" feature.
// It returns at most 5 matches; a person must still confirm the choice.
func (p *Postgres) SuggestCorrespondent(ctx context.Context, q string) ([]Correspondent, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, name, created_at FROM correspondents
		 WHERE name ILIKE '%' || $1 || '%'
		 ORDER BY name LIMIT 5`,
		q,
	)
	if err != nil {
		return nil, fmt.Errorf("suggest correspondents: %w", err)
	}
	defer rows.Close()
	items := make([]Correspondent, 0)
	for rows.Next() {
		var c Correspondent
		if err := rows.Scan(&c.ID, &c.Name, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan correspondent suggestion: %w", err)
		}
		items = append(items, c)
	}
	return items, rows.Err()
}

// ─── Document types ───────────────────────────────────────────────────────────

func (p *Postgres) CreateDocumentType(ctx context.Context, name string) (DocumentType, error) {
	var dt DocumentType
	err := p.db.QueryRowContext(ctx,
		`INSERT INTO document_types (name) VALUES ($1) RETURNING id, name, created_at`,
		name,
	).Scan(&dt.ID, &dt.Name, &dt.CreatedAt)
	if err != nil {
		return DocumentType{}, fmt.Errorf("create document type: %w", err)
	}
	return dt, nil
}

func (p *Postgres) ListDocumentTypes(ctx context.Context) ([]DocumentType, error) {
	rows, err := p.db.QueryContext(ctx,
		`SELECT id, name, created_at FROM document_types ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list document types: %w", err)
	}
	defer rows.Close()
	items := make([]DocumentType, 0)
	for rows.Next() {
		var dt DocumentType
		if err := rows.Scan(&dt.ID, &dt.Name, &dt.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan document type: %w", err)
		}
		items = append(items, dt)
	}
	return items, rows.Err()
}

func (p *Postgres) UpdateDocumentType(ctx context.Context, id int64, name string) (DocumentType, error) {
	var dt DocumentType
	err := p.db.QueryRowContext(ctx,
		`UPDATE document_types SET name = $2 WHERE id = $1
		 RETURNING id, name, created_at`,
		id, name,
	).Scan(&dt.ID, &dt.Name, &dt.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return DocumentType{}, ErrNotFound
	}
	if err != nil {
		return DocumentType{}, fmt.Errorf("update document type %d: %w", id, err)
	}
	return dt, nil
}

func (p *Postgres) DeleteDocumentType(ctx context.Context, id int64) error {
	result, err := p.db.ExecContext(ctx, `DELETE FROM document_types WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete document type %d: %w", id, err)
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return ErrNotFound
	}
	return nil
}

// ─── Errors ───────────────────────────────────────────────────────────────────

// ErrNotFound is returned when a requested row does not exist.
var ErrNotFound = errors.New("not found")

// ─── Page image files (Group A) ───────────────────────────────────────────────

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

// SavePageFileParams carries metadata for one page image to be recorded.
type SavePageFileParams struct {
	PageNo    int
	Path      string
	Mime      string
	SizeBytes int64
	Sha256    string
}

// SavePageFiles inserts letter_files rows atomically.
func (p *Postgres) SavePageFiles(ctx context.Context, letterID int64, pages []SavePageFileParams) ([]LetterFile, error) {
	files := make([]LetterFile, 0, len(pages))
	for _, pg := range pages {
		var f LetterFile
		if err := p.db.QueryRowContext(ctx,
			`INSERT INTO letter_files
			   (letter_id, page_no, path, mime, size_bytes, sha256)
			 VALUES ($1,$2,$3,$4,$5,$6)
			 RETURNING id, letter_id, page_no, mime, size_bytes, sha256, created_at`,
			letterID, pg.PageNo, pg.Path, pg.Mime, pg.SizeBytes, pg.Sha256,
		).Scan(&f.ID, &f.LetterID, &f.PageNo, &f.Mime, &f.SizeBytes, &f.Sha256, &f.CreatedAt); err != nil {
			return nil, fmt.Errorf("save page file %d for letter %d: %w", pg.PageNo, letterID, err)
		}
		files = append(files, f)
	}
	return files, nil
}

// ListPageFiles returns metadata for all pages of a letter, ordered by page_no.
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

// GetPageFilePath returns the on-disk path and mime type for a single page.
func (p *Postgres) GetPageFilePath(ctx context.Context, letterID int64, pageNo int) (string, string, error) {
	var path, mime string
	err := p.db.QueryRowContext(ctx,
		`SELECT path, mime FROM letter_files WHERE letter_id = $1 AND page_no = $2`,
		letterID, pageNo,
	).Scan(&path, &mime)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", nil
	}
	if err != nil {
		return "", "", fmt.Errorf("get page file path: %w", err)
	}
	return path, mime, nil
}

// DeletePageFiles removes all letter_files rows and returns on-disk paths.
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

// ─── Full-text search (Group B) ───────────────────────────────────────────────

// SearchResult wraps a Letter with an HTML-escaped snippet from ts_headline.
type SearchResult struct {
	Letter
	Snippet string `json:"snippet"`
	Total   int64  `json:"-"` // total matching rows (reported once in SearchPage)
}

// SearchPage is the response envelope for GET /api/letters/search.
type SearchPage struct {
	Total   int64          `json:"total"`
	Offset  int            `json:"offset"`
	Limit   int            `json:"limit"`
	Results []SearchResult `json:"results"`
}

// SearchParams carries validated query parameters for Search.
type SearchParams struct {
	Q        string
	FormType string
	Language string
	DateFrom string // YYYY-MM-DD
	DateTo   string // YYYY-MM-DD
	Sort     string // "newest" | "oldest"
	Limit    int
	Offset   int
}

// Search runs tsvector whole-word AND trigram partial-match query, returns
// highlighted snippets and total count.
func (p *Postgres) Search(ctx context.Context, sp SearchParams) (SearchPage, error) {
	if sp.Limit < 1 || sp.Limit > 100 {
		sp.Limit = 20
	}
	if sp.Offset < 0 {
		sp.Offset = 0
	}
	sortDir := "DESC"
	if sp.Sort == "oldest" {
		sortDir = "ASC"
	}

	args := []any{}
	conditions := []string{"l.confirmed = TRUE"}

	addArg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	// Full-text or trigram match when q is provided.
	// We use the same arg value for tsvector, trigram and ts_headline, but each
	// must be a separate $N placeholder so both the count and data queries can
	// share the same positional-arg slice without conflicts.
	snippetExpr := "''"
	if sp.Q != "" {
		tsqArg := addArg(sp.Q)   // $N for plainto_tsquery
		trgArg := addArg(sp.Q)   // $N+1 for trigram operators
		conditions = append(conditions,
			fmt.Sprintf(`(
				l.search_vector @@ plainto_tsquery('simple', %s)
				OR (l.fields->>'subject') %%> %s
				OR (l.fields->>'body')    %%> %s
				OR (l.fields->>'from')    %%> %s
			)`, tsqArg, trgArg, trgArg, trgArg),
		)
		// ts_headline arg — added only in the data query, so we record its
		// placeholder text now but do NOT call addArg here.
		// We'll add it right before building the data query.
		_ = trgArg // silence unused-var lint
	}

	if sp.FormType != "" {
		conditions = append(conditions, fmt.Sprintf("l.form_type = %s", addArg(sp.FormType)))
	}
	if sp.Language != "" {
		conditions = append(conditions, fmt.Sprintf("lower(l.fields->>'language') = lower(%s)", addArg(sp.Language)))
	}
	if sp.DateFrom != "" {
		conditions = append(conditions, fmt.Sprintf("l.created_at >= %s::date", addArg(sp.DateFrom)))
	}
	if sp.DateTo != "" {
		conditions = append(conditions, fmt.Sprintf("l.created_at < (%s::date + interval '1 day')", addArg(sp.DateTo)))
	}

	where := strings.Join(conditions, " AND ")

	// COUNT uses only the args built so far (no snippet arg yet).
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM letters l WHERE %s`, where)
	var total int64
	if err := p.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&total); err != nil {
		return SearchPage{}, fmt.Errorf("search count: %w", err)
	}

	// Add snippet arg and limit/offset AFTER the count query.
	if sp.Q != "" {
		snippetArg := addArg(sp.Q)
		snippetExpr = fmt.Sprintf(
			`ts_headline('simple', coalesce(l.fields->>'body',''), plainto_tsquery('simple', %s),
			 'StartSel=<mark>,StopSel=</mark>,MaxWords=35,MinWords=15,MaxFragments=1')`,
			snippetArg,
		)
	}
	limitArg := addArg(sp.Limit)
	offsetArg := addArg(sp.Offset)

	dataQuery := fmt.Sprintf(`
		SELECT l.id, l.confirmed, l.form_type, l.fields, l.created_at, l.updated_at,
		       l.correspondent_id, l.document_type_id,
		       %s AS snippet
		FROM letters l
		WHERE %s
		ORDER BY l.created_at %s, l.id %s
		LIMIT %s OFFSET %s`,
		snippetExpr, where, sortDir, sortDir, limitArg, offsetArg,
	)

	rows, err := p.db.QueryContext(ctx, dataQuery, args...)
	if err != nil {
		return SearchPage{}, fmt.Errorf("search query: %w", err)
	}
	defer rows.Close()

	results := make([]SearchResult, 0)
	letters := make([]Letter, 0)

	for rows.Next() {
		var sr SearchResult
		var rawSnippet string
		if err := rows.Scan(
			&sr.ID, &sr.Confirmed, &sr.FormType, &sr.Fields,
			&sr.CreatedAt, &sr.UpdatedAt,
			&sr.CorrespondentID, &sr.DocumentTypeID,
			&rawSnippet,
		); err != nil {
			return SearchPage{}, fmt.Errorf("scan search result: %w", err)
		}
		sr.Tags = []Tag{}
		// ts_headline produces HTML tags we want; HTML-escape everything else.
		sr.Snippet = html.EscapeString(rawSnippet)
		results = append(results, sr)
		letters = append(letters, sr.Letter)
	}
	if err := rows.Err(); err != nil {
		return SearchPage{}, fmt.Errorf("iterate search results: %w", err)
	}

	// Hydrate related entities into the shared Letter slice.
	if err := p.hydrateTags(ctx, letters); err != nil {
		return SearchPage{}, err
	}
	if err := p.hydrateCorrespondents(ctx, letters); err != nil {
		return SearchPage{}, err
	}
	if err := p.hydrateDocumentTypes(ctx, letters); err != nil {
		return SearchPage{}, err
	}
	for i := range results {
		results[i].Letter = letters[i]
	}

	return SearchPage{
		Total:   total,
		Offset:  sp.Offset,
		Limit:   sp.Limit,
		Results: results,
	}, nil
}
