import { NextResponse } from "next/server";
import { deleteSession, getSession } from "@/lib/store";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** Poll a session: has the phone sent a photo yet? */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = getSession(params.id);
  if (!s) return NextResponse.json({ error: "gone" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(
    { status: s.photo ? "photo" : "waiting", expiresAt: s.expiresAt },
    { headers: NO_STORE },
  );
}

/** Close a session and delete its photo (on save, cancel or leaving the page). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  deleteSession(params.id);
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
