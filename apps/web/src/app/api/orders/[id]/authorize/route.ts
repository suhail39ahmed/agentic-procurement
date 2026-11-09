import { proxyToApi } from "@/lib/api-proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyToApi(`/api/orders/${encodeURIComponent(id)}/authorize`, {
    method: "POST",
    body: body || "{}",
    timeoutMs: 45_000,
  });
}
