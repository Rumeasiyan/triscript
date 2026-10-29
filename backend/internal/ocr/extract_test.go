package ocr

import (
	"strings"
	"testing"
)

func TestFindDateSupportsSinhalaAndTamilMonthNames(t *testing.T) {
	tests := []struct {
		name string
		text string
		want string
	}{
		{
			name: "Sinhala year month day",
			text: "2026 ඔක්තෝබර් 08",
			want: "2026 ඔක්තෝබර් 08",
		},
		{
			name: "Tamil day month year",
			text: "06 அக்டோபர் 2026",
			want: "06 அக்டோபர் 2026",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := findDate(tt.text); got != tt.want {
				t.Fatalf("findDate(%q) = %q, want %q", tt.text, got, tt.want)
			}
		})
	}
}

func TestExtractTamilLetterFields(t *testing.T) {
	lines := []Line{
		{Text: "TEST LETTER, NOT VALID", Conf: 95},
		{Text: "TEST OFFICE", Conf: 94},
		{Text: "எனது இல: TEST/HLT/2026/077 உமது இல: TEST/DS/HLT/09", Conf: 92},
		{Text: "06 அக்டோபர் 2026", Conf: 96},
		{Text: "TEST RECIPIENT", Conf: 93},
		{Text: "ஐயா/அம்மணி,", Conf: 92},
		{Text: "TEST SUBJECT", Conf: 91},
		{Text: "TEST BODY", Conf: 90},
		{Text: "இங்ஙனம்,", Conf: 94},
		{Text: "TEST SIGNER", Conf: 93},
		{Text: "TEST ROLE", Conf: 92},
	}

	result := Extract(lines)
	tests := []struct {
		name string
		got  Field
		want string
	}{
		{name: "my number", got: result.MyNumber, want: "TEST/HLT/2026/077"},
		{name: "your number", got: result.YourNumber, want: "TEST/DS/HLT/09"},
		{name: "date", got: result.Date, want: "06 அக்டோபர் 2026"},
		{name: "from", got: result.From, want: "TEST OFFICE"},
		{name: "to", got: result.To, want: "TEST RECIPIENT"},
		{name: "subject", got: result.Subject, want: "TEST SUBJECT"},
		{name: "signed by", got: result.SignedBy, want: "TEST SIGNER, TEST ROLE"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got.Value != tt.want {
				t.Fatalf("value = %q, want %q", tt.got.Value, tt.want)
			}
			if tt.got.Conf < minConf {
				t.Fatalf("confidence = %.1f, want at least %.1f", tt.got.Conf, minConf)
			}
		})
	}

	if result.Body.Value == "" || result.Body.Conf == 0 {
		t.Fatal("body text and confidence must always be populated")
	}
	if result.Language.Value == "" || result.Language.Conf == 0 {
		t.Fatal("language and confidence must always be populated")
	}
}

func TestExtractPagesUsesFinalPageForSignature(t *testing.T) {
	first := []Line{
		{Text: "TEST LETTER, NOT VALID", Conf: 95},
		{Text: "TEST SUBJECT", Conf: 92},
		{Text: "TEST FIRST PAGE BODY", Conf: 91},
		{Text: "Yours faithfully,", Conf: 94},
		{Text: "TEST FIRST PAGE SIGNER", Conf: 93},
		{Text: "TEST FIRST PAGE ROLE", Conf: 92},
	}
	last := []Line{
		{Text: "TEST CONTINUED BODY", Conf: 90},
		{Text: "Yours faithfully,", Conf: 94},
		{Text: "TEST FINAL PAGE SIGNER", Conf: 93},
		{Text: "TEST FINAL PAGE ROLE", Conf: 92},
	}

	result := ExtractPages([][]Line{first, last})
	if result.SignedBy.Value != "TEST FINAL PAGE SIGNER, TEST FINAL PAGE ROLE" {
		t.Fatalf("signedBy = %q, want final-page signature", result.SignedBy.Value)
	}
	if !strings.Contains(result.Body.Value, "TEST FIRST PAGE BODY") ||
		!strings.Contains(result.Body.Value, "TEST CONTINUED BODY") {
		t.Fatalf("body does not include both pages: %q", result.Body.Value)
	}
	if result.Body.Conf == 0 || result.Language.Conf == 0 {
		t.Fatal("body and language confidence must be populated")
	}
}
