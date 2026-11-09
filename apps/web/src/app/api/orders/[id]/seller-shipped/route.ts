import { proxyToApi } from "@/lib/api-proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyToApi(`/api/orders/${encodeURIComponent(id)}/seller-shipped`, {
    method: "POST",
    body: body || JSON.stringify({ source: "seller-agent" }),
    timeoutMs: 45_000,
  });
}
