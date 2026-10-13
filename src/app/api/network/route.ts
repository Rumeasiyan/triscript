import { NextResponse } from "next/server";
import { getLocalLanIp, getReachableBaseUrl } from "@/lib/network";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const lanIp = getLocalLanIp();
  const reachableBaseUrl = getReachableBaseUrl(req);

  return NextResponse.json(
    {
      lanIp,
      reachableBaseUrl,
      publicUrlConfigured: Boolean(process.env.NEXT_PUBLIC_PUBLIC_URL),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
