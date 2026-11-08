function backendConfig() {
  const baseUrl = process.env.API_BASE_URL;
  const ownerKey = process.env.OWNER_API_KEY;
  if (!baseUrl || !ownerKey) return null;
  return { baseUrl, ownerKey };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const config = backendConfig();
  if (!config) {
    return new Response(JSON.stringify({ error: "Server configuration is missing" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const { id } = await context.params;

  try {
    const upstream = await fetch(
      new URL(`/api/negotiations/${encodeURIComponent(id)}/events`, config.baseUrl),
      {
        headers: {
          "x-owner-key": config.ownerKey,
          accept: "text/event-stream",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(120_000),
      },
    );

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return new Response(text || JSON.stringify({ error: "Upstream stream unavailable" }), {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("[web] negotiations events proxy failed", err);
    return new Response(JSON.stringify({ error: "Upstream API unavailable" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}
