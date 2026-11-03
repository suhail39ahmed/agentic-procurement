import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PolicyDecision } from "./policy-engine";
import type { ApprovalRequest } from "./approvals";

export type MandateClaims = {
  jti: string;
  rfqId: string;
  supplierId: string;
  amount: string;
  currency: "USD";
  approvedBy: string;
  iat: number;
  exp: number;
};

const MANDATE_TTL_SECONDS = 15 * 60;
const usedMandates = new Set<string>();

function secret(): Buffer {
  const value = process.env.MANDATE_SECRET;
  if (!value || value.length < 32) throw new Error("MANDATE_SECRET must be at least 32 characters");
  return Buffer.from(value);
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function issueMandate(
  rfqId: string,
  decision: PolicyDecision,
  approval?: ApprovalRequest
): string {
  if (decision.outcome === "DENY") throw new Error("Cannot issue mandate for a denied decision");
  if (decision.outcome === "REQUIRE_APPROVAL") {
    if (!approval || approval.status !== "APPROVED" || !approval.decidedBy) {
      throw new Error("Approval required before issuing mandate");
    }
    if (approval.rfqId !== rfqId || approval.supplierId !== decision.supplierId || approval.orderTotal !== decision.orderTotal) {
      throw new Error("Approval does not match decision");
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const claims: MandateClaims = {
    jti: randomUUID(),
    rfqId,
    supplierId: decision.supplierId,
    amount: decision.orderTotal.toFixed(2),
    currency: "USD",
    approvedBy: approval?.decidedBy ?? "policy:auto",
    iat: now,
    exp: now + MANDATE_TTL_SECONDS,
  };

  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode(claims);
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function verifyMandate(
  token: string,
  expected: { rfqId: string; supplierId: string; amount: string }
): MandateClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed mandate");
  const [header, payload, signature] = parts;

  const expectedSig = Buffer.from(sign(`${header}.${payload}`));
  const actualSig = Buffer.from(signature);
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    throw new Error("Invalid mandate signature");
  }

  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as MandateClaims;
  if (Math.floor(Date.now() / 1000) > claims.exp) throw new Error("Mandate expired");
  if (claims.rfqId !== expected.rfqId) throw new Error("Mandate RFQ mismatch");
  if (claims.supplierId !== expected.supplierId) throw new Error("Mandate supplier mismatch");
  if (claims.amount !== expected.amount) throw new Error("Mandate amount mismatch");
  if (usedMandates.has(claims.jti)) throw new Error("Mandate already used");

  usedMandates.add(claims.jti);
  return claims;
}