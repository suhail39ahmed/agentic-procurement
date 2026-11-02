import type { OfferMessage, RfqMessage } from "./protocol";
import { scoreOffers, batna } from "./scoring";
import { evaluatePolicy } from "./policy-engine";
import { requestApproval, decide } from "./approvals";
import { issueMandate } from "./mandate";
import { createPaymentOrder, waitForApproval, authorizePayment, capturePayment, voidPayment } from "./payment-tool";

const voidMode = process.argv.includes("--void");
const quantity = process.argv.includes("--small") ? 1 : 5;

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

  await waitForApproval(intent.orderId);
  const authorizationId = await authorizePayment(intent);
  console.log(`Held     ${authorizationId} $${intent.mandate.amount}`);

  if (voidMode) {
    await voidPayment(authorizationId, intent.mandate.jti);
    console.log("Voided   hold released");
  } else {
    const capture = await capturePayment(authorizationId, intent);
    console.log(`Captured ${capture.id} ${capture.status}`);
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});