import type { RfqMessage } from "../negotiation/protocol";
import type { ScoredOffer } from "../negotiation/scoring";

export type PolicyConfig = {
  maxOrderTotal: number;
  approvalThreshold: number;
  maxPerSupplierTotal: Record<string, number>;
  blockedSuppliers: string[];
};

export type PolicyOutcome = "ALLOW" | "REQUIRE_APPROVAL" | "DENY";

export type PolicyDecision = {
  outcome: PolicyOutcome;
  reasons: string[];
  orderTotal: number;
  supplierId: string;
  evaluatedAt: string;
};

export const DEFAULT_POLICY: PolicyConfig = {
  maxOrderTotal: Number(process.env.POLICY_MAX_ORDER_TOTAL ?? 10_000),
  // Totals above this require human approval (ALLOW below).
  approvalThreshold: Number(process.env.POLICY_APPROVAL_THRESHOLD ?? 250),
  maxPerSupplierTotal: {},
  blockedSuppliers: [],
};

const roundCents = (value: number) => Math.round(value * 100) / 100;

export function evaluatePolicy(
  rfq: RfqMessage,
  candidate: ScoredOffer,
  policy: PolicyConfig = DEFAULT_POLICY
): PolicyDecision {
  const quantity = rfq.items.reduce((n, i) => n + i.quantity, 0);
  const orderTotal = roundCents(candidate.offer.unitPrice * quantity);
  const supplierId = candidate.offer.from;
  const deny: string[] = [];
  const review: string[] = [];

  if (policy.blockedSuppliers.includes(supplierId)) deny.push(`Supplier ${supplierId} is blocked`);
  if (candidate.offer.currency !== rfq.currency) deny.push("Currency mismatch");
  if (!candidate.withinBudget) deny.push(`Unit price $${candidate.offer.unitPrice} exceeds max $${rfq.maxUnitPrice}`);
  if (!candidate.meetsDeadline) deny.push(`Lead time ${candidate.offer.leadTimeDays}d exceeds ${rfq.neededByDays}d`);
  if (orderTotal > policy.maxOrderTotal) deny.push(`Order total $${orderTotal} exceeds hard cap $${policy.maxOrderTotal}`);

  const supplierCap = policy.maxPerSupplierTotal[supplierId];
  if (supplierCap !== undefined && orderTotal > supplierCap) {
    deny.push(`Order total $${orderTotal} exceeds ${supplierId} cap $${supplierCap}`);
  }

  if (orderTotal > policy.approvalThreshold) {
    review.push(`Order total $${orderTotal} exceeds approval threshold $${policy.approvalThreshold}`);
  }

  const outcome: PolicyOutcome = deny.length > 0 ? "DENY" : review.length > 0 ? "REQUIRE_APPROVAL" : "ALLOW";

  return {
    outcome,
    reasons: deny.length > 0 ? deny : review,
    orderTotal,
    supplierId,
    evaluatedAt: new Date().toISOString(),
  };
}