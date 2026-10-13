import { NextResponse } from "next/server";
import { getGoApiUrl } from "@/lib/goBackend";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Save confirmed OCR extraction results for a session.
 * Called by the frontend when the user clicks "Save details".
 * Proxies to Go which persists them in extraction_results (PostgreSQL).
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const goApiUrl = getGoApiUrl();
  try {
    const body = await req.text();
    const res = await fetch(
      `${goApiUrl}/api/session/${encodeURIComponent(params.id)}/result`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        cache: "no-store",
      },
    );

    if (res.status === 204) {
      return new NextResponse(null, { status: 204, headers: NO_STORE });
    }

    const json = await res.json().catch(() => ({ error: "error" }));
    return NextResponse.json(json, { status: res.status, headers: NO_STORE });
  } catch {
    // Best-effort — if the backend is down during save, don't block the user.
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }
}
