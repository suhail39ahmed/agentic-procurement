import { createHash } from "node:crypto";
import type { OrderStatus } from "./order-state";
import {
  listAuditRecords,
  withAuditOrderLock,
  insertAuditRecord,
} from "db";

export interface AuditRecord {
  orderId: string;
  sequence: number;
  event: string;
  actor: string;
  at: string;
  previousHash: string;
  hash: string;
  from?: OrderStatus;
  to?: OrderStatus;
  note?: string;
}

export function hashAuditRecord(record: Omit<AuditRecord, "hash">): string {
  const payload = JSON.stringify([
    record.orderId,
    record.sequence,
    record.event,
    record.actor,
    record.at,
    record.previousHash,
    record.from ?? null,
    record.to ?? null,
    record.note ?? null,
  ]);

  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function createAuditRecord(
  input: Pick<AuditRecord, "orderId" | "event" | "actor" | "at" | "from" | "to" | "note">,
  previous?: AuditRecord,
): AuditRecord {
  if (previous && previous.orderId !== input.orderId) {
    throw new Error("Cannot link audit records from different orders");
  }

  const record: Omit<AuditRecord, "hash"> = {
    ...input,
    sequence: previous ? previous.sequence + 1 : 1,
    previousHash: previous ? previous.hash : "0".repeat(64),
  };

  return { ...record, hash: hashAuditRecord(record) };
}

export function verifyAuditChain(records: readonly AuditRecord[]): boolean {
  let previousHash = "0".repeat(64);
  const orderId = records[0]?.orderId;

  for (let index = 0; index < records.length; index++) {
    const record = records[index];

    if (
      record.orderId !== orderId ||
      record.sequence !== index + 1 ||
      record.previousHash !== previousHash ||
      record.hash !== hashAuditRecord(record)
    ) {
      return false;
    }

    previousHash = record.hash;
  }

  return true;
}

export async function appendAuditRecord(
  input: Pick<
    AuditRecord,
    "orderId" | "event" | "actor" | "at" | "from" | "to" | "note"
  >,
): Promise<AuditRecord> {
  return withAuditOrderLock(input.orderId, async () => {
    const rows = await listAuditRecords(input.orderId);
    const records: AuditRecord[] = rows.map((row) => ({
      ...row,
      from: (row.from ?? undefined) as OrderStatus | undefined,
      to: (row.to ?? undefined) as OrderStatus | undefined,
      note: row.note ?? undefined,
    }));

    if (!verifyAuditChain(records)) {
      throw new Error("Audit chain verification failed");
    }

    const record = createAuditRecord(
      input,
      records[records.length - 1],
    );
    await insertAuditRecord(record);
    return record;
  });
}