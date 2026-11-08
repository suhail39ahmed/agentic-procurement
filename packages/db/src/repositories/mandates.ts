import { and, eq, isNull } from "drizzle-orm";
import { getDatabase } from "../client";
import { mandates } from "../schema";
import { toCents } from "../money";

export async function issueMandateRecord(input: {
  jti: string;
  rfqId: string;
  supplierId: string;
  amountDollars: number;
  currency: string;
  approvedBy: string;
  issuedAt: string;
  expiresAt: string;
}): Promise<void> {
  const db = getDatabase();
  await db.insert(mandates).values({
    jti: input.jti,
    rfqId: input.rfqId,
    supplierId: input.supplierId,
    amount: toCents(input.amountDollars),
    currency: input.currency,
    approvedBy: input.approvedBy,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    consumedAt: null,
    orderId: null,
  });
}

export async function consumeMandate(jti: string): Promise<"consumed" | "missing" | "used" | "expired"> {
  const db = getDatabase();
  const [mandate] = await db.select().from(mandates).where(eq(mandates.jti, jti)).limit(1).for("update");
  if (!mandate) return "missing";
  if (mandate.consumedAt) return "used";
  if (Date.now() > Date.parse(mandate.expiresAt)) return "expired";
  const [updated] = await db
    .update(mandates)
    .set({ consumedAt: new Date().toISOString() })
    .where(and(eq(mandates.jti, jti), isNull(mandates.consumedAt)))
    .returning({ jti: mandates.jti });
  return updated ? "consumed" : "used";
}

export async function isMandateConsumed(jti: string): Promise<boolean> {
  const db = getDatabase();
  const [mandate] = await db.select().from(mandates).where(eq(mandates.jti, jti)).limit(1);
  return Boolean(mandate?.consumedAt);
}
