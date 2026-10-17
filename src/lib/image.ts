/**
 * Phone image utilities.
 *
 * preparePhoto  — resize + auto-contrast in ONE canvas pass (low memory).
 * shrinkImage   — resize only (kept for backwards compatibility).
 */

/**
 * Prepare a phone photo for upload:
 *   1. Decode and auto-orient
 *   2. Resize so the long edge ≤ maxSide
 *   3. Apply gentle auto-contrast in-place
 *   4. Encode as JPEG
 *
 * Everything happens in one canvas — no intermediate blobs, no copies.
 * Falls back to the original file on any error (OOM, unsupported format, etc.)
 */
export async function preparePhoto(
  file: Blob,
  maxSide = 1400,
  quality = 0.82,
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return file; }

    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close(); // release decoded pixels immediately

    // Auto-contrast in-place — single pixel pass, no extra buffers
    try {
      const id = ctx.getImageData(0, 0, w, h);
      if (autoContrast(id.data)) ctx.putImageData(id, 0, 0);
    } catch {
      // If getImageData fails (e.g. cross-origin taint), skip enhancement
    }

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", quality),
    );

    // Shrink the canvas to zero to free GPU/CPU memory before GC
    canvas.width = 0;
    canvas.height = 0;

    return blob && blob.size > 0 ? blob : file;
  } catch {
    // OOM or any decode error — send the original
    return file;
  }
}

/**
 * Resize only — kept for backwards compatibility.
 * Prefer preparePhoto for new code.
 */
export async function shrinkImage(
  file: Blob,
  maxSide = 1400,
  quality = 0.82,
): Promise<Blob> {
  return preparePhoto(file, maxSide, quality);
}

// ─── Auto-contrast ────────────────────────────────────────────────────────────

/**
 * Stretch the histogram so the darkest pixel → 0 and brightest → 255.
 * Returns true if it applied a change, false if the image was already full range.
 * Single pass, no allocations beyond the existing Uint8ClampedArray.
 */
function autoContrast(data: Uint8ClampedArray): boolean {
  let lo = 255, hi = 0;
  for (let i = 0; i < data.length; i += 4) {
    const g = data[i + 1]; // green channel as fast luminance proxy
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }

  const range = hi - lo;
  // Skip if range is tiny (uniform image) or already full (nothing to gain)
  if (range < 30 || range > 220) return false;

  const scale = 255 / range;
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = clamp((data[i]     - lo) * scale);
    data[i + 1] = clamp((data[i + 1] - lo) * scale);
    data[i + 2] = clamp((data[i + 2] - lo) * scale);
    // alpha [i+3] unchanged
  }
  return true;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
