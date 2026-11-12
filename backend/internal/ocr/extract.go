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
	reMy         = regexp.MustCompile(`(?i)(my\s*(no|number)|our\s*ref\w*|මගේ\s*අංකය|எனது\s*இல)[\s.:：]*([A-Z0-9/\-\.]+)`)
	reYour       = regexp.MustCompile(`(?i)(your\s*(no|number|ref\w*)|ඔබේ\s*අංකය|உமது\s*இல)[\s.:：]*([A-Z0-9/\-\.]+)`)
	reTest       = regexp.MustCompile(`TEST/[A-Z0-9/\-\.]+`)
	reDate       = regexp.MustCompile(`(?i)\b(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+\d{4})\b`)
	reDateScript = regexp.MustCompile(`(?:20\d{2}\s+[\p{Sinhala}\p{Tamil}\x{200c}\x{200d}]+\s+\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+[\p{Sinhala}\p{Tamil}\x{200c}\x{200d}]+[,]?\s+20\d{2})`)
	reSubj       = regexp.MustCompile(`(?i)^(subject|විෂය|பொருள்)[\s:：.\-]*(.*)$`)
	reFrom       = regexp.MustCompile(`(?i)^(from|යවන්නා|ලියන්නා|அனுப்புநர்)[\s:：.\-]*(.*)$`)
	reTo         = regexp.MustCompile(`(?i)^(to|ලබන්නා|වෙත|பெறுநர்)[\s:：.\-]*(.*)$`)
	reSigned     = regexp.MustCompile(`(?i)^(signed( by)?|අත්සන|கையொப்பம்)[\s:：.\-]*(.*)$`)

	reSalute = regexp.MustCompile(`(?i)^(dear\b|ஐயா|அன்பு|மதிப்பிற்குரிய|මහත්ම|ගරු)`)
	reClose  = regexp.MustCompile(`(?i)^(yours\s+(faithfully|sincerely)|இங்ஙனம்|இப்படிக்கு|මෙයට|ඔබගේ)`)
	reRef    = regexp.MustCompile(`(?i)(our\s*ref|my\s*no|your\s*ref|எனது\s*இல|මගේ)`)
	reStop   = regexp.MustCompile(`(?i)^(test letter|cc\b|copy\b|පිටපත|பிரதி)`)
	reNum    = regexp.MustCompile(`^\d+[.)]`)
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

// positional fills fields that have no label, using the letter layout.
func positional(lines []Line, r *Result) {
	dateI, salI, refI, closeI := -1, -1, -1, -1
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
	}
	if r.From.Value == "" && refI > 0 {
		v, c := joinLines(lines[:refI])
		set(&r.From, v, c)
	}
	if r.To.Value == "" && dateI >= 0 && salI > dateI+1 {
		v, c := joinLines(lines[dateI+1 : salI])
		set(&r.To, v, c)
	}
	if r.Subject.Value == "" && salI >= 0 && salI+1 < len(lines) {
		l := lines[salI+1]
		if len([]rune(l.Text)) < 120 && !reNum.MatchString(l.Text) {
			set(&r.Subject, l.Text, l.Conf)
		}
	}
	if r.SignedBy.Value == "" && closeI >= 0 && closeI+1 < len(lines) {
		v, c := tail(lines, closeI+1)
		set(&r.SignedBy, v, c)
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
	}
	if nums := reTest.FindAllString(text, 2); len(nums) > 0 { // fallback
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
