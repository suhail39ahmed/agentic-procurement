import { proxyToApi } from "@/lib/api-proxy";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyToApi(`/api/negotiations/${encodeURIComponent(id)}/checkout`, {
    method: "POST",
    timeoutMs: 45_000,
  });
}
