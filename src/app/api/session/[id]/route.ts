import { NextResponse } from "next/server";
import { deleteSession, getSession } from "@/lib/store";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

type Params = Promise<{ id: string }>;

/**
 * GET /api/session/[id]
 *
 * Poll a session: has the phone sent a photo yet?
 * Returns status "waiting" until at least one photo is present,
 * then "photo" plus the number of pages received.
 */
export async function GET(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const s = getSession(id);
  if (!s) return NextResponse.json({ error: "gone" }, { status: 404, headers: NO_STORE });
  const photoCount = s.photos.length;
  return NextResponse.json(
    {
      status: photoCount > 0 ? "photo" : "waiting",
      photoCount,
      expiresAt: s.expiresAt,
    },
    { headers: NO_STORE },
  );
}

/** Close a session and delete its photos (on save, cancel or leaving the page). */
export async function DELETE(_req: Request, { params }: { params: Params }) {
  const { id } = await params;
  deleteSession(id);
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
