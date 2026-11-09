import { proxyToApi } from "@/lib/api-proxy";

export async function GET() {
  return proxyToApi("/api/invoices/extracted");
}
