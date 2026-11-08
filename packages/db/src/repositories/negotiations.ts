import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "../client";
import { fromCents, toCents } from "../money";
import { negotiations } from "../schema";

export type NegotiationStatus =
  | "DRAFT"
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

export type NegotiationPriority = "price" | "speed" | "balanced";

export type Negotiation = {
  id: string;
  ownerId: string;
  idempotencyKey: string;
  status: NegotiationStatus;
  brief: string;
  priority: NegotiationPriority;
  quantity: number;
  maxUnitPrice: number;
  currency: string;
  neededByDays: number;
  workflowRunId?: string;
  result?: unknown;
  error?: unknown;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: typeof negotiations.$inferSelect): Negotiation {
  return {
    id: row.id,
    ownerId: row.ownerId,
    idempotencyKey: row.idempotencyKey,
    status: row.status as NegotiationStatus,
    brief: row.brief,
    priority: row.priority as NegotiationPriority,
    quantity: row.quantity,
    maxUnitPrice: fromCents(row.maxUnitPrice),
    currency: row.currency,
    neededByDays: row.neededByDays,
    workflowRunId: row.workflowRunId ?? undefined,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findNegotiationByIdempotency(
  ownerId: string,
  idempotencyKey: string,
): Promise<Negotiation | undefined> {
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(negotiations)
    .where(and(eq(negotiations.ownerId, ownerId), eq(negotiations.idempotencyKey, idempotencyKey)))
    .limit(1);
  return row ? mapRow(row) : undefined;
}

export async function createNegotiation(input: {
  id: string;
  ownerId: string;
  idempotencyKey: string;
  status?: NegotiationStatus;
  brief: string;
  priority: NegotiationPriority;
  quantity: number;
  maxUnitPriceDollars: number;
  currency: string;
  neededByDays: number;
}): Promise<Negotiation> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const [row] = await db
    .insert(negotiations)
    .values({
      id: input.id,
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
      status: input.status ?? "QUEUED",
      brief: input.brief,
      priority: input.priority,
      quantity: input.quantity,
      maxUnitPrice: toCents(input.maxUnitPriceDollars),
      currency: input.currency,
      neededByDays: input.neededByDays,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return mapRow(row);
}

export async function getNegotiationForOwner(
  ownerId: string,
  id: string,
): Promise<Negotiation | undefined> {
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(negotiations)
    .where(and(eq(negotiations.id, id), eq(negotiations.ownerId, ownerId)))
    .limit(1);
  return row ? mapRow(row) : undefined;
}

export async function listNegotiationsForOwner(
  ownerId: string,
  limit = 50,
): Promise<Negotiation[]> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(negotiations)
    .where(eq(negotiations.ownerId, ownerId))
    .orderBy(desc(negotiations.createdAt))
    .limit(limit);
  return rows.map(mapRow);
}

export async function updateNegotiationRun(input: {
  id: string;
  ownerId: string;
  status: NegotiationStatus;
  workflowRunId?: string | null;
  result?: unknown;
  error?: unknown;
}): Promise<Negotiation | undefined> {
  const db = getDatabase();
  const [row] = await db
    .update(negotiations)
    .set({
      status: input.status,
      workflowRunId: input.workflowRunId === undefined ? undefined : input.workflowRunId,
      result: input.result === undefined ? undefined : input.result,
      error: input.error === undefined ? undefined : input.error,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(negotiations.id, input.id), eq(negotiations.ownerId, input.ownerId)))
    .returning();
  return row ? mapRow(row) : undefined;
}