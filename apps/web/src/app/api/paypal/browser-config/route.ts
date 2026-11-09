import { proxyToApi } from "@/lib/api-proxy";

export async function GET() {
  return proxyToApi("/api/paypal/browser-config");
}
