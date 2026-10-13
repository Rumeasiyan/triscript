import { NextResponse } from "next/server";
import { getGoApiUrl } from "@/lib/goBackend";
import { getReachableBaseUrl } from "@/lib/network";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/** Start a pairing session by delegating to the authoritative Go backend. */
export async function POST(req: Request) {
  const goApiUrl = getGoApiUrl();
  try {
    const res = await fetch(`${goApiUrl}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: "backend-error", message: errorText },
        { status: res.status, headers: NO_STORE },
      );
    }

    const data = (await res.json()) as { id: string; expiresAt: number };
    const reachableBase = getReachableBaseUrl(req);

    return NextResponse.json(
      {
        id: data.id,
        expiresAt: data.expiresAt,
        ...(reachableBase ? { reachableBaseUrl: reachableBase } : {}),
      },
      { status: 201, headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      {
        error: "backend-unavailable",
        message: `TRISCRIPT Go backend is not reachable at ${goApiUrl}`,
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
