import { proxyToApi } from "@/lib/api-proxy";
import { demoRoleFromRequest, requireOwnerDemoRole } from "@/lib/demo-role-gate";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const blocked = requireOwnerDemoRole(request);
  if (blocked) return blocked;
  const { id } = await context.params;
  return proxyToApi(`/api/orders/${encodeURIComponent(id)}/confirm-delivery`, {
    method: "POST",
    timeoutMs: 45_000,
    demoRole: demoRoleFromRequest(request),
  });
}
