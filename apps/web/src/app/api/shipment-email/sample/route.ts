import { proxyToApi } from "@/lib/api-proxy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  return proxyToApi(`/api/shipment-email/sample${qs ? `?${qs}` : ""}`, {
    method: "GET",
    timeoutMs: 15_000,
  });
}
