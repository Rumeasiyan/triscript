package session

import (
	"testing"
	"time"

	"github.com/Rumeasiyan/triscript/backend/internal/ocr"
)

func TestSessionPagesAreSerializedAndCompleteOnce(t *testing.T) {
	s := &Session{Expires: time.Now().Add(time.Minute), subs: make(map[chan Event]struct{})}
	if !s.BeginPage() {
		t.Fatal("first page should be accepted")
	}
	if s.BeginPage() {
		t.Fatal("parallel page upload should be rejected")
	}
	pages, count, ok := s.AddPage([]ocr.Line{{Text: "TEST PAGE ONE", Conf: 90}}, false)
	if !ok || count != 1 || len(pages) != 1 {
		t.Fatalf("AddPage() = (%d pages, count %d, ok %v)", len(pages), count, ok)
	}
	if !s.BeginPage() {
		t.Fatal("next page should be accepted")
	}
	_, count, ok = s.AddPage([]ocr.Line{{Text: "TEST PAGE TWO", Conf: 90}}, true)
	if !ok || count != 2 {
		t.Fatalf("final AddPage() = (count %d, ok %v)", count, ok)
	}
	if s.BeginPage() {
		t.Fatal("completed session must not accept further pages")
	}
}
