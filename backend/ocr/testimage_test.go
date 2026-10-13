package ocr_test

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
)

// generateTestPNG creates a white 400x120 PNG image.
// Tesseract will read it (mostly blank — but the point is it runs without crashing).
// For a real text extraction test, use an actual scanned letter photo.
func generateTestPNG() []byte {
	img := image.NewRGBA(image.Rect(0, 0, 400, 120))
	draw.Draw(img, img.Bounds(), &image.Uniform{color.White}, image.Point{}, draw.Src)

	// Draw some black pixels forming rough "text" patterns
	// (enough for Tesseract to process without error, not for accurate OCR)
	black := color.Black
	for x := 10; x < 200; x += 3 {
		img.Set(x, 20, black)
		img.Set(x, 40, black)
		img.Set(x, 60, black)
	}

	var buf bytes.Buffer
	_ = png.Encode(&buf, img)
	return buf.Bytes()
}
