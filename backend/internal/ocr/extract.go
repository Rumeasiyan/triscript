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
	reMy  = regexp.MustCompile(`(?i)(my\s*(no|number)|our\s*ref\w*|මගේ\s*අංකය|எனது\s*இல)[\s.:：]*([A-Z0-9/\-\.]+)`)
	reYour = regexp.MustCompile(`(?i)(your\s*(no|number|ref\w*)|ඔබේ\s*අංකය|உமது\s*இல)[\s.:：]*([A-Z0-9/\-\.]+)`)

	// standalone reference on its own line: EP/AP&H/ACC/AQ/2025
	reStandaloneRef = regexp.MustCompile(`\b([A-Z]{2,}/[A-Z0-9&/\-\.]{4,})\b`)

	reTest       = regexp.MustCompile(`TEST/[A-Z0-9/\-\.]+`)
	reDate       = regexp.MustCompile(`(?i)\b(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{4})\b`)
	reDateScript = regexp.MustCompile(`(?:20\d{2}\s+[\p{Sinhala}\p{Tamil}\x{200c}\x{200d}]+\s+\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+[\p{Sinhala}\p{Tamil}\x{200c}\x{200d}]+[,]?\s+20\d{2})`)

	// date label alone on its own line: "திகதி", "Date", "දිනය" — value is on the next line
	reDateLabel = regexp.MustCompile(`(?i)^(திகதி\.?|date\.?|දිනය\.?)[\s.:：]*$`)

	reSubj   = regexp.MustCompile(`(?i)^(subject|විෂය|பொருள்)[\s:：.\-]*(.*)$`)
	reFrom   = regexp.MustCompile(`(?i)^(from|යවන්නා|ලියන්නා|அனுப்புநர்)[\s:：.\-]*(.*)$`)
	reTo     = regexp.MustCompile(`(?i)^(to|ලබන්නා|වෙත|பெறுநர்)[\s:：.\-]*(.*)$`)
	reSigned = regexp.MustCompile(`(?i)^(signed( by)?|අත්සන|கையொப்பம்)[\s:：.\-]*(.*)$`)

	reSalute = regexp.MustCompile(`(?i)^(dear\b|ஐயா|அன்பு|மதிப்பிற்குரிய|මහත්ම|ගරු)`)
	reClose  = regexp.MustCompile(`(?i)^(yours\s+(faithfully|sincerely)|இங்ஙனம்|இப்படிக்கு|නන්றி|வணக்கம்|தங்கள்|මෙයට|ඔබගේ)`)
	reRef    = regexp.MustCompile(`(?i)(our\s*ref|my\s*no|your\s*ref|எனது\s*இல|මගේ)`)
	reStop   = regexp.MustCompile(`(?i)^(test letter|cc\b|copy\b|පිටපත|பிரதி)`)
	reNum    = regexp.MustCompile(`^\d+[.)]`)

	// outgoing ref even with spaces: "EPPC/ AM /A /AP&H/ AM/ 03/ 2026/ AQ /34"
	reOutRef = regexp.MustCompile(`^[A-Z]{2,}/[\sA-Z0-9/\-\.&]+`)
	reFooter = regexp.MustCompile(`(?i)(director|accountant|fax:|email:|tel:|phone:|general\s*no|@gmail|@gov)`)

	// Dr./Mr. prefix at bottom of letter — signer name
	reDrPrefix = regexp.MustCompile(`(?i)^(dr\.?\s|mr\.?\s|ms\.?\s|mrs\.?\s|prof\.?\s)[A-Z]`)
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
		return // never guess
	}
	f.Value, f.Conf = v, c
}

// isNoiseLine returns true when a line is mostly non-useful characters
// (OCR artefacts like "வதிலிைலை8", "Ay ci.", "wl 712 றற)", "| |").
func isNoiseLine(t string) bool {
	runes := []rune(t)
	total := len(runes)
	if total == 0 {
		return true
	}
	// Lines that are only pipes, dashes, underscores, brackets — border lines
	onlyBorder := true
	for _, r := range runes {
		if r != '|' && r != '-' && r != '_' && r != '[' && r != ']' &&
			r != '(' && r != ')' && r != '{' && r != '}' && r != '/' &&
			r != '\\' && r != ' ' && r != '\t' {
			onlyBorder = false
			break
		}
	}
	if onlyBorder {
		return true
	}
	useful := 0
	for _, r := range runes {
		switch {
		case r >= 0x0B80 && r <= 0x0BFF: // Tamil
			useful += 2 // weight Tamil higher
		case r >= 0x0D80 && r <= 0x0DFF: // Sinhala
			useful += 2
		case unicode.IsLetter(r):
			useful++
		case unicode.IsDigit(r):
			useful++
		}
	}
	return float64(useful)/float64(total) < 0.4
}

// joinLines joins lines with ", ", skips junk and the TEST banner, averages confidence.
func joinLines(ls []Line) (string, float64) {
	var p []string
	sum, n := 0.0, 0
	for _, l := range ls {
		t := strings.TrimRight(strings.TrimSpace(l.Text), ",.;:|")
		t = strings.TrimSpace(t)
		if len([]rune(t)) < 3 || strings.HasPrefix(strings.ToUpper(t), "TEST LETTER") {
			continue
		}
		// Skip noise lines regardless of confidence
		if isNoiseLine(t) {
			continue
		}
		// Skip low-confidence lines
		if l.Conf < 45 {
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

// positional fills fields that have no label, using the letter layout.
func positional(lines []Line, r *Result) {
	dateI, salI, refI, closeI, outRefI := -1, -1, -1, -1, -1

	for i, l := range lines {
		t := strings.TrimSpace(l.Text)

		if refI < 0 && reRef.MatchString(t) {
			refI = i
		}
		// date label on its own line — the value is on the next line
		if dateI < 0 && reDateLabel.MatchString(t) && i+1 < len(lines) {
			next := strings.TrimSpace(lines[i+1].Text)
			if findDate(next) != "" {
				dateI = i + 1
			}
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
		// outgoing reference: e.g. EPPC/ AM /A /AP&H/ AM/ 03/ 2026/ AQ /34
		if outRefI < 0 && i > 0 && reOutRef.MatchString(t) {
			outRefI = i
		}
	}

	// From: lines before the incoming ref/My No line (the sender letterhead block).
	if r.From.Value == "" && refI > 0 {
		v, c := joinLines(lines[:refI])
		set(&r.From, v, c)
	}

	// To: lines between the date line and the salutation OR the outgoing reference.
	// Tamil government letters skip the salutation, so fall back to outRefI as upper bound.
	toEnd := salI
	if toEnd < 0 || (outRefI > dateI && (toEnd < 0 || outRefI < toEnd)) {
		toEnd = outRefI
	}
	if r.To.Value == "" && dateI >= 0 && toEnd > dateI+1 {
		v, c := joinLines(lines[dateI+1 : toEnd])
		set(&r.To, v, c)
	}

	// Subject: line after salutation (classic), or line before outgoing ref (Tamil gov).
	if r.Subject.Value == "" && salI >= 0 && salI+1 < len(lines) {
		l := lines[salI+1]
		if len([]rune(l.Text)) < 120 && !reNum.MatchString(l.Text) {
			set(&r.Subject, l.Text, l.Conf)
		}
	}
	if r.Subject.Value == "" && outRefI > 0 {
		for k := outRefI - 1; k >= 0; k-- {
			t := strings.TrimSpace(lines[k].Text)
			if t == "" || isNoiseLine(t) {
				continue
			}
			if len([]rune(t)) < 120 && !reNum.MatchString(t) && !reRef.MatchString(t) &&
				findDate(t) == "" && !reFooter.MatchString(t) && !reDateLabel.MatchString(t) {
				set(&r.Subject, t, lines[k].Conf)
			}
			break
		}
	}

	// Closing block: scan upward from bottom for a short comma/period-terminated line —
	// that is the closing title (மாகாணப்பணிப்பாளர்,).
	// Also look for Dr./Mr. prefix name lines.
	closingTitleI := -1
	mid := len(lines) / 2
	for i := len(lines) - 1; i > mid; i-- {
		t := strings.TrimSpace(lines[i].Text)
		if reStop.MatchString(t) || reFooter.MatchString(t) {
			continue
		}
		endsBlock := strings.HasSuffix(t, ",") || strings.HasSuffix(t, ".")
		shortLine := len([]rune(t)) < 60
		if endsBlock && shortLine {
			closingTitleI = i
			break
		}
	}

	// Dr./Mr. signer name scan: look for a Dr. line in the lower half
	drLineI := -1
	for i := len(lines) - 1; i > mid; i-- {
		t := strings.TrimSpace(lines[i].Text)
		if reDrPrefix.MatchString(t) {
			drLineI = i
			break
		}
	}

	if r.SignedBy.Value == "" && closeI >= 0 && closeI+1 < len(lines) {
		v, c := tail(lines, closeI+1)
		set(&r.SignedBy, v, c)
	}
	// Tamil gov style: use Dr. line if found, otherwise closing title block.
	if r.SignedBy.Value == "" {
		if drLineI >= 0 {
			// Dr.Name + next line (role/title)
			end := drLineI + 2
			if end > len(lines) {
				end = len(lines)
			}
			v, c := joinLines(lines[drLineI:end])
			set(&r.SignedBy, v, c)
		} else if closingTitleI >= 0 {
			set(&r.SignedBy, strings.TrimSpace(lines[closingTitleI].Text), lines[closingTitleI].Conf)
		}
	}
	if r.From.Value == "" && closingTitleI >= 0 {
		end := closingTitleI + 3
		if end > len(lines) {
			end = len(lines)
		}
		v, c := joinLines(lines[closingTitleI:end])
		set(&r.From, v, c)
	}
}

// Extract maps OCR lines to letter fields using label keywords + patterns.
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
		t := l.Text
		val := func(v string) (string, float64) { // value may sit on the next line
			if v == "" && i+1 < len(lines) {
				return lines[i+1].Text, lines[i+1].Conf
			}
			return v, l.Conf
		}
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
		if m := reMy.FindStringSubmatch(t); m != nil && r.MyNumber.Value == "" {
			set(&r.MyNumber, m[3], l.Conf)
		}
		if m := reYour.FindStringSubmatch(t); m != nil && r.YourNumber.Value == "" {
			set(&r.YourNumber, m[3], l.Conf)
		}
		if r.Date.Value == "" {
			if m := findDate(t); m != "" {
				set(&r.Date, m, l.Conf)
			}
		}
		// date label on its own line — grab value from next line
		if r.Date.Value == "" && reDateLabel.MatchString(strings.TrimSpace(t)) && i+1 < len(lines) {
			next := strings.TrimSpace(lines[i+1].Text)
			if m := findDate(next); m != "" {
				set(&r.Date, m, lines[i+1].Conf)
			}
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

	// Standalone ref fallback: header region line with a ref number but no "My No" label
	// e.g. "EP/AP&H/ACC/AQ/2025 திகதி 026.11.09" or just "EP/AP&H/ACC/AQ/2025"
	if r.MyNumber.Value == "" {
		for i, l := range lines {
			if i > len(lines)/3 {
				break
			}
			t := strings.TrimSpace(l.Text)
			if m := reStandaloneRef.FindStringSubmatch(t); m != nil {
				if strings.Count(m[1], "/") <= 4 {
					set(&r.MyNumber, m[1], l.Conf)
					break
				}
			}
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
