import { NextResponse } from "next/server";

function backendConfig() {
  const baseUrl = process.env.API_BASE_URL;
  const ownerKey = process.env.OWNER_API_KEY;
  if (!baseUrl || !ownerKey) {
    return null;
  }
  return { baseUrl, ownerKey };
}

export async function GET() {
  const config = backendConfig();
  if (!config) {
    return NextResponse.json({ error: "Server configuration is missing" }, { status: 503 });
  }

  try {
    const response = await fetch(new URL("/api/negotiations", config.baseUrl), {
      headers: { "x-owner-key": config.ownerKey },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[web] negotiations list proxy failed", err);
    return NextResponse.json({ error: "Upstream API unavailable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const config = backendConfig();
  if (!config) {
    return NextResponse.json({ error: "Server configuration is missing" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const response = await fetch(new URL("/api/negotiations", config.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-owner-key": config.ownerKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[web] negotiations create proxy failed", err);
    return NextResponse.json(
      { error: "Upstream API unavailable — wait a few seconds for cold start, then Queue again." },
      { status: 502 },
    );
  }
}