import { NextResponse } from "next/server";
import { getGoApiUrl } from "@/lib/goBackend";

export const dynamic = "force-dynamic";

/**
 * Proxy the OCR read request from the browser to the Go backend.
 * The browser POSTs multipart form data here (same origin = no CORS),
 * and this server-side route forwards it to Go which calls Google Cloud Vision.
 *
 * The Next.js reader adapter (src/lib/reader.ts) uses:
 *   NEXT_PUBLIC_TRISCRIPT_READER_URL = /api/read   (same-origin, works on phone too)
 */
export async function POST(req: Request) {
  const goApiUrl = getGoApiUrl();

  try {
    // Forward the raw multipart body unchanged — do not re-parse it.
    const contentType = req.headers.get("content-type") ?? "";
    const body = await req.arrayBuffer();

    const res = await fetch(`${goApiUrl}/api/read`, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
      // No cache — every OCR request must hit the backend.
    });

    const responseBody = await res.arrayBuffer();

    return new NextResponse(responseBody, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "backend-unavailable",
        message: `Go backend unreachable at ${goApiUrl}. Is it running with GOOGLE_CLOUD_VISION_API_KEY set?`,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
