import { randomUUID } from "node:crypto";
import { evaluatePolicy } from "../governance/policy-engine";
import { requestApproval, decide } from "../governance/approvals";
import { issueMandate, verifyMandate } from "../governance/mandate";
import { applyWebhookEvent, saveOrder, getOrder } from "../orders/ledger";
import { createOrder, transition } from "../orders/order-state";
import { closeDatabase } from "db";
import type { RfqMessage } from "../negotiation/protocol";
import type { ScoredOffer } from "../negotiation/scoring";

const failures: string[] = [];
function assert(cond: unknown, message: string) {
  if (!cond) {
    failures.push(message);
    console.error(`FAIL ${message}`);
  } else {
    console.log(`PASS ${message}`);
  }
}

function rfq(quantity: number): RfqMessage {
  return {
    type: "RFQ",
    rfqId: `rfq-${randomUUID()}`,
    from: "buyer",
    to: "*",
    round: 0,
    sentAt: new Date().toISOString(),
    items: [{ sku: "CHAIR-ERGO", description: "Ergonomic office chair", quantity }],
    maxUnitPrice: 1,
    currency: "USD",
    neededByDays: 30,
  };
}

function scored(rfqId: string, unitPrice: number): ScoredOffer {
  return {
    offer: {
      type: "OFFER",
      rfqId,
      from: "seller-b",
      to: "buyer",
      round: 1,
      sentAt: new Date().toISOString(),
      unitPrice,
      currency: "USD",
      leadTimeDays: 18,
      validForHours: 48,
      message: "",
    },
    score: 1,
    priceScore: 1,
    speedScore: 1,
    withinBudget: true,
    meetsDeadline: true,
  };
}

async function policyAndApprovals() {
  console.log("\n== policy $2 / $10");
  const small = rfq(1);
  const smallDecision = evaluatePolicy(small, scored(small.rfqId, 0.5));
  assert(smallDecision.outcome === "ALLOW", `qty1 * $0.50 ALLOW, got ${smallDecision.outcome} $${smallDecision.orderTotal}`);
  assert(smallDecision.orderTotal === 0.5, "small orderTotal stays dollars");

  const review = rfq(5);
  const reviewDecision = evaluatePolicy(review, scored(review.rfqId, 0.5));
  assert(reviewDecision.outcome === "REQUIRE_APPROVAL", `qty5 * $0.50 needs approval, got ${reviewDecision.outcome}`);
  assert(reviewDecision.orderTotal === 2.5, "review total $2.50");

  const pending = await requestApproval(review, scored(review.rfqId, 0.5), reviewDecision);
  try {
    await decide(pending.id, "buyer-agent", true);
    assert(false, "buyer-agent must not approve");
  } catch (err) {
    assert((err as Error).message.includes("human principal"), "self-approval blocked");
  }
  const approved = await decide(pending.id, "owner@company.com", true, "ok");
  assert(approved.status === "APPROVED", "owner approval recorded");
  assert(approved.orderTotal === 2.5, "approval orderTotal dollars");
  return { review, reviewDecision, approved };
}

async function mandates(review: RfqMessage, reviewDecision: ReturnType<typeof evaluatePolicy>, approved: Awaited<ReturnType<typeof decide>>) {
  console.log("\n== mandate HMAC / bind / consume");
  process.env.MANDATE_SECRET ??= "test_secret_at_least_32_characters_long_for_hmac_256";

  try {
    await issueMandate(review.rfqId, reviewDecision);
    assert(false, "mandate without approval must fail");
  } catch (err) {
    assert((err as Error).message.includes("Approval required"), "approval required before mandate");
  }

  const token = await issueMandate(review.rfqId, reviewDecision, approved);
  const expected = { rfqId: review.rfqId, supplierId: "seller-b", amount: "2.50" };
  const claims = await verifyMandate(token, expected);
  assert(claims.amount === "2.50", "mandate amount string dollars");
  try {
    await verifyMandate(token, expected);
    assert(false, "replay must fail");
  } catch (err) {
    assert((err as Error).message === "Mandate already used", `replay blocked: ${(err as Error).message}`);
  }

  const token2 = await issueMandate(review.rfqId, reviewDecision, approved);
  try {
    await verifyMandate(token2, { ...expected, amount: "500.00" });
    assert(false, "amount mismatch must fail");
  } catch (err) {
    assert((err as Error).message === "Mandate amount mismatch", "amount bind");
  }
  try {
    await verifyMandate(token2, { ...expected, rfqId: "other" });
    assert(false, "rfq mismatch must fail");
  } catch (err) {
    assert((err as Error).message === "Mandate RFQ mismatch", "rfq bind");
  }
  try {
    await verifyMandate(token2, { ...expected, supplierId: "seller-a" });
    assert(false, "supplier mismatch must fail");
  } catch (err) {
    assert((err as Error).message === "Mandate supplier mismatch", "supplier bind");
  }
  const tampered = token2.slice(0, -4) + "abcd";
  try {
    await verifyMandate(tampered, expected);
    assert(false, "HMAC mismatch must fail");
  } catch (err) {
    assert((err as Error).message === "Invalid mandate signature", "HMAC");
  }
  await verifyMandate(token2, expected);
}

async function webhooks() {
  console.log("\n== webhook projection");
  const id = `mandate-${randomUUID()}`;
  let order = createOrder({ id, rfqId: "rfq-wh", supplierId: "seller-b", amount: 2.5, currency: "USD", paypalOrderId: "PP-1" });
  order = transition(order, "APPROVE", "policy-engine");
  await saveOrder(order);

  const auth = await applyWebhookEvent({
    id: `WH-${randomUUID()}`,
    event_type: "PAYMENT.AUTHORIZATION.CREATED",
    resource: { id: "AUTH-1", custom_id: id, amount: { value: "2.50" } },
  });
  assert(auth.outcome === "APPLIED", `auth applied, got ${auth.outcome} ${auth.reason}`);

  const dup = await applyWebhookEvent({
    id: auth.eventId,
    event_type: "PAYMENT.AUTHORIZATION.CREATED",
    resource: { id: "AUTH-1", custom_id: id, amount: { value: "2.50" } },
  });
  assert(dup.outcome === "SKIPPED", `duplicate skipped, got ${dup.outcome}`);

  const mismatch = await applyWebhookEvent({
    id: `WH-${randomUUID()}`,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: { id: "CAP-X", custom_id: id, amount: { value: "500.00" } },
  });
  assert(mismatch.outcome === "REJECTED", `amount mismatch rejected, got ${mismatch.outcome}`);
  assert((await getOrder(id))?.status === "HELD", "mismatch does not capture");

  const eventId = `WH-${randomUUID()}`;
  const payload = {
    id: eventId,
    event_type: "PAYMENT.CAPTURE.COMPLETED" as const,
    resource: { id: "CAP-1", custom_id: id, amount: { value: "2.50" } },
  };
  const concurrent = await Promise.all([applyWebhookEvent(payload), applyWebhookEvent(payload)]);
  const applied = concurrent.filter((e) => e.outcome === "APPLIED").length;
  const skipped = concurrent.filter((e) => e.outcome === "SKIPPED").length;
  assert(applied === 1 && skipped === 1, `concurrent webhook one apply one skip, got ${concurrent.map((e) => e.outcome).join(",")}`);
  assert((await getOrder(id))?.status === "CAPTURED", "captured after matching amount");
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  process.env.MANDATE_SECRET ??= "test_secret_at_least_32_characters_long_for_hmac_256";
  const { review, reviewDecision, approved } = await policyAndApprovals();
  await mandates(review, reviewDecision, approved);
  await webhooks();
  await closeDatabase();
  if (failures.length > 0) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll domain persistence tests passed");
}

main().catch(async (err) => {
  console.error(err);
  await closeDatabase().catch(() => undefined);
  process.exit(1);
});
