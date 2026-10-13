package ocr

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// TesseractPath returns the path to the tesseract binary (exported for tests).
func TesseractPath() (string, error) {
	return tesseractPath()
}
// Checks TESSERACT_PATH env var first, then common install locations.
func tesseractPath() (string, error) {
	if p := os.Getenv("TESSERACT_PATH"); p != "" {
		return p, nil
	}
	// Try PATH first
	if p, err := exec.LookPath("tesseract"); err == nil {
		return p, nil
	}
	// Windows default install location
	if runtime.GOOS == "windows" {
		candidates := []string{
			`C:\Program Files\Tesseract-OCR\tesseract.exe`,
			`C:\Program Files (x86)\Tesseract-OCR\tesseract.exe`,
		}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				return c, nil
			}
		}
	}
	return "", fmt.Errorf(
		"tesseract binary not found. Install from https://github.com/UB-Mannheim/tesseract/wiki " +
			"or set TESSERACT_PATH in backend/.env")
}

// availableLangs returns which of the requested language codes are actually
// installed in the tessdata directory, falling back to "eng" if none are found.
func availableLangs(tessPath string, wanted []string) string {
	tessdata := filepath.Join(filepath.Dir(tessPath), "tessdata")
	if d := os.Getenv("TESSDATA_PREFIX"); d != "" {
		tessdata = d
	}
	var available []string
	for _, lang := range wanted {
		traineddata := filepath.Join(tessdata, lang+".traineddata")
		if _, err := os.Stat(traineddata); err == nil {
			available = append(available, lang)
		}
	}
	if len(available) == 0 {
		return "eng"
	}
	return strings.Join(available, "+")
}

// runTesseract calls the tesseract binary on imageData and returns the
// extracted text. imageData must be JPEG, PNG, or WebP bytes.
func runTesseract(ctx context.Context, imageData []byte, uiLang string) (string, error) {
	tessPath, err := tesseractPath()
	if err != nil {
		return "", err
	}

	// Choose language packs based on uiLang hint.
	// Always include English — letters often have mixed-language headers.
	wantedLangs := []string{"eng"}
	switch uiLang {
	case "si":
		wantedLangs = []string{"sin", "eng"}
	case "ta":
		wantedLangs = []string{"tam", "eng"}
	default:
		wantedLangs = []string{"eng"}
	}
	langStr := availableLangs(tessPath, wantedLangs)

	// Write image to a temp file — tesseract reads from disk.
	tmpDir := os.TempDir()
	imgFile := filepath.Join(tmpDir, fmt.Sprintf("triscript_ocr_%d.jpg", pid()))
	defer os.Remove(imgFile)

	if err := os.WriteFile(imgFile, imageData, 0600); err != nil {
		return "", fmt.Errorf("tesseract: write temp image: %w", err)
	}

	// Output goes to stdout when we use "-" as the output base.
	// --psm 3 = fully automatic page segmentation (default, good for letters).
	// --oem 3 = use best available OCR engine (LSTM + legacy).
	cmd := exec.CommandContext(ctx, tessPath,
		imgFile, "stdout",
		"--psm", "3",
		"--oem", "3",
		"-l", langStr,
	)

	out, err := cmd.Output()
	if err != nil {
		// Return partial output if any — tesseract sometimes exits non-zero but
		// still produces useful text.
		if len(out) > 0 {
			return strings.TrimSpace(string(out)), nil
		}
		return "", fmt.Errorf("tesseract: run failed (%w)", err)
	}
	return strings.TrimSpace(string(out)), nil
}

func pid() int {
	return os.Getpid()
}
