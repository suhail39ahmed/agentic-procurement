import { createServer } from "node:http";
import { handlePayPalWebhook } from "./webhooks/paypal.js";

// Orchestrator. Coming next:
// - POST /api/requests  start sourcing (buyer agent, #12)
// - GET  /api/stream    SSE negotiation feed (#15)
const port = Number(process.env.PORT ?? 4000);

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, env: process.env.PAYPAL_ENV ?? "sandbox", webhookIdSet: Boolean(process.env.PAYPAL_WEBHOOK_ID) }));
  }
  if (req.method === "POST" && req.url?.split("?")[0] === "/api/webhooks/paypal") {
    return void handlePayPalWebhook(req, res).catch((e) => { console.error(e); if (!res.headersSent) { res.writeHead(500); res.end(); } });
  }
  res.writeHead(404); res.end();
}).listen(port, () => console.log(`api listening on :${port}  (webhooks: POST /api/webhooks/paypal)`));
