import {
  saveOrder as persistOrder,
  getOrder as loadOrder,
  listOrders as loadOrders,
  findOrderByPayPalIds,
  saveWebhookEvent,
  saveLedgerEntry,
  listLedgerEntries as loadLedgerEntries,
  saveDispute,
  listDisputes as loadDisputes,
  getLedgerByEventId,
  listWebhookEvents,
  withTransaction,
  withAuditOrderLock,
  type LedgerEntry as DbLedgerEntry,
  type Dispute as DbDispute,
} from "db";
import { canTransition, transition, type Order, type OrderEvent, type OrderStatus } from "./order-state";
import { dollarsToFixed } from "db";
import { appendAuditRecord } from "./audit";

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

const memoryOrders = new Map<string, Order>();
const memoryProcessed = new Map<string, LedgerEntry>();
const memoryEntries: LedgerEntry[] = [];
const memoryDisputes = new Map<string, Dispute>();
const memoryEvents = new Map<string, { id: string; eventType: string; createTime: string; raw: unknown; receivedAt: string }>();

function persistEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function idFromLink(links: Link[] | undefined, segment: string): string | undefined {
  const href = links?.find((l) => l.rel === "up" && l.href.includes(`/${segment}/`))?.href;
  return href?.split(`/${segment}/`)[1]?.split(/[/?]/)[0];
}

export async function saveOrder(order: Order): Promise<void> {
  if (persistEnabled()) {
    await withTransaction(async () => {
      const exists = await loadOrder(order.id);

      const save = async () => {
        const previous = await loadOrder(order.id);
        const previousHistoryLength = previous?.history.length ?? 0;
        const sameTransition = (
          a: Order["history"][number],
          b: Order["history"][number],
        ) =>
          a.from === b.from &&
          a.to === b.to &&
          a.event === b.event &&
          a.actor === b.actor &&
          new Date(a.at).getTime() === new Date(b.at).getTime() &&
          a.note === b.note;

        if (
          previous &&
          (order.history.length < previousHistoryLength ||
            previous.history.some(
              (entry, index) =>
                !sameTransition(entry, order.history[index]),
            ))
        ) {
          throw new Error("Stale order history; reload before saving");
        }

        await persistOrder(order);
        const newTransitions = order.history.slice(previousHistoryLength);

        for (const entry of newTransitions) {
          await appendAuditRecord({
            orderId: order.id,
            event: entry.event,
            actor: entry.actor,
            at: entry.at,
            from: entry.from,
            to: entry.to,
            note: entry.note,
          });
        }
      };

      if (exists) {
        await withAuditOrderLock(order.id, save);
      } else {
        await save();
      }
    });
    return;
  }
  memoryOrders.set(order.id, order);
}

export async function getOrder(id: string): Promise<Order | undefined> {
  if (persistEnabled()) return loadOrder(id);
  return memoryOrders.get(id);
}

export async function listOrders(): Promise<Order[]> {
  if (persistEnabled()) return loadOrders();
  return [...memoryOrders.values()];
}

export async function listLedger(): Promise<LedgerEntry[]> {
  if (persistEnabled()) return loadLedgerEntries() as Promise<LedgerEntry[]>;
  return [...memoryEntries];
}

export async function listDisputes(): Promise<Dispute[]> {
  if (persistEnabled()) return loadDisputes();
  return [...memoryDisputes.values()];
}

export async function listEvents(): Promise<{ id: string; eventType: string; createTime: string; raw: unknown; receivedAt: string }[]> {
  if (persistEnabled()) return listWebhookEvents();
  return [...memoryEvents.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

async function findOrder(event: PayPalWebhookEvent): Promise<Order | undefined> {
  const r = event.resource ?? {};
  const byJti = r.custom_id ?? r.disputed_transactions?.[0]?.custom;
  if (byJti) {
    const order = await getOrder(byJti);
    if (order) return order;
  }
  const related = r.supplementary_data?.related_ids ?? {};
  const paypalOrderId = related.order_id;
  const authorizationId =
    related.authorization_id ?? (event.event_type.startsWith("PAYMENT.AUTHORIZATION") ? r.id : undefined);
  const captureId =
    related.capture_id ??
    idFromLink(r.links, "captures") ??
    (event.event_type === "PAYMENT.CAPTURE.COMPLETED" ? r.id : undefined) ??
    r.disputed_transactions?.[0]?.seller_transaction_id;

  if (persistEnabled()) {
    return findOrderByPayPalIds({ paypalOrderId, authorizationId, captureId });
  }
  for (const o of memoryOrders.values()) {
    if (paypalOrderId && o.paypalOrderId === paypalOrderId) return o;
    if (authorizationId && o.authorizationId === authorizationId) return o;
    if (captureId && o.captureId === captureId) return o;
  }
  return undefined;
}

async function record(event: PayPalWebhookEvent, entry: Omit<LedgerEntry, "eventId" | "eventType" | "at">): Promise<LedgerEntry> {
  const full: LedgerEntry = { eventId: event.id, eventType: event.event_type, at: new Date().toISOString(), ...entry };
  if (persistEnabled()) {
    await saveLedgerEntry(full as DbLedgerEntry);
    return full;
  }
  memoryProcessed.set(event.id, full);
  memoryEntries.push(full);
  return full;
}

async function applyDispute(event: PayPalWebhookEvent): Promise<LedgerEntry> {
  const r = event.resource ?? {};
  const order = await findOrder(event);
  const disputeId = r.dispute_id ?? r.id ?? event.id;
  const existing = persistEnabled() ? undefined : memoryDisputes.get(disputeId);
  const dispute: Dispute = {
    disputeId,
    orderId: order?.id ?? existing?.orderId,
    captureId: r.disputed_transactions?.[0]?.seller_transaction_id ?? existing?.captureId,
    reason: r.reason ?? existing?.reason ?? "UNKNOWN",
    amount: r.dispute_amount?.value ?? existing?.amount,
    status: r.status ?? existing?.status ?? "OPEN",
    openedAt: existing?.openedAt ?? event.create_time ?? new Date().toISOString(),
  };
  if (persistEnabled()) await saveDispute(dispute as DbDispute);
  else memoryDisputes.set(disputeId, dispute);
  return record(event, {
    outcome: order ? "APPLIED" : "UNMATCHED",
    orderId: order?.id,
    reason: `dispute ${disputeId} ${r.status ?? "OPEN"}`,
  });
}

async function project(event: PayPalWebhookEvent): Promise<LedgerEntry> {
  if (event.event_type.startsWith("CUSTOMER.DISPUTE.")) return applyDispute(event);

  if (event.event_type === "INVOICING.INVOICE.PAID" || event.event_type === "INVOICING.INVOICE.CANCELLED") {
    return record(event, {
      outcome: "APPLIED",
      reason: `client invoice webhook ${event.event_type} ${event.resource?.id ?? ""}`.trim(),
    });
  }

  if (event.event_type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    return record(event, {
      outcome: "APPLIED",
      reason: `payout batch webhook ${event.event_type} ${event.resource?.id ?? ""}`.trim(),
    });
  }

  const rule = RULES[event.event_type];
  if (!rule) return record(event, { outcome: "IGNORED", reason: "event type not projected" });

  const order = await findOrder(event);
  if (!order) return record(event, { outcome: "UNMATCHED", reason: "no order for resource" });

  if (order.status === rule.target) {
    return record(event, {
      outcome: "SKIPPED",
      orderId: order.id,
      from: order.status,
      to: order.status,
      reason: "order already in target state",
    });
  }

  if (!canTransition(order.status, rule.event)) {
    return record(event, {
      outcome: "REJECTED",
      orderId: order.id,
      from: order.status,
      reason: `${rule.event} not allowed from ${order.status}`,
    });
  }

  const r = event.resource ?? {};
  if (rule.event === "AUTHORIZE" || rule.event === "CAPTURE") {
    const value = r.amount?.value;
    if (value !== undefined && value !== dollarsToFixed(order.amount)) {
      return record(event, {
        outcome: "REJECTED",
        orderId: order.id,
        from: order.status,
        reason: `amount ${value} differs from order ${dollarsToFixed(order.amount)}`,
      });
    }
  }

  const patch: Partial<Omit<Order, "id" | "status" | "history">> =
    rule.event === "AUTHORIZE" ? { authorizationId: r.id } : rule.event === "CAPTURE" ? { captureId: r.id } : {};
  const next = transition(order, rule.event, "paypal-webhook", patch, `${event.event_type} ${r.id ?? ""}`.trim());
  await saveOrder(next);
  return record(event, { outcome: "APPLIED", orderId: order.id, from: order.status, to: next.status, reason: event.event_type });
}

export async function applyWebhookEvent(event: PayPalWebhookEvent): Promise<LedgerEntry> {
  if (!persistEnabled()) {
    const seen = memoryProcessed.get(event.id);
    if (seen) return { ...seen, outcome: "SKIPPED", reason: "event already processed" };
    memoryEvents.set(event.id, {
      id: event.id,
      eventType: event.event_type,
      createTime: event.create_time ?? new Date().toISOString(),
      raw: event,
      receivedAt: new Date().toISOString(),
    });
    return project(event);
  }

  return withTransaction(async () => {
    const isNew = await saveWebhookEvent({
      id: event.id,
      eventType: event.event_type,
      createTime: event.create_time ?? new Date().toISOString(),
      raw: event,
      receivedAt: new Date().toISOString(),
    });
    if (!isNew) {
      const previous = await getLedgerByEventId(event.id);
      if (!previous) {
        return { eventId: event.id, eventType: event.event_type, outcome: "SKIPPED", reason: "event already processed", at: new Date().toISOString() };
      }
      return {
        eventId: previous.eventId,
        eventType: previous.eventType,
        outcome: "SKIPPED",
        orderId: previous.orderId,
        from: previous.from as OrderStatus | undefined,
        to: previous.to as OrderStatus | undefined,
        reason: "event already processed",
        at: previous.at,
      };
    }
    return project(event);
  });
}
