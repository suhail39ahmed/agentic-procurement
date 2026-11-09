import { proxyToApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToApi("/api/shipment-email/parse", {
    method: "POST",
    body: body || "{}",
    timeoutMs: 15_000,
  });
}
