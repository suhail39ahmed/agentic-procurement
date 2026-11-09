import { asc, desc, eq } from "drizzle-orm";
import { getDatabase } from "../client";
import { fromCents, toCents } from "../money";
import {
  disputes,
  payoutBatches,
  supplierInvoices,
  supplierReputation,
} from "../schema";

export type DisputeRow = {
  disputeId: string;
  orderId?: string;
  captureId?: string;
  reason: string;
  amount?: string;
  status: string;
  openedAt: string;
  agentDraft?: string;
  agentDraftAt?: string;
  acceptApprovedBy?: string;
  acceptApprovedAt?: string;
};

export type SupplierInvoice = {
  id: string;
  ownerId: string;
  source: string;
  vendorName?: string;
  supplierId?: string;
  invoiceNumber?: string;
  currency: string;
  amount: number;
  dueDate?: string;
  lineItems?: unknown;
  confidence: number;
  lowConfidence: boolean; // mapped from 0/1
  rawText?: string;
  paypalInvoiceId?: string;
  status: string;
  matchStatus: string;
  matchNotes?: string;
  orderId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SupplierReputation = {
  supplierId: string;
  onTimeScore: number;
  disputeScore: number;
  priceHonestyScore: number;
  ordersCounted: number;
  disputesCounted: number;
  updatedAt: string;
};

export async function listLocalDisputes(): Promise<DisputeRow[]> {
  const db = getDatabase();
  const rows = await db.select().from(disputes).orderBy(asc(disputes.openedAt));
  return rows.map((d) => ({
    disputeId: d.disputeId,
    orderId: d.orderId ?? undefined,
    captureId: d.captureId ?? undefined,
    reason: d.reason,
    amount: d.amount == null ? undefined : fromCents(d.amount).toFixed(2),
    status: d.status,
    openedAt: d.openedAt,
    agentDraft: d.agentDraft ?? undefined,
    agentDraftAt: d.agentDraftAt ?? undefined,
    acceptApprovedBy: d.acceptApprovedBy ?? undefined,
    acceptApprovedAt: d.acceptApprovedAt ?? undefined,
  }));
}

export async function getLocalDispute(disputeId: string): Promise<DisputeRow | null> {
  const db = getDatabase();
  const [row] = await db.select().from(disputes).where(eq(disputes.disputeId, disputeId)).limit(1);
  if (!row) return null;
  return {
    disputeId: row.disputeId,
    orderId: row.orderId ?? undefined,
    captureId: row.captureId ?? undefined,
    reason: row.reason,
    amount: row.amount == null ? undefined : fromCents(row.amount).toFixed(2),
    status: row.status,
    openedAt: row.openedAt,
    agentDraft: row.agentDraft ?? undefined,
    agentDraftAt: row.agentDraftAt ?? undefined,
    acceptApprovedBy: row.acceptApprovedBy ?? undefined,
    acceptApprovedAt: row.acceptApprovedAt ?? undefined,
  };
}

export async function upsertLocalDispute(input: {
  disputeId: string;
  orderId?: string;
  captureId?: string;
  reason: string;
  amount?: string;
  status: string;
  openedAt?: string;
}): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db
    .insert(disputes)
    .values({
      disputeId: input.disputeId,
      orderId: input.orderId ?? null,
      captureId: input.captureId ?? null,
      reason: input.reason,
      amount: input.amount !== undefined ? toCents(Number(input.amount)) : null,
      status: input.status,
      openedAt: input.openedAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: disputes.disputeId,
      set: {
        orderId: input.orderId ?? null,
        captureId: input.captureId ?? null,
        reason: input.reason,
        amount: input.amount !== undefined ? toCents(Number(input.amount)) : null,
        status: input.status,
        updatedAt: now,
      },
    });
}

export async function saveDisputeDraft(disputeId: string, draft: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db
    .update(disputes)
    .set({ agentDraft: draft, agentDraftAt: now, updatedAt: now })
    .where(eq(disputes.disputeId, disputeId));
}

export async function markDisputeAcceptApproved(disputeId: string, approvedBy: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db
    .update(disputes)
    .set({ acceptApprovedBy: approvedBy, acceptApprovedAt: now, updatedAt: now })
    .where(eq(disputes.disputeId, disputeId));
}

export async function saveSupplierInvoice(invoice: Omit<SupplierInvoice, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt?: string;
}): Promise<SupplierInvoice> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.insert(supplierInvoices).values({
    id: invoice.id,
    ownerId: invoice.ownerId,
    source: invoice.source,
    vendorName: invoice.vendorName ?? null,
    supplierId: invoice.supplierId ?? null,
    invoiceNumber: invoice.invoiceNumber ?? null,
    currency: invoice.currency,
    amount: toCents(invoice.amount),
    dueDate: invoice.dueDate ?? null,
    lineItems: invoice.lineItems ?? null,
    confidence: Math.round(invoice.confidence),
    lowConfidence: invoice.lowConfidence ? 1 : 0,
    rawText: invoice.rawText ?? null,
    paypalInvoiceId: invoice.paypalInvoiceId ?? null,
    status: invoice.status,
    matchStatus: invoice.matchStatus,
    matchNotes: invoice.matchNotes ?? null,
    orderId: invoice.orderId ?? null,
    createdAt: invoice.createdAt ?? now,
    updatedAt: invoice.updatedAt ?? now,
  }).onConflictDoUpdate({
    target: supplierInvoices.id,
    set: {
      vendorName: invoice.vendorName ?? null,
      supplierId: invoice.supplierId ?? null,
      invoiceNumber: invoice.invoiceNumber ?? null,
      amount: toCents(invoice.amount),
      dueDate: invoice.dueDate ?? null,
      lineItems: invoice.lineItems ?? null,
      confidence: Math.round(invoice.confidence),
      lowConfidence: invoice.lowConfidence ? 1 : 0,
      rawText: invoice.rawText ?? null,
      paypalInvoiceId: invoice.paypalInvoiceId ?? null,
      status: invoice.status,
      matchStatus: invoice.matchStatus,
      matchNotes: invoice.matchNotes ?? null,
      orderId: invoice.orderId ?? null,
      updatedAt: now,
    },
  });
  const [row] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, invoice.id)).limit(1);
  return mapInvoice(row!);
}

export async function listSupplierInvoices(ownerId: string): Promise<SupplierInvoice[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(supplierInvoices)
    .where(eq(supplierInvoices.ownerId, ownerId))
    .orderBy(desc(supplierInvoices.createdAt));
  return rows.map(mapInvoice);
}

export async function getSupplierInvoice(ownerId: string, id: string): Promise<SupplierInvoice | null> {
  const db = getDatabase();
  const [row] = await db.select().from(supplierInvoices).where(eq(supplierInvoices.id, id)).limit(1);
  if (!row || row.ownerId !== ownerId) return null;
  return mapInvoice(row);
}

export async function updateSupplierInvoiceMatch(
  id: string,
  patch: { matchStatus: string; matchNotes?: string; orderId?: string; status?: string },
): Promise<void> {
  const db = getDatabase();
  await db.update(supplierInvoices).set({
    matchStatus: patch.matchStatus,
    matchNotes: patch.matchNotes ?? null,
    orderId: patch.orderId ?? null,
    status: patch.status ?? undefined,
    updatedAt: new Date().toISOString(),
  }).where(eq(supplierInvoices.id, id));
}

export async function getSupplierReputation(supplierId: string): Promise<SupplierReputation | null> {
  const db = getDatabase();
  const [row] = await db.select().from(supplierReputation).where(eq(supplierReputation.supplierId, supplierId)).limit(1);
  if (!row) return null;
  return mapReputation(row);
}

export async function listSupplierReputation(): Promise<SupplierReputation[]> {
  const db = getDatabase();
  const rows = await db.select().from(supplierReputation).orderBy(asc(supplierReputation.supplierId));
  return rows.map(mapReputation);
}

export async function upsertSupplierReputation(input: {
  supplierId: string;
  onTimeScore: number;
  disputeScore: number;
  priceHonestyScore: number;
  ordersCounted: number;
  disputesCounted: number;
}): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const toMilli = (score: number) => Math.round(Math.min(1, Math.max(0, score)) * 1000);
  await db.insert(supplierReputation).values({
    supplierId: input.supplierId,
    onTimeScore: toMilli(input.onTimeScore),
    disputeScore: toMilli(input.disputeScore),
    priceHonestyScore: toMilli(input.priceHonestyScore),
    ordersCounted: input.ordersCounted,
    disputesCounted: input.disputesCounted,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: supplierReputation.supplierId,
    set: {
      onTimeScore: toMilli(input.onTimeScore),
      disputeScore: toMilli(input.disputeScore),
      priceHonestyScore: toMilli(input.priceHonestyScore),
      ordersCounted: input.ordersCounted,
      disputesCounted: input.disputesCounted,
      updatedAt: now,
    },
  });
}

export async function savePayoutBatch(input: {
  id: string;
  ownerId: string;
  paypalBatchId?: string;
  status: string;
  amount: number;
  currency: string;
  invoiceId?: string;
  receiver: string;
  note?: string;
}): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.insert(payoutBatches).values({
    id: input.id,
    ownerId: input.ownerId,
    paypalBatchId: input.paypalBatchId ?? null,
    status: input.status,
    amount: toCents(input.amount),
    currency: input.currency,
    invoiceId: input.invoiceId ?? null,
    receiver: input.receiver,
    note: input.note ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function listPayoutBatches(ownerId: string) {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(payoutBatches)
    .where(eq(payoutBatches.ownerId, ownerId))
    .orderBy(desc(payoutBatches.createdAt));
  return rows.map((row) => ({
    id: row.id,
    paypalBatchId: row.paypalBatchId ?? undefined,
    status: row.status,
    amount: fromCents(row.amount),
    currency: row.currency,
    invoiceId: row.invoiceId ?? undefined,
    receiver: row.receiver,
    note: row.note ?? undefined,
    createdAt: row.createdAt,
  }));
}

function mapInvoice(row: typeof supplierInvoices.$inferSelect): SupplierInvoice {
  return {
    id: row.id,
    ownerId: row.ownerId,
    source: row.source,
    vendorName: row.vendorName ?? undefined,
    supplierId: row.supplierId ?? undefined,
    invoiceNumber: row.invoiceNumber ?? undefined,
    currency: row.currency,
    amount: fromCents(row.amount),
    dueDate: row.dueDate ?? undefined,
    lineItems: row.lineItems ?? undefined,
    confidence: row.confidence,
    lowConfidence: row.lowConfidence === 1,
    rawText: row.rawText ?? undefined,
    paypalInvoiceId: row.paypalInvoiceId ?? undefined,
    status: row.status,
    matchStatus: row.matchStatus,
    matchNotes: row.matchNotes ?? undefined,
    orderId: row.orderId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapReputation(row: typeof supplierReputation.$inferSelect): SupplierReputation {
  return {
    supplierId: row.supplierId,
    onTimeScore: row.onTimeScore / 1000,
    disputeScore: row.disputeScore / 1000,
    priceHonestyScore: row.priceHonestyScore / 1000,
    ordersCounted: row.ordersCounted,
    disputesCounted: row.disputesCounted,
    updatedAt: row.updatedAt,
  };
}
