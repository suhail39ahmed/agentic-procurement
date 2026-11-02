import type { OfferMessage, RfqMessage } from "./protocol";
import { scoreOffers, batna } from "./scoring";
import { evaluatePolicy, DEFAULT_POLICY, type PolicyConfig } from "./policy-engine";
import { requestApproval, decide, listApprovals } from "./approvals";

const baseRfq: RfqMessage = {
  type: "RFQ",
  rfqId: "rfq-policy-demo",
  from: "buyer",
  to: "*",
  round: 0,
  sentAt: new Date().toISOString(),
  items: [{ sku: "CHAIR-ERGO", description: "Ergonomic office chair", quantity: 5 }],
  maxUnitPrice: 1,
  currency: "USD",
  neededByDays: 30,
};

const offer = (from: string, unitPrice: number, leadTimeDays: number): OfferMessage => ({
  type: "OFFER",
  rfqId: baseRfq.rfqId,
  from,
  to: "buyer",
  round: 1,
  sentAt: new Date().toISOString(),
  unitPrice,
  currency: "USD",
  leadTimeDays,
  validForHours: 48,
  message: "",
});

function run(label: string, rfq: RfqMessage, offers: OfferMessage[], policy: PolicyConfig = DEFAULT_POLICY) {
  const winner = batna(scoreOffers(rfq, offers));
  console.log(`\n== ${label}`);
  if (!winner) {
    console.log("No eligible offer");
    return;
  }
  const decision = evaluatePolicy(rfq, winner, policy);
  console.log(`${decision.outcome} ${decision.supplierId} $${decision.orderTotal}`);
  for (const reason of decision.reasons) console.log(`  - ${reason}`);

  if (decision.outcome === "REQUIRE_APPROVAL") {
    const request = requestApproval(rfq, winner, decision);
    console.log(`Pending approval ${request.id}`);

    try {
      decide(request.id, "buyer-agent", true);
    } catch (err) {
      console.log(`Self-approval blocked: ${(err as Error).message}`);
    }

    const approved = decide(request.id, "owner@company.com", true, "Needed for Monday onboarding");
    console.log(`${approved.status} by ${approved.decidedBy}`);

    try {
      decide(request.id, "owner@company.com", true);
    } catch (err) {
      console.log(`Replay blocked: ${(err as Error).message}`);
    }
  }

  if (decision.outcome !== "DENY") console.log("Ready to authorize on PayPal");
}

run("Small order auto-allowed", { ...baseRfq, items: [{ ...baseRfq.items[0], quantity: 1 }] }, [offer("seller-b", 0.5, 18)]);
run("Large order needs approval", baseRfq, [offer("seller-b", 0.5, 18), offer("seller-a", 0.6, 14)]);
run("Blocked supplier denied", baseRfq, [offer("seller-b", 0.5, 18)], { ...DEFAULT_POLICY, blockedSuppliers: ["seller-b"] });
run("Supplier cap denied", baseRfq, [offer("seller-b", 0.5, 18)], { ...DEFAULT_POLICY, maxPerSupplierTotal: { "seller-b": 2 } });

console.log("\nAudit trail");
for (const request of listApprovals()) {
  for (const entry of request.audit) {
    console.log(`  ${entry.at} ${entry.actor.padEnd(18)} ${entry.action}${entry.note ? `  ${entry.note}` : ""}`);
  }
}