// Package ocr extracts text from letter photos using Tesseract OCR and maps
// the raw text into the nine TRISCRIPT field values.
//
// Tesseract must be installed:
//   - Windows: https://github.com/UB-Mannheim/tesseract/wiki
//     (winget install UB-Mannheim.TesseractOCR)
//
// Optional language packs (copy .traineddata files to tessdata/):
//   - sin.traineddata — Sinhala
//   - tam.traineddata — Tamil
//   Download from: https://github.com/tesseract-ocr/tessdata
//
// Optional environment variables (set in backend/.env):
//   TESSERACT_PATH    — full path to tesseract.exe if not in PATH
//   TESSDATA_PREFIX   — path to tessdata/ directory if non-standard
package ocr

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// FieldResult mirrors the JSON the frontend expects.
type FieldResult struct {
	Value      string  `json:"value"`
	Confidence float64 `json:"confidence"`
}

// Fields is the complete set of fields returned to the frontend.
type Fields struct {
	Subject    FieldResult `json:"subject"`
	MyNumber   FieldResult `json:"myNumber"`
	YourNumber FieldResult `json:"yourNumber"`
	Date       FieldResult `json:"date"`
	From       FieldResult `json:"from"`
	To         FieldResult `json:"to"`
	SignedBy   FieldResult `json:"signedBy"`
	Language   FieldResult `json:"language"`
	Body       FieldResult `json:"body"`
}

// ReadResult is the JSON body returned to the Next.js reader adapter.
type ReadResult struct {
	Fields Fields `json:"fields"`
}

// Extract runs Tesseract on imageData and returns structured fields.
// imageData is raw JPEG/PNG/WebP bytes.
// uiLang is the UI language hint ("en", "si", "ta").
func Extract(ctx context.Context, imageData []byte, uiLang string) (*ReadResult, error) {
	// Verify Tesseract is available before doing any work.
	if _, err := tesseractPath(); err != nil {
		return nil, fmt.Errorf("OCR not available: %w", err)
	}

	rawText, err := runTesseract(ctx, imageData, uiLang)
	if err != nil {
		return nil, fmt.Errorf("Tesseract OCR failed: %w", err)
	}

	fields := extractFields(rawText, uiLang)
	return &ReadResult{Fields: fields}, nil
}

// ── Field extraction ──────────────────────────────────────────────────────

func extractFields(text, uiLang string) Fields {
	lines := splitLines(text)
	return Fields{
		Subject:    findSubject(lines),
		MyNumber:   findMyNumber(lines),
		YourNumber: findYourNumber(lines),
		Date:       findDate(lines),
		From:       findFrom(lines),
		To:         findTo(lines),
		SignedBy:   findSignedBy(lines),
		Language:   detectLanguage(text, uiLang),
		Body:       findBody(lines, text),
	}
}

func splitLines(text string) []string {
	raw := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	out := make([]string, 0, len(raw))
	for _, l := range raw {
		t := strings.TrimSpace(l)
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

func labelPattern(patterns ...string) *regexp.Regexp {
	escaped := make([]string, len(patterns))
	for i, p := range patterns {
		escaped[i] = regexp.QuoteMeta(p)
	}
	return regexp.MustCompile(`(?i)^\s*(` + strings.Join(escaped, "|") + `)\s*[:\-]?\s*(.*)$`)
}

func valueAfterLabel(lines []string, re *regexp.Regexp) (string, float64) {
	for i, l := range lines {
		m := re.FindStringSubmatch(l)
		if m == nil {
			continue
		}
		val := strings.TrimSpace(m[len(m)-1])
		if val != "" {
			return val, 0.88
		}
		if i+1 < len(lines) {
			return strings.TrimSpace(lines[i+1]), 0.80
		}
	}
	return "", 0
}

var subjectRe = labelPattern(
	"Subject", "Re", "Sub", "subject", "re:", "sub:",
	"සාරාංශය", "විෂය", "ශීර්ෂය", "விஷயம்")

func findSubject(lines []string) FieldResult {
	v, c := valueAfterLabel(lines, subjectRe)
	return fieldResult(v, c)
}

var myNumberRe = labelPattern(
	"My No", "My Number", "Our Ref", "Our No", "Ref No",
	"My Ref", "No.", "Reg No", "File No", "File Number",
	"මගේ අංකය", "என் எண்")

func findMyNumber(lines []string) FieldResult {
	v, c := valueAfterLabel(lines, myNumberRe)
	if v == "" {
		v, c = findRefPattern(lines, true)
	}
	return fieldResult(v, c)
}

var yourNumberRe = labelPattern(
	"Your No", "Your Number", "Your Ref", "Your Ref No", "Their Ref",
	"ඔබේ අංකය", "உங்கள் எண்")

func findYourNumber(lines []string) FieldResult {
	v, c := valueAfterLabel(lines, yourNumberRe)
	if v == "" {
		v, c = findRefPattern(lines, false)
	}
	return fieldResult(v, c)
}

var refRe = regexp.MustCompile(`(?i)\b([A-Z]{2,}[/\\][A-Z0-9]{1,}[/\\][0-9]{4}[/\\][0-9]+)\b`)

func findRefPattern(lines []string, first bool) (string, float64) {
	var results []string
	for _, l := range lines {
		matches := refRe.FindAllString(l, -1)
		results = append(results, matches...)
	}
	if len(results) == 0 {
		return "", 0
	}
	if first {
		return results[0], 0.75
	}
	if len(results) > 1 {
		return results[1], 0.72
	}
	return "", 0
}

var dateRe = regexp.MustCompile(
	`(?i)\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|` +
		`\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|` +
		`(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b`)

var dateLabelRe = labelPattern("Date", "Dated", "දිනය", "தேதி")

func findDate(lines []string) FieldResult {
	v, c := valueAfterLabel(lines, dateLabelRe)
	if v != "" {
		if m := dateRe.FindString(v); m != "" {
			return fieldResult(m, c)
		}
		return fieldResult(v, c)
	}
	for _, l := range lines {
		if m := dateRe.FindString(l); m != "" {
			return fieldResult(m, 0.78)
		}
	}
	return fieldResult("", 0)
}

var fromLabelRe = labelPattern(
	"From", "Sender", "From:", "Issued by",
	"එවූ අය", "அனுப்புநர்")

func findFrom(lines []string) FieldResult {
	v, c := valueAfterLabel(lines, fromLabelRe)
	if v != "" {
		return fieldResult(v, c)
	}
	titleRe := regexp.MustCompile(`(?i)\b(Director|Secretary|Manager|Officer|Coordinator|Head|Chief|Principal|Commissioner|Superintendent)\b`)
	end := len(lines)
	if end > 8 {
		end = 8
	}
	for _, l := range lines[:end] {
		if titleRe.MatchString(l) {
			return fieldResult(l, 0.65)
		}
	}
	return fieldResult("", 0)
}

var toLabelRe = labelPattern("To", "Addressed to", "To:", "ලබන්නා", "பெறுநர்")

func findTo(lines []string) FieldResult {
	v, c := valueAfterLabel(lines, toLabelRe)
	return fieldResult(v, c)
}

var signedByRe = labelPattern(
	"Signed", "Signature", "Sign", "Approved by", "Authorised by",
	"අත්සන් කළේ", "கையொப்பமிட்டவர்")

func findSignedBy(lines []string) FieldResult {
	v, c := valueAfterLabel(lines, signedByRe)
	if v != "" {
		return fieldResult(v, c)
	}
	titleRe := regexp.MustCompile(`(?i)\b(Director|Secretary|Manager|Officer|Coordinator|Head|Chief|Principal)\b`)
	start := len(lines) - 8
	if start < 0 {
		start = 0
	}
	for i := len(lines) - 1; i >= start; i-- {
		if titleRe.MatchString(lines[i]) {
			if i > 0 && looksLikeName(lines[i-1]) {
				return fieldResult(lines[i-1]+", "+lines[i], 0.62)
			}
			return fieldResult(lines[i], 0.60)
		}
	}
	return fieldResult("", 0)
}

func looksLikeName(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) < 2 || len(s) > 60 {
		return false
	}
	runes := []rune(s)
	return unicode.IsUpper(runes[0]) && !strings.ContainsAny(s, "0123456789:/\\")
}

func detectLanguage(text, uiLang string) FieldResult {
	var sinhala, tamil, latin int
	for _, r := range text {
		switch {
		case r >= 0x0D80 && r <= 0x0DFF:
			sinhala++
		case r >= 0x0B80 && r <= 0x0BFF:
			tamil++
		case (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z'):
			latin++
		}
	}
	total := sinhala + tamil + latin
	if total == 0 {
		return fieldResult(uiLang, 0.50)
	}
	si := float64(sinhala) / float64(total)
	ta := float64(tamil) / float64(total)
	const threshold = 0.15
	switch {
	case si > threshold && ta > threshold:
		return fieldResult("mixed", 0.85)
	case si > threshold:
		return fieldResult("si", 0.92)
	case ta > threshold:
		return fieldResult("ta", 0.92)
	default:
		return fieldResult("en", 0.88)
	}
}

var bodyLabelRe = regexp.MustCompile(
	`(?i)^\s*(Subject|Re|Sub|Date|From|To|My No|Your No|Ref|Sign|Dear|Sir|Madam|` +
		`සාරාංශය|විෂය|දිනය|அனுப்புநர்|பெறுநர்|விஷயம்)`)

func findBody(lines []string, fullText string) FieldResult {
	var bodyLines []string
	headerDone := false
	for _, l := range lines {
		if !headerDone {
			if regexp.MustCompile(`(?i)^(Dear|Sir|Madam|Respected|To Whom)`).MatchString(l) {
				headerDone = true
			}
			continue
		}
		if bodyLabelRe.MatchString(l) {
			continue
		}
		bodyLines = append(bodyLines, l)
	}
	if len(bodyLines) == 0 {
		return fieldResult(strings.TrimSpace(fullText), 0.70)
	}
	trimTo := len(bodyLines)
	for trimTo > 0 {
		last := bodyLines[trimTo-1]
		if looksLikeName(last) ||
			regexp.MustCompile(`(?i)(Yours|Faithfully|Sincerely|Regards|Signed|Thank)`).MatchString(last) {
			trimTo--
		} else {
			break
		}
	}
	if trimTo == 0 {
		trimTo = len(bodyLines)
	}
	body := strings.Join(bodyLines[:trimTo], "\n")
	conf := 0.82
	if len(bodyLines) < 3 {
		conf = 0.65
	}
	return fieldResult(strings.TrimSpace(body), conf)
}

func fieldResult(value string, confidence float64) FieldResult {
	value = strings.TrimSpace(value)
	value = strings.Trim(value, ":;,. \t")
	return FieldResult{Value: value, Confidence: confidence}
}
