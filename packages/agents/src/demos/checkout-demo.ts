import type { OfferMessage, RfqMessage } from "../negotiation/protocol";
import { scoreOffers, batna } from "../negotiation/scoring";
import { evaluatePolicy } from "../governance/policy-engine";
import { requestApproval, decide } from "../governance/approvals";
import { issueMandate } from "../governance/mandate";
import { createPaymentOrder, waitForApproval, authorizePayment, voidPayment } from "../payments/payment-tool";
import { createOrder, transition } from "../orders/order-state";
import { refundPayment } from "../payments/payment-tool";
import { markShipped, confirmDelivery } from "../payments/fulfillment";

const voidMode = process.argv.includes("--void");
const quantity = process.argv.includes("--small") ? 1 : 5;
const refundMode = process.argv.includes("--refund");

const rfq: RfqMessage = {
  type: "RFQ",
  rfqId: `rfq-${Date.now()}`,
  from: "buyer",
  to: "*",
  round: 0,
  sentAt: new Date().toISOString(),
  items: [{ sku: "CHAIR-ERGO", description: "Ergonomic office chair", quantity }],
  maxUnitPrice: 1,
  currency: "USD",
  neededByDays: 30,
};

const offer: OfferMessage = {
  type: "OFFER",
  rfqId: rfq.rfqId,
  from: "seller-b",
  to: "buyer",
  round: 1,
  sentAt: new Date().toISOString(),
  unitPrice: 0.5,
  currency: "USD",
  leadTimeDays: 18,
  validForHours: 48,
  message: "",
};

async function main() {
  const winner = batna(scoreOffers(rfq, [offer]));
  if (!winner) throw new Error("No eligible offer");

  const decision = evaluatePolicy(rfq, winner);
  console.log(`Policy   ${decision.outcome} ${decision.supplierId} $${decision.orderTotal.toFixed(2)}`);
  if (decision.outcome === "DENY") throw new Error(decision.reasons.join("; "));

  let approval;
  if (decision.outcome === "REQUIRE_APPROVAL") {
    approval = requestApproval(rfq, winner, decision);
    approval = decide(approval.id, "owner@company.com", true, "Approved in checkout demo");
    console.log(`Approval ${approval.status} by ${approval.decidedBy}`);
  }

  const token = issueMandate(rfq.rfqId, decision, approval);
  const expected = { rfqId: rfq.rfqId, supplierId: decision.supplierId, amount: decision.orderTotal.toFixed(2) };

  try {
    await createPaymentOrder(token, { ...expected, amount: "500.00" });
  } catch (err) {
    console.log(`Tamper   blocked: ${(err as Error).message}`);
  }

  const intent = await createPaymentOrder(issueMandate(rfq.rfqId, decision, approval), expected);
  console.log(`Mandate  ${intent.mandate.jti} approvedBy ${intent.mandate.approvedBy}`);
  console.log(`Order    ${intent.orderId}`);
  console.log(`\nApprove as the sandbox buyer:\n${intent.approveUrl}\n`);

  let order = createOrder({
    id: intent.mandate.jti,
    rfqId: rfq.rfqId,
    supplierId: decision.supplierId,
    amount: decision.orderTotal,
    currency: "USD",
    paypalOrderId: intent.orderId,
  });
  order = transition(order, approval ? "REQUIRE_APPROVAL" : "APPROVE", "policy-engine");
  if (approval) order = transition(order, "APPROVE", approval.decidedBy ?? "owner");

  await waitForApproval(intent.orderId);
  const authorizationId = await authorizePayment(intent);
  order = transition(order, "AUTHORIZE", "payment-tool", {
    authorizationId,
    heldAt: new Date().toISOString(),
    deliverBy: new Date(Date.now() + rfq.neededByDays * 86_400_000).toISOString(),
  });
  console.log(`Held     ${authorizationId} $${intent.mandate.amount}`);

  if (voidMode) {
    await voidPayment(authorizationId, intent.mandate.jti);
    order = transition(order, "VOID", "owner");
    console.log("Voided   hold released");
  } else {
    try { markShipped(order, "seller-x", "UPS", "1Z999AA10123456784"); }
    catch (err) { console.log(`Ship     blocked: ${(err as Error).message}`); }
    order = markShipped(order, decision.supplierId, "UPS", "1Z999AA10123456784");
    console.log(`Shipped  ${order.tracking?.carrier} ${order.tracking?.number}`);
    order = await confirmDelivery(order, intent, "owner@company.com");
    console.log(`Captured ${order.captureId} on delivery`);
    if (refundMode) {
      try {
        await refundPayment(order, "owner", "over-limit test", order.amount + 1);
      } catch (err) {
        console.log(`Overrefund blocked: ${(err as Error).message}`);
      }
      const result = await refundPayment(order, "owner", "Demo refund");
      order = result.order;
      console.log(`Refunded ${result.refund.id} ${result.refund.status}`);
    }
  }

  console.log(`\nFinal    ${order.status}`);
  for (const h of order.history) console.log(`  ${h.from} -> ${h.to} via ${h.event} by ${h.actor}${h.note ? ` (${h.note})` : ""}`);
}
main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});