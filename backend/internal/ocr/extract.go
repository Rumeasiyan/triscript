package ocr

import (
	"regexp"
	"strings"
	"unicode"
)

type Field struct {
	Value string  `json:"value"`
	Conf  float64 `json:"confidence"` // 0-100
}

type Result struct {
	Subject    Field `json:"subject"`
	MyNumber   Field `json:"myNumber"`
	YourNumber Field `json:"yourNumber"`
	Date       Field `json:"date"`
	From       Field `json:"from"`
	To         Field `json:"to"`
	SignedBy   Field `json:"signedBy"`
	Language   Field `json:"language"`
	Body       Field `json:"body"`
}

const minConf = 55.0 // below this, leave empty rather than guess

var (
	// Reference numbers — inline or next-line. Allow & (AP&H), lowercase mix.
	// The greedy middle `[\s.::\w]*?` skips OCR noise between label and ref token.
	reMy   = regexp.MustCompile(`(?i)(my\s*(no|number|ref\w*)|our\s*ref\w*|மேற்கோள்|எனது\s*இல|මගේ\s*අංකය)[\s.::]*([A-Z0-9][A-Z0-9/\-.&]{3,})`)
	reYour = regexp.MustCompile(`(?i)(your\s*(no|number|ref\w*)|உங்கள்\s*இல|ඔබේ\s*අංකය)[\s.::]*([A-Z0-9][A-Z0-9/\-.&]{3,})`)
	reTest = regexp.MustCompile(`TEST/[A-Z0-9/\-.]+`)

	// Standalone slash-heavy reference token on its own line, e.g. EPPC/AM/A/AP&H/03/2026/AQ/34
	reRefToken = regexp.MustCompile(`^[A-Z]{2,}[A-Z0-9/\-.&]{5,}$`)

	// Date patterns.
	reDate       = regexp.MustCompile(`(?i)\b(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{4})\b`)
	reDateScript = regexp.MustCompile(`(?:20\d{2}\s+[\p{Sinhala}\p{Tamil}\x{200c}\x{200d}]+\s+\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+[\p{Sinhala}\p{Tamil}\x{200c}\x{200d}]+[,]?\s+20\d{2})`)

	// Field label lines — value on same or next line.
	reSubj   = regexp.MustCompile(`(?i)^(subject|sub|re\b|re:|විෂය|பொருள்)[\s::.\\-]*(.*)$`)
	reFrom   = regexp.MustCompile(`(?i)^(from|sender|යවන්නා|ලියන්නා|அனுப்புநர்)[\s::.\\-]*(.*)$`)
	reTo     = regexp.MustCompile(`(?i)^(to|recipient|ලබන්නා|වෙත|பெறுநர்)[\s::.\\-]*(.*)$`)
	reSigned = regexp.MustCompile(`(?i)^(signed(\s*by)?|signature|අත්සන|கையொப்பம்)[\s::.\\-]*(.*)$`)

	// Addressee title patterns — English.
	reAddressee = regexp.MustCompile(`(?i)^(the\s+)?(secretary|director|commissioner|deputy|additional|chief\s+secretary|provincial\s+director|minister|auditor|accountant)\b`)

	// Tamil/Sinhala official title keywords for addressee detection.
	reTamilAddressee = regexp.MustCompile(`(அத்தியட்சகர்|பணிப்பாளர்|செயலாளர்|ஆணையர்|கணக்காய்வு\s+அத்தி|தலைமை|மாவட்ட|பிரதம|නිලධාරී|අධ්‍යක්ෂ|ලේකම්)`)

	// Salutation / closing.
	reSalute = regexp.MustCompile(`(?i)^(dear\b|sir\b|madam\b|ஐயா|அன்பு|மதிப்பிற்குரிய|மதிப்புமிக்க|මහත්ම|ගරු)`)
	reClose  = regexp.MustCompile(`(?i)^(yours\s+(faithfully|sincerely|truly)|i\s+would\s+be\s+grateful|accordingly[,\s]|இங்ஙனம்|இப்படிக்கு|மேலும்\s*,|மேற்கண்டவாறு|மேற்படி\s+விடயம்|மேலதிக|මෙයට|ඔබගේ)`)

	// Tamil subject clue words — sentence ending in "தொடர்பாக", "பற்றி" etc.
	reTamilSubjSuffix = regexp.MustCompile(`(தொடர்பாக|தொடர்பில்|பற்றி|குறித்து|வழங்காமை|வழங்குதல்)\s*$`)

	// Standalone "My No." / "Your No." label (value on next line).
	reMyNoLabel   = regexp.MustCompile(`(?i)^(my\s*no|our\s*ref|எனது\s*இல|மேற்கோள்|මගේ)[\s.::]*$`)
	reYourNoLabel = regexp.MustCompile(`(?i)^(your\s*no|your\s*ref|உங்கள்\s*இல|ඔබේ)[\s.::]*$`)

	// "Request for …" / Tamil heading as subject.
	reRequestSubj = regexp.MustCompile(`(?i)^(request\s+for|re\s*:|regarding|subject\s*:|sub\s*:|reference\s*:|அறிக்கை|கோரிக்கை|விஷயம்)`)

	reRef  = regexp.MustCompile(`(?i)(our\s*ref|my\s*no|your\s*ref|எனது\s*இல|මගේ)`)
	reStop = regexp.MustCompile(`(?i)^(test letter|cc\b|copy\b|copies|පිටපත|பிரதிகள்|பிரதி|ce\s*:|c\.c\.)`)
	reNum  = regexp.MustCompile(`^\d+[.)]`)
)

func findDate(t string) string {
	if m := reDate.FindString(t); m != "" {
		return m
	}
	return reDateScript.FindString(t)
}

// DetectLanguage counts Unicode scripts: Sinhala 0D80-0DFF, Tamil 0B80-0BFF.
func DetectLanguage(s string) string {
	var si, ta, en int
	for _, r := range s {
		switch {
		case r >= 0x0D80 && r <= 0x0DFF:
			si++
		case r >= 0x0B80 && r <= 0x0BFF:
			ta++
		case unicode.Is(unicode.Latin, r):
			en++
		}
	}
	tot := float64(si + ta + en)
	if tot == 0 {
		return ""
	}
	var parts []string
	if float64(si)/tot > .15 {
		parts = append(parts, "Sinhala")
	}
	if float64(ta)/tot > .15 {
		parts = append(parts, "Tamil")
	}
	if float64(en)/tot > .15 {
		parts = append(parts, "English")
	}
	if len(parts) == 0 {
		return ""
	}
	if len(parts) > 1 {
		return "Mixed (" + strings.Join(parts, " + ") + ")"
	}
	return parts[0]
}

func set(f *Field, v string, c float64) {
	v = strings.TrimSpace(v)
	if v == "" || c < minConf {
		return
	}
	f.Value, f.Conf = v, c
}

// joinLines joins lines with ", ", skips junk and the TEST banner, averages confidence.
func joinLines(ls []Line) (string, float64) {
	var p []string
	sum, n := 0.0, 0
	for _, l := range ls {
		t := strings.TrimRight(strings.TrimSpace(l.Text), ",.;:")
		if len([]rune(t)) < 3 || strings.HasPrefix(strings.ToUpper(t), "TEST LETTER") {
			continue
		}
		p = append(p, t)
		sum += l.Conf
		n++
	}
	if n == 0 {
		return "", 0
	}
	return strings.Join(p, ", "), sum / float64(n)
}

// tail takes up to 3 lines after the closing; if 3, the first is the signature line.
func tail(lines []Line, from int) (string, float64) {
	var got []Line
	for _, l := range lines[from:] {
		t := strings.TrimSpace(l.Text)
		if t == "" {
			continue
		}
		if reStop.MatchString(t) || len(got) == 3 {
			break
		}
		got = append(got, l)
	}
	if len(got) == 3 {
		got = got[1:]
	}
	return joinLines(got)
}

// positional fills fields that have no label, using letter layout heuristics.
func positional(lines []Line, r *Result) {
	dateI, salI, refI, closeI, subjI := -1, -1, -1, -1, -1

	for i, l := range lines {
		t := strings.TrimSpace(l.Text)
		if refI < 0 && reRef.MatchString(t) {
			refI = i
		}
		if dateI < 0 && findDate(t) != "" {
			dateI = i
		}
		if salI < 0 && reSalute.MatchString(t) {
			salI = i
		}
		if closeI < 0 && reClose.MatchString(t) {
			closeI = i
		}
		// Tamil subject: a line ending with தொடர்பாக / பற்றி etc.
		if subjI < 0 && r.Subject.Value == "" && reTamilSubjSuffix.MatchString(t) && len([]rune(t)) > 8 {
			subjI = i
		}
	}

	// From: everything before the first reference label.
	if r.From.Value == "" && refI > 0 {
		v, c := joinLines(lines[:refI])
		set(&r.From, v, c)
	}

	// To: lines between date and subject/salutation, or first Tamil/English title line.
	if r.To.Value == "" {
		anchor := salI
		if subjI >= 0 && (anchor < 0 || subjI < anchor) {
			anchor = subjI
		}
		if anchor > 0 && dateI >= 0 && anchor > dateI+1 {
			// Pick lines that look like a name/title, not date noise.
			var candidates []Line
			for _, l := range lines[dateI+1 : anchor] {
				t := strings.TrimSpace(l.Text)
				if findDate(t) != "" || len([]rune(t)) < 3 {
					continue
				}
				candidates = append(candidates, l)
			}
			v, c := joinLines(candidates)
			set(&r.To, v, c)
		}
		// Fallback: first line matching an English or Tamil addressee title.
		if r.To.Value == "" {
			for _, l := range lines {
				t := strings.TrimSpace(l.Text)
				if reAddressee.MatchString(t) || reTamilAddressee.MatchString(t) {
					set(&r.To, t, l.Conf)
					break
				}
			}
		}
	}

	// Subject: Tamil sentence ending with தொடர்பாக etc.
	if r.Subject.Value == "" && subjI >= 0 {
		set(&r.Subject, strings.TrimSpace(lines[subjI].Text), lines[subjI].Conf)
	}
	// Subject fallback: line after salutation.
	if r.Subject.Value == "" && salI >= 0 && salI+1 < len(lines) {
		l := lines[salI+1]
		if len([]rune(l.Text)) < 180 && !reNum.MatchString(l.Text) {
			set(&r.Subject, strings.TrimSpace(l.Text), l.Conf)
		}
	}

	// SignedBy: lines after close marker.
	if r.SignedBy.Value == "" && closeI >= 0 && closeI+1 < len(lines) {
		v, c := tail(lines, closeI+1)
		set(&r.SignedBy, v, c)
	}
}

// Extract maps OCR lines to letter fields using label keywords + positional heuristics.
func Extract(lines []Line) Result {
	var r Result
	var full []string
	avg := 0.0
	for _, l := range lines {
		full = append(full, l.Text)
		avg += l.Conf
	}
	if len(lines) > 0 {
		avg /= float64(len(lines))
	}
	text := strings.Join(full, "\n")

	for i, l := range lines {
		t := strings.TrimSpace(l.Text)

		// val: return inline value, or scan next 2 lines if blank.
		val := func(v string) (string, float64) {
			v = strings.TrimSpace(v)
			if v == "" {
				for j := i + 1; j < len(lines) && j <= i+2; j++ {
					nxt := strings.TrimSpace(lines[j].Text)
					if nxt != "" {
						return nxt, lines[j].Conf
					}
				}
			}
			return v, l.Conf
		}

		// ── Standalone label lines (value on next line) ───────────────────────

		// "My No." label alone → next line is the ref number.
		if reMyNoLabel.MatchString(t) && r.MyNumber.Value == "" {
			if i+1 < len(lines) {
				nxt := strings.TrimSpace(lines[i+1].Text)
				if len(nxt) >= 3 && findDate(nxt) == "" {
					set(&r.MyNumber, nxt, lines[i+1].Conf)
				}
			}
			continue
		}
		// "Your No." label alone → next line.
		if reYourNoLabel.MatchString(t) && r.YourNumber.Value == "" {
			if i+1 < len(lines) {
				nxt := strings.TrimSpace(lines[i+1].Text)
				if len(nxt) >= 3 && findDate(nxt) == "" {
					set(&r.YourNumber, nxt, lines[i+1].Conf)
				}
			}
			continue
		}

		// Standalone slash-heavy reference line (no label) → YourNumber if MyNumber taken.
		if reRefToken.MatchString(t) {
			if r.MyNumber.Value == "" {
				set(&r.MyNumber, t, l.Conf)
			} else if r.YourNumber.Value == "" {
				set(&r.YourNumber, t, l.Conf)
			}
			continue
		}

		// ── Labelled fields ───────────────────────────────────────────────────

		if m := reSubj.FindStringSubmatch(t); m != nil && r.Subject.Value == "" {
			v, c := val(m[2])
			set(&r.Subject, v, c)
		} else if m := reFrom.FindStringSubmatch(t); m != nil && r.From.Value == "" {
			v, c := val(m[2])
			set(&r.From, v, c)
		} else if m := reTo.FindStringSubmatch(t); m != nil && r.To.Value == "" {
			v, c := val(m[2])
			set(&r.To, v, c)
		} else if m := reSigned.FindStringSubmatch(t); m != nil && r.SignedBy.Value == "" {
			v, c := val(m[3])
			set(&r.SignedBy, v, c)
		}

		// Inline reference numbers (label + value on same line).
		if m := reMy.FindStringSubmatch(t); m != nil && r.MyNumber.Value == "" {
			if len(m[3]) >= 3 {
				set(&r.MyNumber, m[3], l.Conf)
			}
		}
		if m := reYour.FindStringSubmatch(t); m != nil && r.YourNumber.Value == "" {
			if len(m[3]) >= 3 {
				set(&r.YourNumber, m[3], l.Conf)
			}
		}
		if r.Date.Value == "" {
			if m := findDate(t); m != "" {
				set(&r.Date, m, l.Conf)
			}
		}

		// English "Request for …" heading as subject fallback.
		if r.Subject.Value == "" && reRequestSubj.MatchString(t) && len([]rune(t)) > 10 {
			set(&r.Subject, t, l.Conf)
		}
	}

	if nums := reTest.FindAllString(text, 2); len(nums) > 0 {
		if r.MyNumber.Value == "" {
			set(&r.MyNumber, nums[0], avg)
		}
		if len(nums) > 1 && r.YourNumber.Value == "" {
			set(&r.YourNumber, nums[1], avg)
		}
	}

	positional(lines, &r)
	r.Language = Field{DetectLanguage(text), avg}
	r.Body = Field{text, avg}
	return r
}

// ExtractPages uses the first page for letter headers, all pages for the body,
// and only the final page for the signature.
func ExtractPages(pages [][]Line) Result {
	if len(pages) == 0 {
		return Result{}
	}
	result := Extract(pages[0])
	if len(pages) > 1 {
		result.SignedBy = Extract(pages[len(pages)-1]).SignedBy
	}
	var body []string
	var sum float64
	var count int
	for _, page := range pages {
		for _, line := range page {
			body = append(body, line.Text)
			sum += line.Conf
			count++
		}
	}
	confidence := 0.0
	if count > 0 {
		confidence = sum / float64(count)
	}
	text := strings.Join(body, "\n")
	result.Body = Field{Value: text, Conf: confidence}
	result.Language = Field{Value: DetectLanguage(text), Conf: confidence}
	return result
}
