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

// Preprocess: auto-rotate, grayscale, normalize, sharpen.
func Preprocess(ctx context.Context, in, out string) error {
	args := []string{
		"-limit", "memory", "256MiB",
		"-limit", "map", "512MiB",
		"-limit", "disk", "1GiB",
		"-limit", "area", "100MP",
		in, "-auto-orient", "-resize", "3000x3000", "-colorspace", "Gray",
		"-normalize", "-sharpen", "0x1", "-density", "300", out}
	return exec.CommandContext(ctx, "magick", args...).Run()
}

// Read runs Tesseract for one language set and returns lines with confidence.
func Read(ctx context.Context, img, langs string) ([]Line, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "tesseract", img, "stdout",
		"-l", langs, "--oem", "1", "--psm", "4", "-c", "tessedit_create_tsv=1")
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
		lines = append(lines, Line{Text: strings.Join(a.words, " "), Conf: a.sum / float64(a.n)})
	}
	return lines, nil
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
