import { asc, eq } from "drizzle-orm";
import { getDatabase, withTransaction } from "../client";
import { auditRecords, orders } from "../schema";

export async function withAuditOrderLock<T>(
  orderId: string,
  work: () => Promise<T>,
): Promise<T> {
  return withTransaction(async () => {
    const [order] = await getDatabase()
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update");

    if (!order) throw new Error("Order not found");

    return work();
  });
}

export async function insertAuditRecord(
  record: typeof auditRecords.$inferInsert,
): Promise<void> {
  await getDatabase().insert(auditRecords).values(record);
}

export async function listAuditRecords(orderId: string) {
  return getDatabase()
    .select()
    .from(auditRecords)
    .where(eq(auditRecords.orderId, orderId))
    .orderBy(asc(auditRecords.sequence));
}