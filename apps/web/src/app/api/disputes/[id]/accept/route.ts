import { proxyToApi } from "@/lib/api-proxy";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyToApi(`/api/disputes/${encodeURIComponent(id)}/accept`, {
    method: "POST",
    body: body || JSON.stringify({ approved: true }),
    timeoutMs: 60_000,
  });
}
