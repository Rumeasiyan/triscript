import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/store";
import { checkRateLimit, sweepRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/** Start a pairing session. Returns an unguessable id and when it expires. */
export async function POST(req: NextRequest) {
  // Best-effort IP extraction (works on Vercel, Nginx proxy, plain Node)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  sweepRateLimit();

  if (!checkRateLimit(ip, 20, 60_000)) {
    return NextResponse.json(
      { error: "too-many-requests" },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
    );
  }

  const s = createSession();
  return NextResponse.json(
    { id: s.id, expiresAt: s.expiresAt },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
