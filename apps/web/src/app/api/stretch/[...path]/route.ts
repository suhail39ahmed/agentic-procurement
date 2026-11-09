import { NextResponse } from "next/server";

function backendConfig() {
  const baseUrl = process.env.API_BASE_URL;
  const ownerKey = process.env.OWNER_API_KEY;
  if (!baseUrl || !ownerKey) return null;
  return { baseUrl, ownerKey };
}

async function proxy(request: Request, pathSegments: string[]) {
  const config = backendConfig();
  if (!config) {
    return NextResponse.json({ error: "Server configuration is missing" }, { status: 503 });
  }

  const suffix = pathSegments.map(encodeURIComponent).join("/");
  const url = new URL(`/api/stretch/${suffix}`, config.baseUrl);
  const incoming = new URL(request.url);
  url.search = incoming.search;

  const headers: Record<string, string> = { "x-owner-key": config.ownerKey };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const response = await fetch(url, init);
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[web] stretch proxy failed", err);
    return NextResponse.json({ error: "Upstream API unavailable" }, { status: 502 });
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function POST(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(request, path);
}
