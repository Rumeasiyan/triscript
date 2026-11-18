import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const hopByHopHeaders = new Set([
  "connection",
  "expect",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

type RouteContext = { params: { path: string[] } };

async function proxy(request: NextRequest, { params }: RouteContext): Promise<Response> {
  const backend = process.env.TRISCRIPT_API_URL
    ?? process.env.NEXT_PUBLIC_API_URL
    ?? "http://localhost:8080";
  const backendPath = params.path[0] === "healthz"
    ? "healthz"
    : `api/${params.path.map(encodeURIComponent).join("/")}`;
  const target = new URL(`${backendPath}${request.nextUrl.search}`, `${backend}/`);
  const headers = new Headers();

  for (const [name, value] of request.headers) {
    if (!hopByHopHeaders.has(name.toLowerCase()) && name.toLowerCase() !== "host") {
      headers.set(name, value);
    }
  }
  headers.delete("origin");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : new Uint8Array(await request.arrayBuffer()),
      cache: "no-store",
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) {
      throw error;
    }
    console.error(`TRISCRIPT API proxy request failed (${request.method} ${target.pathname}):`, error);
    return Response.json(
      { error: "The local TRISCRIPT backend could not be reached." },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
  const responseHeaders = new Headers();

  for (const [name, value] of upstream.headers) {
    if (!hopByHopHeaders.has(name.toLowerCase())) {
      responseHeaders.set(name, value);
    }
  }
  responseHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
