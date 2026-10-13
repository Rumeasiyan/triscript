import { NextResponse } from "next/server";
import { getGoApiUrl } from "@/lib/goBackend";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** Poll a session: has the phone sent a photo yet? Proxies to Go backend. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const goApiUrl = getGoApiUrl();
  try {
    const res = await fetch(`${goApiUrl}/api/session/${encodeURIComponent(params.id)}`, {
      cache: "no-store",
    });

    if (res.status === 404) {
      return NextResponse.json({ error: "gone" }, { status: 404, headers: NO_STORE });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: "backend-error" },
        { status: res.status, headers: NO_STORE },
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200, headers: NO_STORE });
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

/** Close a session and delete its photo (on save, cancel or leaving the page). Proxies to Go backend. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const goApiUrl = getGoApiUrl();
  try {
    const res = await fetch(`${goApiUrl}/api/session/${encodeURIComponent(params.id)}`, {
      method: "DELETE",
      cache: "no-store",
    });

    return new NextResponse(null, {
      status: res.status === 204 ? 204 : res.status,
      headers: NO_STORE,
    });
  } catch {
    // Allow graceful best-effort teardown even if backend is shutting down
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }
}
