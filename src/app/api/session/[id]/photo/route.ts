import { NextResponse } from "next/server";
import { getSession, setPhoto } from "@/lib/store";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** Phone uploads the photo as the raw request body (image/jpeg, png or webp). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  const data = Buffer.from(await req.arrayBuffer());
  const result = setPhoto(params.id, data, contentType);

  switch (result) {
    case "ok":
      return new NextResponse(null, { status: 204, headers: NO_STORE });
    case "gone":
      return NextResponse.json({ error: "gone" }, { status: 404, headers: NO_STORE });
    case "has-photo":
      return NextResponse.json({ error: "already-sent" }, { status: 409, headers: NO_STORE });
    case "too-large":
      return NextResponse.json({ error: "too-large" }, { status: 413, headers: NO_STORE });
    default:
      return NextResponse.json({ error: "bad-type" }, { status: 415, headers: NO_STORE });
  }
}

/** Computer fetches the photo to show it and to read it. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = getSession(params.id);
  if (!s?.photo) return NextResponse.json({ error: "none" }, { status: 404, headers: NO_STORE });
  return new NextResponse(new Uint8Array(s.photo.data), {
    headers: { "Content-Type": s.photo.contentType, ...NO_STORE },
  });
}
