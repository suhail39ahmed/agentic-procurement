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
  return proxyToApi(`/api/disputes/${encodeURIComponent(id)}/accept`, {
    method: "POST",
    body: body || JSON.stringify({ approved: true }),
    timeoutMs: 60_000,
    demoRole: demoRoleFromRequest(request),
  });
}
