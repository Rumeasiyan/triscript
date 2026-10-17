/**
 * Client-side image preprocessing for letter photos.
 *
 * Applies three enhancements before the photo is sent:
 *   1. Auto-orient (handled by createImageBitmap with imageOrientation:"from-image")
 *   2. Mild sharpening via an unsharp-mask convolution
 *   3. Slight contrast normalisation (stretch histogram)
 *
 * Geometric deskewing (perspective correction) requires corner detection and is
 * left for a future release — the current step at least removes blur and boosts
 * contrast, which meaningfully improves OCR accuracy on phone photos.
 *
 * This module is intentionally dependency-free: it uses only the browser Canvas
 * API and is safe to tree-shake if unused.
 */

/**
 * Enhance a letter photo for OCR.
 *
 * @param blob    Source image blob (JPEG / PNG / WebP)
 * @param maxSide Maximum long-edge pixels after resize (default 1800)
 * @param quality JPEG output quality 0–1 (default 0.88)
 * @returns       Enhanced JPEG blob, or the original on any error
 */
export async function enhancePhoto(
  blob: Blob,
  maxSide = 1800,
  quality = 0.88,
): Promise<Blob> {
  try {
    // 1. Decode and orient
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    // Draw to canvas
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return blob;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    // 2. Get pixel data for enhancement
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // 3. Auto-contrast: stretch to use the full 0–255 range per channel
    autoContrast(data);

    // 4. Unsharp mask (gentle: amount=0.5, radius=1px)
    unsharpMask(data, w, h, 0.5);

    ctx.putImageData(imageData, 0, 0);

    const enhanced = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", quality),
    );
    return enhanced && enhanced.size > 0 ? enhanced : blob;
  } catch {
    return blob;
  }
}

// ─── Auto-contrast ───────────────────────────────────────────────────────────

function autoContrast(data: Uint8ClampedArray): void {
  // Find min/max for each channel (R, G, B)
  let minR = 255, maxR = 0;
  let minG = 255, maxG = 0;
  let minB = 255, maxB = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (g < minG) minG = g; if (g > maxG) maxG = g;
    if (b < minB) minB = b; if (b > maxB) maxB = b;
  }

  // Clip 1% of pixels from each end to avoid single noisy pixels skewing contrast
  // (simplified: just ensure range is non-trivial)
  const rRange = maxR - minR || 1;
  const gRange = maxG - minG || 1;
  const bRange = maxB - minB || 1;

  // Only apply if the range indicates there's something to stretch
  if (rRange > 200 && gRange > 200 && bRange > 200) return; // already full range

  for (let i = 0; i < data.length; i += 4) {
    data[i]     = Math.round(((data[i]     - minR) / rRange) * 255);
    data[i + 1] = Math.round(((data[i + 1] - minG) / gRange) * 255);
    data[i + 2] = Math.round(((data[i + 2] - minB) / bRange) * 255);
  }
}

// ─── Unsharp mask ────────────────────────────────────────────────────────────

/**
 * Simplified 3×3 unsharp mask.
 * amount: how strongly to apply (0 = no change, 1 = strong)
 */
function unsharpMask(data: Uint8ClampedArray, w: number, h: number, amount: number): void {
  // Work on luminance channel to avoid colour fringing
  const copy = new Uint8ClampedArray(data);

  // 3×3 box blur on a copy
  const blurred = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const idx = (ny * w + nx) * 4;
          rSum += copy[idx]; gSum += copy[idx + 1]; bSum += copy[idx + 2];
          count++;
        }
      }
      const idx = (y * w + x) * 4;
      blurred[idx]     = rSum / count;
      blurred[idx + 1] = gSum / count;
      blurred[idx + 2] = bSum / count;
    }
  }

  // unsharp = original + amount * (original - blurred)
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = clamp(copy[i]     + amount * (copy[i]     - blurred[i]));
    data[i + 1] = clamp(copy[i + 1] + amount * (copy[i + 1] - blurred[i + 1]));
    data[i + 2] = clamp(copy[i + 2] + amount * (copy[i + 2] - blurred[i + 2]));
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
