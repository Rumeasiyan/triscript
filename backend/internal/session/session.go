// Package session: in-memory, expiring pairing sessions (no data kept after expiry).
package session

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"sync"
	"time"

	"github.com/Rumeasiyan/triscript/backend/internal/ocr"
)

type Event struct {
	Type string `json:"type"` // paired | captured | processing | page-ready | result | error | expired
	Data any    `json:"data,omitempty"`
}

type Session struct {
	ID, Token  string
	Expires    time.Time
	subs       map[chan Event]struct{}
	mu         sync.Mutex
	processing bool
	completed  bool
	pages      [][]ocr.Line
}

type Store struct {
	mu  sync.Mutex
	m   map[string]*Session
	ttl time.Duration
}

func NewStore(ttl time.Duration) *Store {
	s := &Store{m: map[string]*Session{}, ttl: ttl}
	go func() {
		for range time.Tick(10 * time.Second) {
			s.mu.Lock()
			for id, ss := range s.m {
				if time.Now().After(ss.Expires) {
					ss.Publish(Event{Type: "expired"})
					delete(s.m, id)
				}
			}
			s.mu.Unlock()
		}
	}()
	return s
}

func rnd(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func (s *Store) New() *Session {
	for {
		ss := &Session{ID: rnd(16), Token: rnd(16), Expires: time.Now().Add(s.ttl), subs: map[chan Event]struct{}{}}
		s.mu.Lock()
		if _, exists := s.m[ss.ID]; !exists {
			s.m[ss.ID] = ss
			s.mu.Unlock()
			return ss
		}
		s.mu.Unlock()
	}
}

// Get returns a live session; token "" skips the token check (computer side).
func (s *Store) Get(id, token string) *Session {
	s.mu.Lock()
	defer s.mu.Unlock()
	ss := s.m[id]
	if ss == nil || time.Now().After(ss.Expires) ||
		(token != "" && subtle.ConstantTimeCompare([]byte(token), []byte(ss.Token)) != 1) {
		return nil
	}
	return ss
}

func (ss *Session) Subscribe() (chan Event, func()) {
	ch := make(chan Event, 8)
	ss.mu.Lock()
	ss.subs[ch] = struct{}{}
	ss.mu.Unlock()
	return ch, func() { ss.mu.Lock(); delete(ss.subs, ch); ss.mu.Unlock() }
}

func (ss *Session) Publish(e Event) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	for ch := range ss.subs {
		select {
		case ch <- e:
		default:
		}
	}
}

func (ss *Session) BeginPage() bool {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	if ss.processing || ss.completed || time.Now().After(ss.Expires) {
		return false
	}
	ss.processing = true
	return true
}

func (ss *Session) AddPage(lines []ocr.Line, complete bool) ([][]ocr.Line, int, bool) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	if !ss.processing || ss.completed || time.Now().After(ss.Expires) {
		ss.processing = false
		return nil, len(ss.pages), false
	}
	ss.pages = append(ss.pages, append([]ocr.Line(nil), lines...))
	ss.processing = false
	ss.completed = complete
	pages := make([][]ocr.Line, len(ss.pages))
	for i := range ss.pages {
		pages[i] = append([]ocr.Line(nil), ss.pages[i]...)
	}
	return pages, len(ss.pages), true
}

func (ss *Session) FailPage() {
	ss.mu.Lock()
	ss.processing = false
	ss.mu.Unlock()
}

func (ss *Session) PageCount() int {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	return len(ss.pages)
}
