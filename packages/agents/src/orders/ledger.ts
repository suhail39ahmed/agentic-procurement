import { canTransition, transition, type Order, type OrderEvent, type OrderStatus } from "./order-state";

type Money = { value?: string; currency_code?: string };
type Link = { href: string; rel: string };

export type PayPalWebhookEvent = {
  id: string;
  event_type: string;
  create_time?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    amount?: Money;
    links?: Link[];
    supplementary_data?: { related_ids?: { order_id?: string; authorization_id?: string; capture_id?: string } };
    dispute_id?: string;
    reason?: string;
    dispute_amount?: Money;
    disputed_transactions?: { seller_transaction_id?: string; custom?: string }[];
  };
};

export type LedgerOutcome = "APPLIED" | "SKIPPED" | "REJECTED" | "UNMATCHED" | "IGNORED";

export interface LedgerEntry {
  eventId: string;
  eventType: string;
  outcome: LedgerOutcome;
  orderId?: string;
  from?: OrderStatus;
  to?: OrderStatus;
  reason: string;
  at: string;
}

export interface Dispute {
  disputeId: string;
  orderId?: string;
  captureId?: string;
  reason: string;
  amount?: string;
  status: string;
  openedAt: string;
}

const RULES: Record<string, { event: OrderEvent; target: OrderStatus }> = {
  "PAYMENT.AUTHORIZATION.CREATED": { event: "AUTHORIZE", target: "HELD" },
  "PAYMENT.AUTHORIZATION.VOIDED": { event: "VOID", target: "VOIDED" },
  "PAYMENT.CAPTURE.COMPLETED": { event: "CAPTURE", target: "CAPTURED" },
  "PAYMENT.CAPTURE.REFUNDED": { event: "REFUND", target: "REFUNDED" },
};

const orders = new Map<string, Order>();
const processed = new Map<string, LedgerEntry>();
const entries: LedgerEntry[] = [];
const disputes = new Map<string, Dispute>();

export function saveOrder(order: Order): void {
  orders.set(order.id, order);
}

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function listOrders(): Order[] {
  return [...orders.values()];
}

export function listLedger(): LedgerEntry[] {
  return [...entries];
}

export function listDisputes(): Dispute[] {
  return [...disputes.values()];
}

function idFromLink(links: Link[] | undefined, segment: string): string | undefined {
  const href = links?.find((l) => l.rel === "up" && l.href.includes(`/${segment}/`))?.href;
  return href?.split(`/${segment}/`)[1]?.split(/[/?]/)[0];
}

function findOrder(event: PayPalWebhookEvent): Order | undefined {
  const r = event.resource ?? {};
  const byJti = r.custom_id ?? r.disputed_transactions?.[0]?.custom;
  if (byJti && orders.has(byJti)) return orders.get(byJti);

  const related = r.supplementary_data?.related_ids ?? {};
  const paypalOrderId = related.order_id;
  const authorizationId =
    related.authorization_id ?? (event.event_type.startsWith("PAYMENT.AUTHORIZATION") ? r.id : undefined);
  const captureId =
    related.capture_id ??
    idFromLink(r.links, "captures") ??
    (event.event_type === "PAYMENT.CAPTURE.COMPLETED" ? r.id : undefined) ??
    r.disputed_transactions?.[0]?.seller_transaction_id;

  for (const o of orders.values()) {
    if (paypalOrderId && o.paypalOrderId === paypalOrderId) return o;
    if (authorizationId && o.authorizationId === authorizationId) return o;
    if (captureId && o.captureId === captureId) return o;
  }
  return undefined;
}

function record(event: PayPalWebhookEvent, entry: Omit<LedgerEntry, "eventId" | "eventType" | "at">): LedgerEntry {
  const full: LedgerEntry = { eventId: event.id, eventType: event.event_type, at: new Date().toISOString(), ...entry };
  processed.set(event.id, full);
  entries.push(full);
  return full;
}

function applyDispute(event: PayPalWebhookEvent): LedgerEntry {
  const r = event.resource ?? {};
  const order = findOrder(event);
  const disputeId = r.dispute_id ?? r.id ?? event.id;
  const existing = disputes.get(disputeId);
  disputes.set(disputeId, {
    disputeId,
    orderId: order?.id ?? existing?.orderId,
    captureId: r.disputed_transactions?.[0]?.seller_transaction_id ?? existing?.captureId,
    reason: r.reason ?? existing?.reason ?? "UNKNOWN",
    amount: r.dispute_amount?.value ?? existing?.amount,
    status: r.status ?? existing?.status ?? "OPEN",
    openedAt: existing?.openedAt ?? event.create_time ?? new Date().toISOString(),
  });
  return record(event, {
    outcome: order ? "APPLIED" : "UNMATCHED",
    orderId: order?.id,
    reason: `dispute ${disputeId} ${r.status ?? "OPEN"}`,
  });
}

export function applyWebhookEvent(event: PayPalWebhookEvent): LedgerEntry {
  const seen = processed.get(event.id);
  if (seen) return { ...seen, outcome: "SKIPPED", reason: "event already processed" };

  if (event.event_type.startsWith("CUSTOMER.DISPUTE.")) return applyDispute(event);

  const rule = RULES[event.event_type];
  if (!rule) return record(event, { outcome: "IGNORED", reason: "event type not projected" });

  const order = findOrder(event);
  if (!order) return record(event, { outcome: "UNMATCHED", reason: "no order for resource" });

  if (order.status === rule.target) {
    return record(event, { outcome: "SKIPPED", orderId: order.id, from: order.status, to: order.status, reason: "order already in target state" });
  }

  if (!canTransition(order.status, rule.event)) {
    return record(event, { outcome: "REJECTED", orderId: order.id, from: order.status, reason: `${rule.event} not allowed from ${order.status}` });
  }

  const r = event.resource ?? {};
  if (rule.event === "AUTHORIZE" || rule.event === "CAPTURE") {
    const value = r.amount?.value;
    if (value !== undefined && value !== order.amount.toFixed(2)) {
      return record(event, { outcome: "REJECTED", orderId: order.id, from: order.status, reason: `amount ${value} differs from order ${order.amount.toFixed(2)}` });
    }
  }

  const patch: Partial<Omit<Order, "id" | "status" | "history">> =
    rule.event === "AUTHORIZE" ? { authorizationId: r.id } : rule.event === "CAPTURE" ? { captureId: r.id } : {};
  const next = transition(order, rule.event, "paypal-webhook", patch, `${event.event_type} ${r.id ?? ""}`.trim());
  orders.set(next.id, next);
  return record(event, { outcome: "APPLIED", orderId: order.id, from: order.status, to: next.status, reason: event.event_type });
}