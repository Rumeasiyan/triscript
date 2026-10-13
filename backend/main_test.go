package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"triscript-backend/handlers"
)

func TestMainRouterHealth(t *testing.T) {
	store := handlers.NewStore(10 * time.Second)
	router := handlers.NewRouter(store)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
