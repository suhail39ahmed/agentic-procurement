import { proxyToApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToApi("/api/invoices/ingest/storage", { method: "POST", body, timeoutMs: 90_000 });
}
