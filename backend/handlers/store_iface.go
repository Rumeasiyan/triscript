package handlers

import "time"

// Storer is the interface that both the in-memory store and the
// PostgreSQL repository must satisfy. Handlers depend only on this
// interface, so they work with either backend without modification.
type Storer interface {
	// CreateSession creates a new session with the configured TTL.
	CreateSession() (*Session, error)

	// GetSession returns a safe snapshot of the session or (nil, false)
	// when the session does not exist or has expired.
	GetSession(id string) (*SessionStatus, bool)

	// DeleteSession deletes a session and its associated photo.
	// Returns true if the session existed and was deleted.
	DeleteSession(id string) bool

	// SetPhoto stores the image for a session.
	SetPhoto(id string, data []byte, contentType string) PhotoResult

	// GetPhoto retrieves the stored image for a session.
	GetPhoto(id string) (*Photo, PhotoResult)

	// TTL returns the configured session lifetime.
	TTL() time.Duration
}
