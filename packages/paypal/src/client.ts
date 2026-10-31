import { randomUUID } from "node:crypto";
import type { CreateOrderInput, PayPalConfig } from "./types.js";

const BASE = "https://api-m.sandbox.paypal.com"; // sandbox only (issue #42 adds a startup guard)

export class PayPalClient {
  private token?: { value: string; expiresAt: number };
  constructor(private cfg: PayPalConfig) {
    if (cfg.env !== "sandbox") throw new Error("Only PAYPAL_ENV=sandbox is allowed");
  }

  /** OAuth client_credentials, cached until ~1 min before expiry. */
  async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`OAuth failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000 };
    return j.access_token;
  }

  /** POST with PayPal-Request-Id for idempotency. Pass a stable key like `${poId}:authorize`. */
  async post<T>(path: string, body: unknown, idempotencyKey: string = randomUUID()): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await this.accessToken()}`, "Content-Type": "application/json", "PayPal-Request-Id": idempotencyKey, Prefer: "return=representation" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) { this.token = undefined; } // TODO(#4): retry once after refresh; backoff on 429/5xx
    if (!res.ok) throw new Error(`PayPal ${path} ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  /** Orders v2: create with intent AUTHORIZE. Payer must approve via the returned `approve` link. */
  createAuthorizeOrder(i: CreateOrderInput) {
    return this.post<any>("/v2/checkout/orders", {
      intent: "AUTHORIZE",
      purchase_units: [{ reference_id: i.poId, description: i.description, amount: i.amount, ...(i.payeeEmail ? { payee: { email_address: i.payeeEmail } } : {}) }],
      payment_source: { paypal: { experience_context: { return_url: i.returnUrl ?? "http://localhost:3000/return", cancel_url: i.cancelUrl ?? "http://localhost:3000/cancel" } } },
    }, `${i.poId}:create`);
  }

  /** Orders v2: POST /v2/checkout/orders/{id}/authorize (after payer approval). */
  authorizeOrder(orderId: string, poId: string) {
    return this.post<any>(`/v2/checkout/orders/${orderId}/authorize`, {}, `${poId}:authorize`);
  }

  /** Payments v2: POST /v2/payments/authorizations/{id}/capture. TODO(#25): partial capture, final_capture flag, ledger update. */
  captureAuthorization(authorizationId: string, poId: string) {
    return this.post<any>(`/v2/payments/authorizations/${authorizationId}/capture`, { final_capture: true }, `${poId}:capture`);
  }

  /** Payments v2: POST /v2/payments/authorizations/{id}/void.
   *  NOTE: only the payee merchant (or a partner holding its permissions) may void.
   *  Voiding an auth whose payee is a different sandbox merchant returns 403 PERMISSION_DENIED,
   *  even though capture by the order creator succeeds. Use payee = our own merchant for voidable holds. TODO(#26): call from timeout/expiry job. Returns 204 on success. */
  async voidAuthorization(authorizationId: string, poId: string) {
    const res = await fetch(`${BASE}/v2/payments/authorizations/${authorizationId}/void`, {
      method: "POST", headers: { Authorization: `Bearer ${await this.accessToken()}`, "PayPal-Request-Id": `${poId}:void` },
    });
    if (!res.ok) throw new Error(`void ${res.status}: ${await res.text()}`);
    return { status: res.status };
  }

  // TODO(#22): refund POST /v2/payments/captures/{id}/refund
  // TODO(#24): tracking POST /v2/checkout/orders/{id}/track
  // TODO(#6):  webhook verify POST /v1/notifications/verify-webhook-signature
}

export function clientFromEnv() {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env");
  return new PayPalClient({ clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET, env: (PAYPAL_ENV ?? "sandbox") as "sandbox" });
}
