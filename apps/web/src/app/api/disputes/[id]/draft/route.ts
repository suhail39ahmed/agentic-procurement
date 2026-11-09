import { proxyToApi } from "@/lib/api-proxy";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyToApi(`/api/disputes/${encodeURIComponent(id)}/draft`, {
    method: "POST",
    body: "{}",
    timeoutMs: 90_000,
  });
}
