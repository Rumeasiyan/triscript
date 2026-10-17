import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Simple health check endpoint for load-balancers and uptime monitors. */
export async function GET() {
  return NextResponse.json(
    { status: "ok", ts: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
