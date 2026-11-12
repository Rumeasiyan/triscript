package ocr

import (
	"context"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestCheckQualityRejectsDarkBlurredAndCutOffImages(t *testing.T) {
	magick, err := exec.LookPath("magick")
	if err != nil {
		t.Skip("ImageMagick is not installed")
	}
	tests := []struct {
		name string
		args []string
		want error
	}{
		{name: "dark", args: []string{"-size", "400x500", "xc:black"}, want: QualityTooDark},
		{
			name: "blurred",
			args: []string{"-size", "400x500", "xc:gray"},
			want: QualityBlurred,
		},
		{
			name: "cut off",
			args: []string{"-size", "400x500", "xc:white", "-fill", "black", "-draw", "rectangle 0,0 400,3"},
			want: QualityCutOff,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "quality.png")
			if output, err := exec.Command(magick, append(tt.args, path)...).CombinedOutput(); err != nil {
				t.Fatalf("create test image: %v: %s", err, output)
			}
			if err := CheckQuality(context.Background(), path); err != tt.want {
				t.Fatalf("CheckQuality() = %v, want %v", err, tt.want)
			}
		})
	}
}
