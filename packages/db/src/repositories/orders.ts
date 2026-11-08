import { eq, or, inArray, asc } from "drizzle-orm";
import { getDatabase } from "../client";
import { orders, orderTransitions } from "../schema";
import { fromCents, toCents } from "../money";

export type OrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "HELD"
  | "SHIPPED"
  | "CAPTURED"
  | "VOIDED"
  | "REFUNDED"
  | "EXPIRED"
  | "REJECTED";

export type OrderEvent =
  | "REQUIRE_APPROVAL"
  | "APPROVE"
  | "REJECT"
  | "AUTHORIZE"
  | "SHIP"
  | "CAPTURE"
  | "VOID"
  | "REFUND"
  | "REAUTHORIZE"
  | "EXPIRE";

export type OrderTransition = {
  from: OrderStatus;
  to: OrderStatus;
  event: OrderEvent;
  actor: string;
  at: string;
  note?: string;
};

export type Order = {
  id: string;
  rfqId: string;
  supplierId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  paypalOrderId?: string;
  authorizationId?: string;
  captureId?: string;
  tracking?: { carrier: string; number: string };
  heldAt?: string;
  deliverBy?: string;
  reauthorizedAt?: string;
  history: OrderTransition[];
};

function toDomain(order: typeof orders.$inferSelect, history: OrderTransition[]): Order {
  return {
    id: order.id,
    rfqId: order.rfqId,
    supplierId: order.supplierId,
    amount: fromCents(order.amount),
    currency: order.currency,
    status: order.status as OrderStatus,
    paypalOrderId: order.paypalOrderId ?? undefined,
    authorizationId: order.authorizationId ?? undefined,
    captureId: order.captureId ?? undefined,
    tracking: order.tracking ?? undefined,
    heldAt: order.heldAt ?? undefined,
    deliverBy: order.deliverBy ?? undefined,
    reauthorizedAt: order.reauthorizedAt ?? undefined,
    history,
  };
}

function historyFromRows(rows: (typeof orderTransitions.$inferSelect)[]): OrderTransition[] {
  return rows.map((h) => ({
    from: h.fromStatus as OrderStatus,
    to: h.toStatus as OrderStatus,
    event: h.event as OrderEvent,
    actor: h.actor,
    at: h.at,
    note: h.note ?? undefined,
  }));
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const db = getDatabase();
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return undefined;
  const rows = await db
    .select()
    .from(orderTransitions)
    .where(eq(orderTransitions.orderId, id))
    .orderBy(asc(orderTransitions.id));
  return toDomain(order, historyFromRows(rows));
}

export async function listOrders(): Promise<Order[]> {
  const db = getDatabase();
  const allOrders = await db.select().from(orders).orderBy(asc(orders.createdAt));
  if (allOrders.length === 0) return [];
  const allTransitions = await db
    .select()
    .from(orderTransitions)
    .where(inArray(orderTransitions.orderId, allOrders.map((o) => o.id)))
    .orderBy(asc(orderTransitions.id));
  const byOrder = new Map<string, OrderTransition[]>();
  for (const row of allTransitions) {
    const list = byOrder.get(row.orderId) ?? [];
    list.push(...historyFromRows([row]));
    byOrder.set(row.orderId, list);
  }
  return allOrders.map((order) => toDomain(order, byOrder.get(order.id) ?? []));
}

export async function findOrderByPayPalIds(ids: {
  paypalOrderId?: string;
  authorizationId?: string;
  captureId?: string;
}): Promise<Order | undefined> {
  const conditions = [
    ids.paypalOrderId ? eq(orders.paypalOrderId, ids.paypalOrderId) : undefined,
    ids.authorizationId ? eq(orders.authorizationId, ids.authorizationId) : undefined,
    ids.captureId ? eq(orders.captureId, ids.captureId) : undefined,
  ].filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (conditions.length === 0) return undefined;

  const db = getDatabase();
  const [order] = await db.select().from(orders).where(or(...conditions)).limit(1);
  if (!order) return undefined;
  return getOrder(order.id);
}

export async function saveOrder(order: Order): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const [existing] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1).for("update");

  const values = {
    rfqId: order.rfqId,
    supplierId: order.supplierId,
    amount: toCents(order.amount),
    currency: order.currency,
    status: order.status,
    paypalOrderId: order.paypalOrderId ?? null,
    authorizationId: order.authorizationId ?? null,
    captureId: order.captureId ?? null,
    tracking: order.tracking ?? null,
    heldAt: order.heldAt ?? null,
    deliverBy: order.deliverBy ?? null,
    reauthorizedAt: order.reauthorizedAt ?? null,
    updatedAt: now,
  };

  if (!existing) {
    await db.insert(orders).values({ id: order.id, ...values, createdAt: now });
    if (order.history.length > 0) {
      await db.insert(orderTransitions).values(
        order.history.map((h) => ({
          orderId: order.id,
          fromStatus: h.from,
          toStatus: h.to,
          event: h.event,
          actor: h.actor,
          at: h.at,
          note: h.note ?? null,
        })),
      );
    }
    return;
  }

  await db.update(orders).set(values).where(eq(orders.id, order.id));
  const existingTransitions = await db
    .select()
    .from(orderTransitions)
    .where(eq(orderTransitions.orderId, order.id))
    .orderBy(asc(orderTransitions.id));
  const newTransitions = order.history.slice(existingTransitions.length);
  if (newTransitions.length > 0) {
    await db.insert(orderTransitions).values(
      newTransitions.map((h) => ({
        orderId: order.id,
        fromStatus: h.from,
        toStatus: h.to,
        event: h.event,
        actor: h.actor,
        at: h.at,
        note: h.note ?? null,
      })),
    );
  }
}
