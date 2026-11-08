import { NextResponse } from "next/server";

export function backendConfig() {
  const baseUrl = process.env.API_BASE_URL;
  const ownerKey = process.env.OWNER_API_KEY;
  if (!baseUrl || !ownerKey) return null;
  return { baseUrl, ownerKey };
}

export async function proxyToApi(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
) {
  const config = backendConfig();
  if (!config) {
    return NextResponse.json({ error: "Server configuration is missing" }, { status: 503 });
  }

  const { timeoutMs = 30_000, headers, ...rest } = init;
  try {
    const response = await fetch(new URL(path, config.baseUrl), {
      ...rest,
      headers: {
        "x-owner-key": config.ownerKey,
        ...(headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error("[web] api proxy failed", path, err);
    return NextResponse.json({ error: "Upstream API unavailable" }, { status: 502 });
  }
}
