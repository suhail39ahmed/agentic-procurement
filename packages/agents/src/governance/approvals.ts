import { randomUUID } from "node:crypto";
import type { RfqMessage } from "../negotiation/protocol";
import type { ScoredOffer } from "../negotiation/scoring";
import type { PolicyDecision } from "./policy-engine";

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

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
const requests = new Map<string, ApprovalRequest>();

function expireIfStale(request: ApprovalRequest, now = Date.now()): ApprovalRequest {
  if (request.status === "PENDING" && now > Date.parse(request.expiresAt)) {
    request.status = "EXPIRED";
    request.audit.push({ at: new Date(now).toISOString(), actor: "system", action: "EXPIRED" });
  }
  return request;
}

export function requestApproval(rfq: RfqMessage, winner: ScoredOffer, decision: PolicyDecision): ApprovalRequest {
  if (decision.outcome !== "REQUIRE_APPROVAL") {
    throw new Error(`Approval not applicable for outcome ${decision.outcome}`);
  }
  const now = new Date();
  const request: ApprovalRequest = {
    id: randomUUID(),
    rfqId: rfq.rfqId,
    supplierId: winner.offer.from,
    unitPrice: winner.offer.unitPrice,
    orderTotal: decision.orderTotal,
    reasons: decision.reasons,
    status: "PENDING",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(),
    audit: [{ at: now.toISOString(), actor: "buyer-agent", action: "REQUESTED", note: decision.reasons.join("; ") }],
  };
  requests.set(request.id, request);
  return request;
}

export function decide(id: string, approver: string, approve: boolean, note?: string): ApprovalRequest {
  const request = requests.get(id);
  if (!request) throw new Error("Approval request not found");
  expireIfStale(request);
  if (request.status !== "PENDING") throw new Error(`Approval already ${request.status}`);
  if (!approver || approver.startsWith("buyer-agent") || approver.startsWith("seller-")) {
    throw new Error("Approver must be a human principal");
  }

  request.status = approve ? "APPROVED" : "REJECTED";
  request.decidedBy = approver;
  request.audit.push({
    at: new Date().toISOString(),
    actor: approver,
    action: approve ? "APPROVED" : "REJECTED",
    note: note?.slice(0, 300),
  });
  return request;
}

export function getApproval(id: string): ApprovalRequest | undefined {
  const request = requests.get(id);
  return request && expireIfStale(request);
}

export function listApprovals(status?: ApprovalStatus): ApprovalRequest[] {
  return [...requests.values()]
    .map((r) => expireIfStale(r))
    .filter((r) => !status || r.status === status);
}