// Package ocr wraps the free Tesseract engine with preprocessing.
package ocr

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"math"
	"os/exec"
	"strconv"
	"strings"
	"time"
	"unicode"
)

type Line struct {
	Text string
	Conf float64 // 0-100 average word confidence
}

type QualityError string

func (e QualityError) Error() string { return string(e) }

const (
	QualityTooDark QualityError = "too_dark"
	QualityBlurred QualityError = "blurred"
	QualityCutOff  QualityError = "cut_off"
)

// CheckQuality rejects images that are too dark, low contrast, blurred, or
// have text touching the image boundary (a likely cropped page).
func CheckQuality(ctx context.Context, img string) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	dimensions, err := magickMetrics(ctx, img, "-auto-orient", "-format", "%w %h", "info:")
	if err != nil {
		return fmt.Errorf("measure image dimensions: %w", err)
	}
	size := strings.Fields(dimensions)
	if len(size) != 2 {
		return fmt.Errorf("parse image dimensions: %q", dimensions)
	}
	width, widthErr := strconv.Atoi(size[0])
	height, heightErr := strconv.Atoi(size[1])
	if widthErr != nil || heightErr != nil {
		return fmt.Errorf("parse image dimensions: %q", dimensions)
	}
	if width < 300 || height < 300 {
		return QualityCutOff
	}

	metrics, err := magickMetrics(ctx, img,
		"-auto-orient", "-resize", "1200x1200", "-colorspace", "Gray",
		"-format", "%[fx:mean] %[fx:standard_deviation]", "info:")
	if err != nil {
		return fmt.Errorf("measure image brightness: %w", err)
	}
	values := strings.Fields(metrics)
	if len(values) != 2 {
		return fmt.Errorf("parse image brightness metrics: %q", metrics)
	}
	mean, err := strconv.ParseFloat(values[0], 64)
	if err != nil || math.IsNaN(mean) {
		return fmt.Errorf("parse image brightness: %q", values[0])
	}
	contrast, err := strconv.ParseFloat(values[1], 64)
	if err != nil || math.IsNaN(contrast) {
		return fmt.Errorf("parse image contrast: %q", values[1])
	}
	if mean < 0.15 {
		return QualityTooDark
	}
	if contrast < 0.025 {
		return QualityBlurred
	}
	if err := checkPageEdges(ctx, img); err != nil {
		return err
	}

	sharpness, err := magickMetrics(ctx, img, "-auto-orient", "-resize", "1200x1200",
		"-colorspace", "Gray", "-morphology", "Convolve", "Laplacian:0",
		"-format", "%[fx:standard_deviation]", "info:")
	if err != nil {
		return fmt.Errorf("measure image sharpness: %w", err)
	}
	value, err := strconv.ParseFloat(strings.TrimSpace(sharpness), 64)
	if err != nil || math.IsNaN(value) {
		return fmt.Errorf("parse image sharpness: %q", sharpness)
	}
	if value < 0.08 {
		return QualityBlurred
	}

	return nil
}

func magickMetrics(ctx context.Context, img string, args ...string) (string, error) {
	options := []string{
		"-limit", "memory", "256MiB",
		"-limit", "map", "512MiB",
		"-limit", "disk", "1GiB",
		"-limit", "area", "100MP",
		img,
	}
	cmd := exec.CommandContext(ctx, "magick", append(options, args...)...)
	var output, errOutput bytes.Buffer
	cmd.Stdout, cmd.Stderr = &output, &errOutput
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("magick: %w: %s", err, errOutput.String())
	}
	return output.String(), nil
}

func checkPageEdges(ctx context.Context, img string) error {
	geometry, err := magickMetrics(ctx, img, "-auto-orient", "-resize", "1200x1200",
		"-format", "%w %h", "info:")
	if err != nil {
		return fmt.Errorf("measure image dimensions: %w", err)
	}
	dimensions := strings.Fields(geometry)
	if len(dimensions) != 2 {
		return fmt.Errorf("parse image dimensions: %q", geometry)
	}
	width, err := strconv.Atoi(dimensions[0])
	if err != nil {
		return fmt.Errorf("parse image width: %q", dimensions[0])
	}
	height, err := strconv.Atoi(dimensions[1])
	if err != nil {
		return fmt.Errorf("parse image height: %q", dimensions[1])
	}
	if width < 100 || height < 100 {
		return QualityCutOff
	}
	stripX, stripY := max(1, width/100), max(1, height/100)
	edges := [][2]string{
		{fmt.Sprintf("%dx%d+0+0", width, stripY), fmt.Sprintf("%dx%d+0+%d", width, stripY, stripY)},
		{fmt.Sprintf("%dx%d+0+%d", width, stripY, height-stripY), fmt.Sprintf("%dx%d+0+%d", width, stripY, height-2*stripY)},
		{fmt.Sprintf("%dx%d+0+0", stripX, height), fmt.Sprintf("%dx%d+%d+0", stripX, height, stripX)},
		{fmt.Sprintf("%dx%d+%d+0", stripX, height, width-stripX), fmt.Sprintf("%dx%d+%d+0", stripX, height, width-2*stripX)},
	}
	for _, edge := range edges {
		densities := make([]float64, 2)
		for i, crop := range edge {
			ink, err := magickMetrics(ctx, img, "-auto-orient", "-resize", "1200x1200",
				"-colorspace", "Gray", "-crop", crop, "+repage", "-threshold", "55%",
				"-format", "%[fx:1-mean]", "info:")
			if err != nil {
				return fmt.Errorf("inspect page edges: %w", err)
			}
			density, err := strconv.ParseFloat(strings.TrimSpace(ink), 64)
			if err != nil || math.IsNaN(density) {
				return fmt.Errorf("parse page edge metric: %q", ink)
			}
			densities[i] = density
		}
		if densities[0] > 0.65 && densities[1] < 0.20 {
			return QualityCutOff
		}
	}
	return nil
}

// Preprocess: auto-rotate, deskew, grayscale, adaptive contrast, sharpen.
// Pipeline tuned for Sri Lankan government letters photographed with a phone.
func Preprocess(ctx context.Context, in, out string) error {
	args := []string{
		"-limit", "memory", "512MiB",
		"-limit", "map", "1GiB",
		"-limit", "disk", "2GiB",
		"-limit", "area", "200MP",
		in,
		"-auto-orient",
		"-resize", "4000x4000>",      // upscale only if smaller
		"-colorspace", "Gray",
		"-deskew", "40%",             // fix phone tilt up to ~20°
		"+repage",
		"-clahe", "10x10%+128+3",     // stronger local contrast — lifts text under stamps
		"-morphology", "Erode", "Disk:1", // thicken thin Tamil strokes slightly
		"-unsharp", "0x1.5+1.5+0.02",    // sharpen
		"-level", "10%,90%",          // clip extreme darks/lights — reduces stamp bleed
		"-density", "300",
		out,
	}
	return exec.CommandContext(ctx, "magick", args...).Run()
}

// Read runs Tesseract for one language set and returns lines with confidence.
func Read(ctx context.Context, img, langs string) ([]Line, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tesseract", img, "stdout",
		"-l", langs,
		"--oem", "1",   // LSTM engine
		"--psm", "6",   // assume uniform block of text (better for letters than column mode)
		"-c", "tessedit_create_tsv=1",
		"-c", "preserve_interword_spaces=1", // keep spacing — helps Tamil compound words
	)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("tesseract: %w: %s", err, errb.String())
	}
	log.Printf("tesseract %-8s out=%d bytes stderr=%q", langs, out.Len(), errb.String())

	type acc struct {
		words []string
		sum   float64
		n     int
	}
	var order []string
	m := map[string]*acc{}
	for i, row := range strings.Split(out.String(), "\n") {
		f := strings.Split(strings.TrimRight(row, "\r"), "\t")
		if i == 0 || len(f) < 12 {
			continue
		}
		txt := strings.TrimSpace(f[11])
		conf, _ := strconv.ParseFloat(f[10], 64)
		if txt == "" || conf < 0 {
			continue
		}
		key := f[2] + "." + f[3] + "." + f[4]
		a, ok := m[key]
		if !ok {
			a = &acc{}
			m[key] = a
			order = append(order, key)
		}
		a.words = append(a.words, txt)
		a.sum += conf
		a.n++
	}
	lines := make([]Line, 0, len(order))
	for _, k := range order {
		a := m[k]
		// Drop lines whose average word confidence is too low — mostly noise.
		lineConf := a.sum / float64(a.n)
		if lineConf < 20 {
			continue
		}
		// Filter out individual words that are clearly junk:
		// single non-Tamil/non-alpha chars, or strings made entirely of
		// punctuation/pipes/brackets.
		clean := make([]string, 0, len(a.words))
		for _, w := range a.words {
			if isJunkWord(w) {
				continue
			}
			clean = append(clean, w)
		}
		if len(clean) == 0 {
			continue
		}
		lines = append(lines, Line{Text: strings.Join(clean, " "), Conf: lineConf})
	}
	return lines, nil
}

// isJunkWord returns true for OCR artefacts that should be dropped:
// lone pipe/bracket chars, single non-letter tokens, strings with no
// useful letter content.
func isJunkWord(w string) bool {
	runes := []rune(strings.TrimSpace(w))
	if len(runes) == 0 {
		return true
	}
	// Single-char: keep only letters and digits
	if len(runes) == 1 {
		r := runes[0]
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}
	// Pure punctuation / pipe / bracket sequences
	useful := 0
	for _, r := range runes {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			useful++
		}
	}
	return useful == 0
}

// ReadBest runs eng, sin+eng and tam+eng in parallel and keeps the best result.
func ReadBest(ctx context.Context, img string) ([]Line, string, error) {
	cands := []string{"eng", "sin+eng", "tam+eng"}
	type res struct {
		lines []Line
		lang  string
		score float64
		err   error
	}
	ch := make(chan res, len(cands))
	for _, l := range cands {
		go func(l string) {
			lines, err := Read(ctx, img, l)
			s := 0.0
			for _, ln := range lines {
				s += ln.Conf * float64(len([]rune(ln.Text)))
			}
			ch <- res{lines, l, s, err}
		}(l)
	}
	var best res
	found := false
	for range cands {
		r := <-ch
		log.Printf("ocr pass %-8s lines=%d score=%.0f err=%v", r.lang, len(r.lines), r.score, r.err)
		if r.err == nil && (!found || r.score > best.score) {
			best, found = r, true
		}
	}
	if !found {
		return nil, "", fmt.Errorf("ocr failed")
	}
	return best.lines, best.lang, nil
}

// CreateThumbnail produces a small JPEG thumbnail (max 400×566 px) from src.
// Used by the page-image viewer to avoid serving multi-megabyte PNGs for previews.
func CreateThumbnail(ctx context.Context, src, dest string) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	args := []string{
		"-limit", "memory", "128MiB",
		"-limit", "map", "256MiB",
		src, "-auto-orient", "-thumbnail", "400x566>", "-quality", "80", dest,
	}
	cmd := exec.CommandContext(ctx, "magick", args...)
	var errb bytes.Buffer
	cmd.Stderr = &errb
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("magick thumbnail: %w: %s", err, errb.String())
	}
	return nil
}
