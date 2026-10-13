package ocr

import (
	"encoding/json"
	"io"
	"net/http"
)

const maxImageBytes = 6 * 1024 * 1024 // 6 MB

// Handler serves POST /api/read
// Accepts:  multipart form with "image" (file) and "uiLang" (string)
// Returns:  { "fields": { "subject": { "value":"...", "confidence": 0.9 }, ... } }
func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Verify Tesseract is available before doing any work.
	if _, err := tesseractPath(); err != nil {
		writeError(w, http.StatusServiceUnavailable,
			"Tesseract OCR is not installed on the server. "+
				"Install from https://github.com/UB-Mannheim/tesseract/wiki")
		return
	}

	if err := r.ParseMultipartForm(maxImageBytes + 512*1024); err != nil {
		writeError(w, http.StatusBadRequest, "cannot parse form: "+err.Error())
		return
	}

	uiLang := r.FormValue("uiLang")
	if uiLang == "" {
		uiLang = "en"
	}

	file, _, err := r.FormFile("image")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing image field")
		return
	}
	defer file.Close()

	imageData, err := io.ReadAll(io.LimitReader(file, maxImageBytes+1))
	if err != nil {
		writeError(w, http.StatusBadRequest, "cannot read image")
		return
	}
	if len(imageData) == 0 {
		writeError(w, http.StatusBadRequest, "empty image")
		return
	}
	if len(imageData) > maxImageBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "image too large (max 6 MB)")
		return
	}

	result, err := Extract(r.Context(), imageData, uiLang)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "OCR failed: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(result)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
