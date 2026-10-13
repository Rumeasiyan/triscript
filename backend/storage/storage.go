// Package storage manages private local file storage for session photos.
//
// Photos are written to a directory that must NOT be inside the Next.js
// public/ folder.  The directory is configured via PHOTO_STORAGE_DIR
// (default: ./photo_storage relative to the working directory).
//
// Storage keys are random hex strings; user-supplied filenames are never
// used.  Cleanup removes files when their session is deleted or expires.
package storage

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Dir is the private directory where photos are stored.
// Initialized by Init().
var Dir string

// Init creates the storage directory and sets Dir.
// Call once at startup before any other function in this package.
func Init(dir string) error {
	if dir == "" {
		dir = "photo_storage"
	}
	abs, err := filepath.Abs(dir)
	if err != nil {
		return fmt.Errorf("storage: cannot resolve path %q: %w", dir, err)
	}
	// 0700 — only the owner (the server process) can read/write
	if err := os.MkdirAll(abs, 0700); err != nil {
		return fmt.Errorf("storage: cannot create directory %q: %w", abs, err)
	}
	Dir = abs
	return nil
}

// NewKey returns a cryptographically random 32-hex-char storage key.
func NewKey() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", errors.New("storage: failed to generate key")
	}
	return hex.EncodeToString(b), nil
}

// Write stores data under key inside Dir.
// If a file already exists for that key it is overwritten atomically.
func Write(key string, data []byte) error {
	if Dir == "" {
		return errors.New("storage: not initialized — call Init first")
	}
	if key == "" {
		return errors.New("storage: key must not be empty")
	}
	// Write to a temp file first, then rename — atomic on most OS/FS.
	tmp := filepath.Join(Dir, key+".tmp")
	dest := filepath.Join(Dir, key)
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return fmt.Errorf("storage: write temp file: %w", err)
	}
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(tmp) // best-effort cleanup of temp file
		return fmt.Errorf("storage: rename to final path: %w", err)
	}
	return nil
}

// Read returns the bytes stored under key, or an error if not found.
func Read(key string) ([]byte, error) {
	if Dir == "" {
		return nil, errors.New("storage: not initialized — call Init first")
	}
	if key == "" {
		return nil, errors.New("storage: key must not be empty")
	}
	data, err := os.ReadFile(filepath.Join(Dir, key))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("storage: file not found for key %q", key)
		}
		return nil, fmt.Errorf("storage: read file: %w", err)
	}
	return data, nil
}

// Delete removes the file for key.  It is not an error if the file does
// not exist (idempotent cleanup).
func Delete(key string) error {
	if Dir == "" {
		return errors.New("storage: not initialized — call Init first")
	}
	if key == "" {
		return nil
	}
	err := os.Remove(filepath.Join(Dir, key))
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("storage: delete file: %w", err)
	}
	return nil
}

// PathFor returns the absolute filesystem path for a key.
// For internal diagnostics only — never expose this to HTTP clients.
func PathFor(key string) string {
	return filepath.Join(Dir, key)
}
