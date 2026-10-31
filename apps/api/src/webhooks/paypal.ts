import type { IncomingMessage, ServerResponse } from "node:http";
import { clientFromEnv } from "@ap/paypal";
import { WebhookStore } from "./store.js";

const store = new WebhookStore();
const pp = clientFromEnv();

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => ok(b)); req.on("error", fail); });
}
const send = (res: ServerResponse, code: number, body: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

/** POST /api/webhooks/paypal (issue #6) */
export async function handlePayPalWebhook(req: IncomingMessage, res: ServerResponse) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return send(res, 500, { error: "PAYPAL_WEBHOOK_ID not set" });

  let event: any;
  try { event = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: "invalid JSON" }); }
  if (!event?.id || !event?.event_type) return send(res, 400, { error: "not a PayPal event" });

  // Duplicate delivery: PayPal retries until it gets 2xx, so answer 200 without re-processing.
  if (store.has(event.id)) { console.log(`[webhook] duplicate ${event.id} ${event.event_type}`); return send(res, 200, { ok: true, duplicate: true }); }

  let verified = false;
  try { verified = await pp.verifyWebhook(req.headers as Record<string, string>, event, webhookId); }
  catch (e) {
    const msg = (e as Error).message;
    // 4xx from PayPal = malformed/forged headers -> reject. 5xx/network -> 503 so PayPal retries.
    if (/ 4\d\d:/.test(msg)) { console.warn(`[webhook] REJECTED malformed signature headers ${event.id}`); return send(res, 401, { error: "invalid signature" }); }
    console.error("[webhook] verify call failed:", msg); return send(res, 503, { error: "verification unavailable" });
  }
  if (!verified) { console.warn(`[webhook] REJECTED invalid signature ${event.id}`); return send(res, 401, { error: "invalid signature" }); }

  store.add({ id: event.id, transmission_id: String(req.headers["paypal-transmission-id"]), event_type: event.event_type,
    resource_id: event.resource?.id, received_at: new Date().toISOString(), payload: event });
  console.log(`[webhook] VERIFIED ${event.event_type} event=${event.id} resource=${event.resource?.id} status=${event.resource?.status ?? "-"} (stored: ${store.size})`);
  send(res, 200, { ok: true });
  // TODO(#27): project into payments/disputes/invoices ledger asynchronously after responding.
}
