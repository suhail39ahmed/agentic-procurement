import { proxyToApi } from "@/lib/api-proxy";
import { demoRoleFromRequest } from "@/lib/demo-role-gate";

/** Buyer or Supervisor may confirm delivery & capture. Dispute accept is Seller-only. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyToApi(`/api/orders/${encodeURIComponent(id)}/confirm-delivery`, {
    method: "POST",
    timeoutMs: 45_000,
    demoRole: demoRoleFromRequest(request),
  });
}
