import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "../client";
import { fromCents, toCents } from "../money";
import { replenishmentRules, slackApprovals } from "../schema";
import type { NegotiationPriority } from "./negotiations";

export type ReplenishmentRule = {
  id: string;
  ownerId: string;
  sku: string;
  label: string;
  thresholdQty: number;
  reorderQty: number;
  onHand: number;
  maxUnitPrice: number;
  currency: string;
  neededByDays: number;
  priority: NegotiationPriority;
  enabled: boolean;
  lastTriggeredAt?: string;
  lastNegotiationId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SlackApprovalRow = {
  id: string;
  ownerId: string;
  negotiationId?: string;
  orderTotal: number;
  currency: string;
  supplierId?: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  slackTs?: string;
  slackChannel?: string;
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;
};

function mapRule(row: typeof replenishmentRules.$inferSelect): ReplenishmentRule {
  return {
    id: row.id,
    ownerId: row.ownerId,
    sku: row.sku,
    label: row.label,
    thresholdQty: row.thresholdQty,
    reorderQty: row.reorderQty,
    onHand: row.onHand,
    maxUnitPrice: fromCents(row.maxUnitPrice),
    currency: row.currency,
    neededByDays: row.neededByDays,
    priority: row.priority as NegotiationPriority,
    enabled: row.enabled === 1,
    lastTriggeredAt: row.lastTriggeredAt ?? undefined,
    lastNegotiationId: row.lastNegotiationId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapApproval(row: typeof slackApprovals.$inferSelect): SlackApprovalRow {
  return {
    id: row.id,
    ownerId: row.ownerId,
    negotiationId: row.negotiationId ?? undefined,
    orderTotal: fromCents(row.orderTotal),
    currency: row.currency,
    supplierId: row.supplierId ?? undefined,
    status: row.status as SlackApprovalRow["status"],
    slackTs: row.slackTs ?? undefined,
    slackChannel: row.slackChannel ?? undefined,
    decidedBy: row.decidedBy ?? undefined,
    decidedAt: row.decidedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listReplenishmentRules(ownerId: string): Promise<ReplenishmentRule[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(replenishmentRules)
    .where(eq(replenishmentRules.ownerId, ownerId))
    .orderBy(desc(replenishmentRules.createdAt));
  return rows.map(mapRule);
}

export async function createReplenishmentRule(input: {
  id: string;
  ownerId: string;
  sku: string;
  label: string;
  thresholdQty: number;
  reorderQty: number;
  onHand: number;
  maxUnitPriceDollars: number;
  currency: string;
  neededByDays: number;
  priority: NegotiationPriority;
}): Promise<ReplenishmentRule> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(replenishmentRules)
    .values({
      id: input.id,
      ownerId: input.ownerId,
      sku: input.sku,
      label: input.label,
      thresholdQty: input.thresholdQty,
      reorderQty: input.reorderQty,
      onHand: input.onHand,
      maxUnitPrice: toCents(input.maxUnitPriceDollars),
      currency: input.currency,
      neededByDays: input.neededByDays,
      priority: input.priority,
      enabled: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [replenishmentRules.ownerId, replenishmentRules.sku],
      set: {
        label: input.label,
        thresholdQty: input.thresholdQty,
        reorderQty: input.reorderQty,
        onHand: input.onHand,
        maxUnitPrice: toCents(input.maxUnitPriceDollars),
        currency: input.currency,
        neededByDays: input.neededByDays,
        priority: input.priority,
        enabled: 1,
        updatedAt: now,
      },
    })
    .returning();
  return mapRule(row);
}

export async function setReplenishmentOnHand(
  ownerId: string,
  sku: string,
  onHand: number,
): Promise<ReplenishmentRule | undefined> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const [row] = await db
    .update(replenishmentRules)
    .set({ onHand, updatedAt: now })
    .where(and(eq(replenishmentRules.ownerId, ownerId), eq(replenishmentRules.sku, sku)))
    .returning();
  return row ? mapRule(row) : undefined;
}

export async function markReplenishmentTriggered(input: {
  id: string;
  ownerId: string;
  negotiationId: string;
}): Promise<ReplenishmentRule | undefined> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const [row] = await db
    .update(replenishmentRules)
    .set({
      lastTriggeredAt: now,
      lastNegotiationId: input.negotiationId,
      updatedAt: now,
    })
    .where(and(eq(replenishmentRules.id, input.id), eq(replenishmentRules.ownerId, input.ownerId)))
    .returning();
  return row ? mapRule(row) : undefined;
}

export async function listSlackApprovals(ownerId: string): Promise<SlackApprovalRow[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(slackApprovals)
    .where(eq(slackApprovals.ownerId, ownerId))
    .orderBy(desc(slackApprovals.createdAt));
  return rows.map(mapApproval);
}

export async function createSlackApproval(input: {
  id: string;
  ownerId: string;
  negotiationId?: string;
  orderTotalDollars: number;
  currency: string;
  supplierId?: string;
  slackTs?: string;
  slackChannel?: string;
}): Promise<SlackApprovalRow> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(slackApprovals)
    .values({
      id: input.id,
      ownerId: input.ownerId,
      negotiationId: input.negotiationId,
      orderTotal: toCents(input.orderTotalDollars),
      currency: input.currency,
      supplierId: input.supplierId,
      status: "PENDING",
      slackTs: input.slackTs,
      slackChannel: input.slackChannel,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return mapApproval(row);
}

export async function decideSlackApproval(input: {
  id: string;
  ownerId: string;
  decision: "APPROVED" | "DENIED";
  decidedBy: string;
}): Promise<SlackApprovalRow | undefined> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const [existing] = await db
    .select()
    .from(slackApprovals)
    .where(and(eq(slackApprovals.id, input.id), eq(slackApprovals.ownerId, input.ownerId)))
    .limit(1);
  if (!existing) return undefined;
  if (existing.status !== "PENDING") return mapApproval(existing);

  const [row] = await db
    .update(slackApprovals)
    .set({
      status: input.decision,
      decidedBy: input.decidedBy,
      decidedAt: now,
      updatedAt: now,
    })
    .where(eq(slackApprovals.id, input.id))
    .returning();
  return row ? mapApproval(row) : undefined;
}
