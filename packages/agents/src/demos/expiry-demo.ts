import { createOrder, transition, type Order } from "../orders/order-state";
import { sweepExpired, type ExpiryDeps } from "../payments/expiry";

const DAY_MS = 86_400_000;
const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY_MS).toISOString();
const daysAhead = (n: number) => new Date(now.getTime() + n * DAY_MS).toISOString();

const calls: string[] = [];
const fakeDeps: ExpiryDeps = {
  async voidAuthorization(order) {
    calls.push(`void ${order.authorizationId}`);
  },
  async reauthorize(order) {
    if (order.id === "ord-flaky") throw new Error("PayPal unavailable");
    calls.push(`reauthorize ${order.authorizationId}`);
    return `${order.authorizationId}-R`;
  },
};

function held(id: string, heldDaysAgo: number, deliverInDays: number, extra: Partial<Order> = {}): Order {
  let order = createOrder({ id, rfqId: `rfq-${id}`, supplierId: "seller-b", amount: 2.5, currency: "USD" });
  order = transition(order, "APPROVE", "policy-engine");
  return transition(order, "AUTHORIZE", "payment-tool", {
    authorizationId: `AUTH-${id}`,
    heldAt: daysAgo(heldDaysAgo),
    deliverBy: deliverInDays >= 0 ? daysAhead(deliverInDays) : daysAgo(-deliverInDays),
    ...extra,
  });
}

const orders: Order[] = [
  held("ord-fresh", 1, 10),
  held("ord-late", 2, -1),
  held("ord-day4", 4, 10),
  held("ord-reauthed", 5, 10, { reauthorizedAt: daysAgo(1) }),
  transition(held("ord-old-shipped", 28, -2), "SHIP", "seller-b", { tracking: { carrier: "UPS", number: "1Z999AA10123456784" } }),
  held("ord-flaky", 4, 10),
];

async function main() {
  const results = await sweepExpired(orders, now, fakeDeps);
  const touched = new Set(results.map((r) => r.orderId));

  for (const o of orders) {
    const r = results.find((x) => x.orderId === o.id);
    const line = r
      ? `${r.action.padEnd(22)} ${o.status} -> ${r.order.status}${r.error ? `  error: ${r.error}` : ""}`
      : `${"NONE".padEnd(22)} ${o.status}`;
    console.log(`${o.id.padEnd(16)} ${line}`);
  }

  console.log(`\nPayPal calls (fake): ${calls.join(", ") || "none"}`);
  console.log(`Untouched: ${orders.filter((o) => !touched.has(o.id)).map((o) => o.id).join(", ")}`);

  const expected: Record<string, string> = {
    "ord-late": "VOIDED",
    "ord-day4": "HELD",
    "ord-old-shipped": "VOIDED",
    "ord-flaky": "HELD",
  };
  const failures = Object.entries(expected).filter(([id, status]) => results.find((r) => r.orderId === id)?.order.status !== status);
  if (touched.has("ord-fresh") || touched.has("ord-reauthed")) failures.push(["untouched", "violated"]);
  console.log(failures.length ? `\nFAIL ${JSON.stringify(failures)}` : "\nAll expiry checks passed");
  if (failures.length) process.exitCode = 1;
}

main();