import { proxyToApi } from "@/lib/api-proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyToApi(`/api/orders/${encodeURIComponent(id)}/ship`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body || JSON.stringify({ carrier: "UPS", number: "1Z999AA10123456784" }),
    timeoutMs: 30_000,
  });
}
