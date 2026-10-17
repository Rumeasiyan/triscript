import { NextResponse } from "next/server";
import { getSession, addPhoto } from "@/lib/store";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

type Params = Promise<{ id: string }>;

/**
 * POST /api/session/[id]/photo
 *
 * Phone uploads a photo as the raw request body (image/jpeg, png or webp).
 * Each call adds one page. Up to 5 pages per session.
 * Returns 204 on success, or 409 if already at the page limit.
 */
export async function POST(req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  const data = Buffer.from(await req.arrayBuffer());
  const result = addPhoto(id, data, contentType);

  switch (result) {
    case "ok":
      return new NextResponse(null, { status: 204, headers: NO_STORE });
    case "gone":
      return NextResponse.json({ error: "gone" }, { status: 404, headers: NO_STORE });
    case "too-many-pages":
      return NextResponse.json({ error: "too-many-pages" }, { status: 409, headers: NO_STORE });
    case "too-large":
      return NextResponse.json({ error: "too-large" }, { status: 413, headers: NO_STORE });
    default:
      return NextResponse.json({ error: "bad-type" }, { status: 415, headers: NO_STORE });
  }
}

/**
 * GET /api/session/[id]/photo?page=1
 *
 * Computer fetches a specific page photo (1-based, default page 1).
 * Computer fetches all pages by calling with page=1,2,3… until 404.
 */
export async function GET(req: Request, { params }: { params: Params }) {
  const { id } = await params;
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const s = getSession(id);
  if (!s) return NextResponse.json({ error: "none" }, { status: 404, headers: NO_STORE });
  const photo = s.photos.find((p) => p.page === page);
  if (!photo) return NextResponse.json({ error: "none" }, { status: 404, headers: NO_STORE });
  return new NextResponse(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.contentType, ...NO_STORE },
  });
}
