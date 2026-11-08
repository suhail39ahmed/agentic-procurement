import { NextResponse } from "next/server";

function backendConfig() {
  const baseUrl = process.env.API_BASE_URL;
  const ownerKey = process.env.OWNER_API_KEY;
  if (!baseUrl || !ownerKey) {
    return null;
  }
  return { baseUrl, ownerKey };
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const config = backendConfig();
  if (!config) {
    return NextResponse.json({ error: "Server configuration is missing" }, { status: 503 });
  }

  const { id } = await context.params;

  try {
    const response = await fetch(
      new URL(`/api/negotiations/${encodeURIComponent(id)}/start`, config.baseUrl),
      {
        method: "POST",
        headers: { "x-owner-key": config.ownerKey },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[web] negotiations start proxy failed", err);
    return NextResponse.json({ error: "Upstream API unavailable" }, { status: 502 });
  }
}
