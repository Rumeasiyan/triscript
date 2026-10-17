/**
 * Phone image utilities.
 *
 * preparePhoto — tries to resize + auto-contrast in one canvas pass.
 * On low-memory phones the canvas decode itself can fail (OOM).
 * In that case we fall back to sending the original file unchanged —
 * the server can handle large JPEGs fine, and modern OCR models work
 * well on full-resolution photos.
 */

/**
 * Prepare a phone photo for upload.
 * Returns a smaller, contrast-enhanced JPEG when the device has enough
 * memory, or the original file untouched when it does not.
 */
export async function preparePhoto(file: Blob): Promise<Blob> {
  // If the file is already small enough, skip canvas work entirely
  if (file.size < 800_000) return file; // < 800 KB — send as-is

  try {
    return await resizeAndEnhance(file, 1200, 0.80);
  } catch {
    // Canvas OOM or decode failure — send the original
    return file;
  }
}

/** Backwards-compatible alias */
export async function shrinkImage(file: Blob): Promise<Blob> {
  return preparePhoto(file);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function resizeAndEnhance(
  file: Blob,
  maxSide: number,
  quality: number,
): Promise<Blob> {
  // Use OffscreenCanvas when available — it doesn't block the main thread
  // and is slightly less likely to hit the browser's OOM killer.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(w, h);
    ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | null;
  } else {
    canvas = document.createElement("canvas");
    (canvas as HTMLCanvasElement).width = w;
    (canvas as HTMLCanvasElement).height = h;
    ctx = (canvas as HTMLCanvasElement).getContext("2d");
  }

  if (!ctx) { bitmap.close(); return file; }

  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close(); // free decoded pixels immediately

  // Gentle auto-contrast — single pass, no extra buffers
  try {
    const id = ctx.getImageData(0, 0, w, h);
    if (autoContrast(id.data)) ctx.putImageData(id, 0, 0);
  } catch {
    // getImageData can fail on some browsers — skip enhancement, keep resize
  }

  // Encode
  let blob: Blob | null = null;
  if (canvas instanceof OffscreenCanvas) {
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  } else {
    blob = await new Promise<Blob | null>((res) =>
      (canvas as HTMLCanvasElement).toBlob(res, "image/jpeg", quality),
    );
    // Free canvas memory
    (canvas as HTMLCanvasElement).width = 0;
    (canvas as HTMLCanvasElement).height = 0;
  }

  return blob && blob.size > 0 ? blob : file;
}

function autoContrast(data: Uint8ClampedArray): boolean {
  let lo = 255, hi = 0;
  for (let i = 0; i < data.length; i += 4) {
    const g = data[i + 1];
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const range = hi - lo;
  if (range < 30 || range > 220) return false;
  const scale = 255 / range;
  for (let i = 0; i < data.length; i += 4) {
    data[i]     = clamp((data[i]     - lo) * scale);
    data[i + 1] = clamp((data[i + 1] - lo) * scale);
    data[i + 2] = clamp((data[i + 2] - lo) * scale);
  }
  return true;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}
