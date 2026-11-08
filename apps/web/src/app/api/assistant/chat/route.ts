import { proxyToApi } from "@/lib/api-proxy";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyToApi("/api/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    timeoutMs: 90_000,
  });
}
