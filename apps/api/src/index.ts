import { createServer } from "node:http";

// Orchestrator placeholder. Coming next:
// - POST /api/requests        start sourcing (buyer agent, #12)
// - GET  /api/stream          SSE negotiation feed (#15)
// - POST /api/webhooks/paypal webhook receiver + signature verify (#6)
const port = Number(process.env.PORT ?? 4000);

createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true, env: process.env.PAYPAL_ENV ?? "sandbox" })); }
  res.writeHead(404); res.end();
}).listen(port, () => console.log(`api listening on :${port}`));
