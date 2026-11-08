import { eq, asc } from "drizzle-orm";
import { getDatabase } from "../client";
import { approvals, approvalAudit } from "../schema";
import { fromCents, toCents } from "../money";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export type AuditEntry = {
  at: string;
  actor: string;
  action: "REQUESTED" | "APPROVED" | "REJECTED" | "EXPIRED";
  note?: string;
};

export type ApprovalRequest = {
  id: string;
  rfqId: string;
  supplierId: string;
  unitPrice: number;
  orderTotal: number;
  reasons: string[];
  status: ApprovalStatus;
  createdAt: string;
  expiresAt: string;
  decidedBy?: string;
  audit: AuditEntry[];
};

function toDomain(
  row: typeof approvals.$inferSelect,
  audit: AuditEntry[],
): ApprovalRequest {
  return {
    id: row.id,
    rfqId: row.rfqId,
    supplierId: row.supplierId,
    unitPrice: fromCents(row.unitPrice),
    orderTotal: fromCents(row.orderTotal),
    reasons: row.reasons,
    status: row.status as ApprovalStatus,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    decidedBy: row.decidedBy ?? undefined,
    audit,
  };
}

function auditFromRows(rows: (typeof approvalAudit.$inferSelect)[]): AuditEntry[] {
  return rows.map((a) => ({
    at: a.at,
    actor: a.actor,
    action: a.action as AuditEntry["action"],
    note: a.note ?? undefined,
  }));
}

export async function getApproval(id: string): Promise<ApprovalRequest | undefined> {
  const db = getDatabase();
  const [row] = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  if (!row) return undefined;
  const auditRows = await db
    .select()
    .from(approvalAudit)
    .where(eq(approvalAudit.approvalId, id))
    .orderBy(asc(approvalAudit.id));
  return toDomain(row, auditFromRows(auditRows));
}

export async function listApprovals(status?: ApprovalStatus): Promise<ApprovalRequest[]> {
  const db = getDatabase();
  const rows = status
    ? await db.select().from(approvals).where(eq(approvals.status, status)).orderBy(asc(approvals.createdAt))
    : await db.select().from(approvals).orderBy(asc(approvals.createdAt));
  if (rows.length === 0) return [];
  const auditRows = await db.select().from(approvalAudit).orderBy(asc(approvalAudit.id));
  const byId = new Map<string, AuditEntry[]>();
  for (const a of auditRows) {
    const list = byId.get(a.approvalId) ?? [];
    list.push(...auditFromRows([a]));
    byId.set(a.approvalId, list);
  }
  return rows.map((row) => toDomain(row, byId.get(row.id) ?? []));
}

export async function saveApproval(approval: ApprovalRequest): Promise<void> {
  const db = getDatabase();
  const [existing] = await db.select().from(approvals).where(eq(approvals.id, approval.id)).limit(1).for("update");
  const values = {
    rfqId: approval.rfqId,
    supplierId: approval.supplierId,
    unitPrice: toCents(approval.unitPrice),
    orderTotal: toCents(approval.orderTotal),
    reasons: approval.reasons,
    status: approval.status,
    decidedBy: approval.decidedBy ?? null,
    createdAt: approval.createdAt,
    expiresAt: approval.expiresAt,
  };

  if (!existing) {
    await db.insert(approvals).values({ id: approval.id, ...values });
    if (approval.audit.length > 0) {
      await db.insert(approvalAudit).values(
        approval.audit.map((a) => ({
          approvalId: approval.id,
          at: a.at,
          actor: a.actor,
          action: a.action,
          note: a.note ?? null,
        })),
      );
    }
    return;
  }

  await db
    .update(approvals)
    .set({ status: approval.status, decidedBy: approval.decidedBy ?? null })
    .where(eq(approvals.id, approval.id));
  const existingAudit = await db.select().from(approvalAudit).where(eq(approvalAudit.approvalId, approval.id));
  const added = approval.audit.slice(existingAudit.length);
  if (added.length > 0) {
    await db.insert(approvalAudit).values(
      added.map((a) => ({
        approvalId: approval.id,
        at: a.at,
        actor: a.actor,
        action: a.action,
        note: a.note ?? null,
      })),
    );
  }
}
