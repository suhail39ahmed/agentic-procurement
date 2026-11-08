import { desc, eq, asc } from "drizzle-orm";
import { getDatabase } from "../client";
import { webhookEvents, ledgerEntries, disputes } from "../schema";
import { fromCents, toCents } from "../money";

export type WebhookEvent = {
  id: string;
  eventType: string;
  createTime: string;
  raw: unknown;
  receivedAt: string;
};

export type LedgerOutcome = "APPLIED" | "SKIPPED" | "REJECTED" | "UNMATCHED" | "IGNORED";

export type LedgerEntry = {
  eventId: string;
  eventType: string;
  outcome: LedgerOutcome;
  orderId?: string;
  from?: string;
  to?: string;
  reason: string;
  at: string;
};

export type Dispute = {
  disputeId: string;
  orderId?: string;
  captureId?: string;
  reason: string;
  amount?: string;
  status: string;
  openedAt: string;
};

export async function saveWebhookEvent(event: WebhookEvent): Promise<boolean> {
  const db = getDatabase();
  const inserted = await db
    .insert(webhookEvents)
    .values({
      id: event.id,
      eventType: event.eventType,
      createTime: event.createTime,
      raw: event.raw,
      receivedAt: event.receivedAt,
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  return inserted.length > 0;
}

export async function listWebhookEvents(): Promise<WebhookEvent[]> {
  const db = getDatabase();
  const rows = await db.select().from(webhookEvents).orderBy(desc(webhookEvents.receivedAt));
  return rows.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    createTime: e.createTime,
    raw: e.raw,
    receivedAt: e.receivedAt,
  }));
}

export async function saveLedgerEntry(entry: LedgerEntry): Promise<void> {
  const db = getDatabase();
  await db.insert(ledgerEntries).values({
    eventId: entry.eventId,
    eventType: entry.eventType,
    outcome: entry.outcome,
    orderId: entry.orderId ?? null,
    fromStatus: entry.from ?? null,
    toStatus: entry.to ?? null,
    reason: entry.reason,
    at: entry.at,
  });
}

export async function listLedgerEntries(): Promise<LedgerEntry[]> {
  const db = getDatabase();
  const rows = await db.select().from(ledgerEntries).orderBy(asc(ledgerEntries.id));
  return rows.map((e) => ({
    eventId: e.eventId,
    eventType: e.eventType,
    outcome: e.outcome as LedgerOutcome,
    orderId: e.orderId ?? undefined,
    from: e.fromStatus ?? undefined,
    to: e.toStatus ?? undefined,
    reason: e.reason,
    at: e.at,
  }));
}

export async function saveDispute(dispute: Dispute): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const amountCents = dispute.amount !== undefined ? toCents(Number(dispute.amount)) : null;
  await db
    .insert(disputes)
    .values({
      disputeId: dispute.disputeId,
      orderId: dispute.orderId ?? null,
      captureId: dispute.captureId ?? null,
      reason: dispute.reason,
      amount: amountCents,
      status: dispute.status,
      openedAt: dispute.openedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: disputes.disputeId,
      set: {
        orderId: dispute.orderId ?? null,
        captureId: dispute.captureId ?? null,
        reason: dispute.reason,
        amount: amountCents,
        status: dispute.status,
        updatedAt: now,
      },
    });
}

export async function listDisputes(): Promise<Dispute[]> {
  const db = getDatabase();
  const rows = await db.select().from(disputes).orderBy(asc(disputes.openedAt));
  return rows.map((d) => ({
    disputeId: d.disputeId,
    orderId: d.orderId ?? undefined,
    captureId: d.captureId ?? undefined,
    reason: d.reason,
    amount: d.amount === null || d.amount === undefined ? undefined : fromCents(d.amount).toFixed(2),
    status: d.status,
    openedAt: d.openedAt,
  }));
}

export async function getLedgerByEventId(eventId: string): Promise<LedgerEntry | undefined> {
  const db = getDatabase();
  const [row] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.eventId, eventId)).limit(1);
  if (!row) return undefined;
  return {
    eventId: row.eventId,
    eventType: row.eventType,
    outcome: row.outcome as LedgerOutcome,
    orderId: row.orderId ?? undefined,
    from: row.fromStatus ?? undefined,
    to: row.toStatus ?? undefined,
    reason: row.reason,
    at: row.at,
  };
}
