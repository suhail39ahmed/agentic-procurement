import { proxyToApi } from "@/lib/api-proxy";
import { demoRoleFromRequest } from "@/lib/demo-role-gate";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyToApi(`/api/disputes/${encodeURIComponent(id)}/draft`, {
    method: "POST",
    body: "{}",
    timeoutMs: 90_000,
    demoRole: demoRoleFromRequest(request),
  });
}
