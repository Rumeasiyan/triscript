import { NextResponse } from "next/server";
import { createSession } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Start a pairing session. Returns an unguessable id and when it expires. */
export async function POST() {
  const s = createSession();
  return NextResponse.json(
    { id: s.id, expiresAt: s.expiresAt },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
