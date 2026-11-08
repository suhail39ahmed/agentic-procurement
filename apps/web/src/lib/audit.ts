import "server-only";
import { requireLocalAuditViewer } from "./audit-access";

export interface AuditRecord {
  orderId: string;
  sequence: number;
  event: string;
  actor: string;
  at: string;
  from?: string;
  to?: string;
  note?: string;
  previousHash: string;
  hash: string;
}

export interface AuditResponse {
  orderId: string;
  recordCount: number;
  valid: boolean | null;
  records: AuditRecord[];
}

export async function fetchAudit(orderId: string): Promise<AuditResponse> {
  requireLocalAuditViewer();

  const baseUrl = process.env.API_BASE_URL;
  const key = process.env.ADMIN_API_KEY;
  if (!baseUrl || !key) {
    throw new Error("Audit server configuration is missing");
  }

  const response = await fetch(
    new URL(`/api/audit/${encodeURIComponent(orderId)}/verify`, baseUrl),
    {
      headers: { "x-admin-key": key },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Audit request failed (${response.status})`);
  }

  return response.json();
}