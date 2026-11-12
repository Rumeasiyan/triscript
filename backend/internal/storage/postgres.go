package storage

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Rumeasiyan/triscript/backend/internal/ocr"
	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed migrations/001_letters.sql
var schema string

//go:embed migrations/003_metadata.sql
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
	for _, migration := range []string{schema, schemaMeta} {
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
		setClauses = append(setClauses, "correspondent_id = NULL")
	} else if patch.CorrespondentID != nil {
		addArg("correspondent_id", *patch.CorrespondentID)
	}
	if patch.ClearDocumentType {
		setClauses = append(setClauses, "document_type_id = NULL")
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
// q must be at least 2 characters to avoid returning the entire table.
func (p *Postgres) SuggestCorrespondent(ctx context.Context, q string) ([]Correspondent, error) {
	if len([]rune(q)) < 2 {
		return []Correspondent{}, nil
	}
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
