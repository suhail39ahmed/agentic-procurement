import {
    createOrder,
    transition,
    canTransition,
    isTerminal,
    InvalidTransitionError,
    type Order,
    type OrderEvent,
  } from "../orders/order-state";
  
  function show(order: Order): void {
    console.log(`  ${order.status}${isTerminal(order.status) ? " (terminal)" : ""}`);
  }
  
  function expectReject(order: Order, event: OrderEvent): void {
    try {
      transition(order, event, "test");
      console.log(`  FAIL: ${event} from ${order.status} was allowed`);
      process.exitCode = 1;
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        console.log(`  blocked: ${err.message}`);
      } else {
        throw err;
      }
    }
  }
  
  const base = { rfqId: "rfq-demo", supplierId: "seller-c", amount: 2.5, currency: "USD" };
  
  console.log("Happy path");
  let a = createOrder({ id: "ord-1", ...base });
  show(a);
  a = transition(a, "REQUIRE_APPROVAL", "policy-engine");
  show(a);
  a = transition(a, "APPROVE", "owner-demo");
  show(a);
  a = transition(a, "AUTHORIZE", "payment-tool", { paypalOrderId: "PP-ORDER", authorizationId: "PP-AUTH" });
  show(a);
  a = transition(a, "SHIP", "seller-c");
  show(a);
  a = transition(a, "CAPTURE", "payment-tool", { captureId: "PP-CAPTURE" });
  show(a);
  a = transition(a, "REFUND", "owner-demo", {}, "damaged item");
  show(a);
  
  console.log("\nVoid path");
  let b = createOrder({ id: "ord-2", ...base });
  b = transition(b, "APPROVE", "policy-engine");
  b = transition(b, "AUTHORIZE", "payment-tool");
  b = transition(b, "EXPIRE", "scheduler");
  show(b);
  
  console.log("\nIllegal moves");
  expectReject(b, "CAPTURE");
  expectReject(createOrder({ id: "ord-3", ...base }), "CAPTURE");
  expectReject(createOrder({ id: "ord-4", ...base }), "REFUND");
  expectReject(a, "VOID");
  
  console.log(`\ncanTransition(HELD, CAPTURE) = ${canTransition("HELD", "CAPTURE")}`);
  console.log(`canTransition(VOIDED, CAPTURE) = ${canTransition("VOIDED", "CAPTURE")}`);
  
  console.log("\nAudit trail for ord-1");
  for (const h of a.history) {
    console.log(`  ${h.from} -> ${h.to} via ${h.event} by ${h.actor}${h.note ? ` (${h.note})` : ""}`);
  }