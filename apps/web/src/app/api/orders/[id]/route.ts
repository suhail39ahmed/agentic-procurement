import { proxyToApi } from "@/lib/api-proxy";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyToApi(`/api/orders/${encodeURIComponent(id)}`, {
    method: "GET",
    timeoutMs: 15_000,
  });
}
