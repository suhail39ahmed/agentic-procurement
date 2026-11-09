import { proxyToApi } from "@/lib/api-proxy";

export async function GET() {
  return proxyToApi("/api/shipment-email/sample", { method: "GET", timeoutMs: 15_000 });
}
