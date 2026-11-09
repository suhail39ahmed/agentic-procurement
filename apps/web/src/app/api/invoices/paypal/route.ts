import { proxyToApi } from "@/lib/api-proxy";

export async function GET() {
  return proxyToApi("/api/invoices/paypal");
}

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToApi("/api/invoices/paypal", { method: "POST", body, timeoutMs: 90_000 });
}
