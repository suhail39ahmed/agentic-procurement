import { createOrder, transition } from "../orders/order-state";
import { applyWebhookEvent, saveOrder, getOrder, listDisputes, type PayPalWebhookEvent } from "../orders/ledger";

const JTI = "mandate-ledger-demo";
let order = createOrder({ id: JTI, rfqId: "rfq-ledger", supplierId: "seller-b", amount: 2.5, currency: "USD", paypalOrderId: "PP-ORDER-1" });
order = transition(order, "APPROVE", "policy-engine");
saveOrder(order);

const auth: PayPalWebhookEvent = {
  id: "WH-1",
  event_type: "PAYMENT.AUTHORIZATION.CREATED",
  resource: { id: "AUTH-1", status: "CREATED", custom_id: JTI, amount: { value: "2.50" } },
};
const badCapture: PayPalWebhookEvent = {
  id: "WH-2",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: "CAP-X", status: "COMPLETED", custom_id: JTI, amount: { value: "500.00" } },
};
const capture: PayPalWebhookEvent = {
  id: "WH-3",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: "CAP-1", status: "COMPLETED", custom_id: JTI, amount: { value: "2.50" } },
};
const resentCapture: PayPalWebhookEvent = { ...capture, id: "WH-3-RESEND" };
const lateVoid: PayPalWebhookEvent = {
  id: "WH-4",
  event_type: "PAYMENT.AUTHORIZATION.VOIDED",
  resource: { id: "AUTH-1", status: "VOIDED", custom_id: JTI },
};
const dispute: PayPalWebhookEvent = {
  id: "WH-5",
  event_type: "CUSTOMER.DISPUTE.CREATED",
  resource: { dispute_id: "PP-D-1", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "OPEN", dispute_amount: { value: "2.50" }, disputed_transactions: [{ seller_transaction_id: "CAP-1" }] },
};
const refund: PayPalWebhookEvent = {
  id: "WH-6",
  event_type: "PAYMENT.CAPTURE.REFUNDED",
  resource: { id: "REF-1", status: "COMPLETED", links: [{ rel: "up", href: "https://api.sandbox.paypal.com/v2/payments/captures/CAP-1" }] },
};
const unknown: PayPalWebhookEvent = { id: "WH-7", event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "PP-ORDER-1" } };
const stranger: PayPalWebhookEvent = {
  id: "WH-8",
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: { id: "CAP-OTHER", custom_id: "someone-else", amount: { value: "1.00" } },
};

const stream = [auth, auth, badCapture, capture, resentCapture, lateVoid, dispute, refund, unknown, stranger];

function run(label: string, expected: string[]): boolean {
  console.log(label);
  const outcomes = stream.map((e) => {
    const r = applyWebhookEvent(e);
    console.log(`  ${e.id.padEnd(12)} ${e.event_type.padEnd(30)} ${r.outcome.padEnd(9)} ${r.reason}`);
    return r.outcome;
  });
  const ok = JSON.stringify(outcomes) === JSON.stringify(expected);
  console.log(`  final ${getOrder(JTI)?.status}, history ${getOrder(JTI)?.history.length}\n`);
  return ok;
}

const first = run("First delivery", ["APPLIED", "SKIPPED", "REJECTED", "APPLIED", "SKIPPED", "REJECTED", "APPLIED", "APPLIED", "IGNORED", "UNMATCHED"]);
const replay = run("Full replay", Array(stream.length).fill("SKIPPED"));

const final = getOrder(JTI)!;
const pass = first && replay && final.status === "REFUNDED" && final.history.length === 4 && listDisputes().length === 1;
console.log(`Disputes: ${listDisputes().map((d) => `${d.disputeId} ${d.reason} order=${d.orderId}`).join(", ")}`);
console.log(pass ? "All ledger checks passed" : "FAIL ledger checks");
if (!pass) process.exitCode = 1;