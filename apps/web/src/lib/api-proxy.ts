import { NextResponse } from "next/server";

export function backendConfig() {
  const baseUrl = process.env.API_BASE_URL;
  const ownerKey = process.env.OWNER_API_KEY;
  if (!baseUrl || !ownerKey) return null;
  return { baseUrl, ownerKey };
}

export async function proxyToApi(
  path: string,
  init: RequestInit & { timeoutMs?: number; demoRole?: "buyer" | "owner" | null } = {},
) {
  const config = backendConfig();
  if (!config) {
    return NextResponse.json({ error: "Server configuration is missing" }, { status: 503 });
  }

  const { demoRole, timeoutMs, ...fetchInit } = init;

  try {
    const response = await fetch(new URL(path, config.baseUrl), {
      ...fetchInit,
      headers: {
        "x-owner-key": config.ownerKey,
        ...(demoRole ? { "x-demo-role": demoRole } : {}),
        ...(fetchInit.body ? { "content-type": "application/json" } : {}),
        ...fetchInit.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs ?? 60_000),
    });
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (err) {
    console.error(`[web] proxy ${path} failed`, err);
    return NextResponse.json({ error: "Upstream API unavailable" }, { status: 502 });
  }
}
