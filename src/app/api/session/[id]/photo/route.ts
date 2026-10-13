import { NextResponse } from "next/server";
import { getGoApiUrl } from "@/lib/goBackend";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** Phone uploads the photo as raw request body (image/jpeg, png or webp). Proxies to Go backend. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const goApiUrl = getGoApiUrl();
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim();
  const data = await req.arrayBuffer();

  try {
    const res = await fetch(`${goApiUrl}/api/session/${encodeURIComponent(params.id)}/photo`, {
      method: "POST",
      headers: {
        "Content-Type": contentType || "image/jpeg",
      },
      body: data,
      cache: "no-store",
    });

    if (res.status === 204) {
      return new NextResponse(null, { status: 204, headers: NO_STORE });
    }

    const json = await res.json().catch(() => ({ error: "error" }));
    return NextResponse.json(json, { status: res.status, headers: NO_STORE });
  } catch {
    return NextResponse.json(
      {
        error: "backend-unavailable",
        message: `TRISCRIPT Go backend unreachable at ${goApiUrl}`,
      },
      { status: 503, headers: NO_STORE },
    );
  }
}

/** Computer fetches the photo to show it and to read it. Proxies to Go backend. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const goApiUrl = getGoApiUrl();
  try {
    const res = await fetch(`${goApiUrl}/api/session/${encodeURIComponent(params.id)}/photo`, {
      cache: "no-store",
    });

    if (res.status === 404) {
      return NextResponse.json({ error: "none" }, { status: 404, headers: NO_STORE });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: "backend-error" },
        { status: res.status, headers: NO_STORE },
      );
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...NO_STORE,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "backend-unavailable",
        message: `TRISCRIPT Go backend unreachable at ${goApiUrl}`,
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
