import { proxyToApi } from "@/lib/api-proxy";
import { demoRoleFromRequest, requireOwnerDemoRole } from "@/lib/demo-role-gate";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const blocked = requireOwnerDemoRole(request);
  if (blocked) return blocked;
  const { id } = await context.params;
  const body = await request.text();
  return proxyToApi(`/api/negotiations/${encodeURIComponent(id)}/checkout/owner-decide`, {
    method: "POST",
    body: body || "{}",
    timeoutMs: 45_000,
    demoRole: demoRoleFromRequest(request),
  });
}
