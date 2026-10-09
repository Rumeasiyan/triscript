/**
 * Shrink a phone photo before sending, so it uploads quickly on weak connections.
 * Keeps the long side at `maxSide` pixels and re-encodes as JPEG.
 * Falls back to the original file if the browser cannot decode or encode it.
 */
export async function shrinkImage(
  file: Blob,
  maxSide = 1800,
  quality = 0.85,
): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    return blob && blob.size > 0 ? blob : file;
  } catch {
    return file;
  }
}
