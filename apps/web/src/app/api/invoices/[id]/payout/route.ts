import { proxyToApi } from "@/lib/api-proxy";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await request.text();
  return proxyToApi(`/api/invoices/${encodeURIComponent(id)}/payout`, {
    method: "POST",
    body,
    timeoutMs: 90_000,
  });
}
