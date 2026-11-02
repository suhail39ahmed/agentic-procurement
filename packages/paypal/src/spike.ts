import { paypalRequest } from "./client";

const voidMode = process.argv.includes("--void");

type Order = {
  id: string;
  status: string;
  links?: { href: string; rel: string; method: string }[];
};

function approveLink(order: Order): string | undefined {
  return order.links?.find(
    (l) => l.rel === "approve" || l.rel === "payer-action"
  )?.href;
}

async function waitUntilApproved(orderId: string, timeoutMs = 5 * 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const order = await paypalRequest<Order>(`/v2/checkout/orders/${orderId}`);
    if (order.status === "APPROVED") return order;
    if (
      order.status === "COMPLETED" ||
      order.status === "VOIDED" ||
      order.status === "CANCELLED"
    ) {
      throw new Error(`Order ended with status ${order.status}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Timed out waiting for buyer approval");
}

async function main() {
  const order = await paypalRequest<Order>("/v2/checkout/orders", {
    method: "POST",
    requestId: `spike-${voidMode ? "void" : "cap"}-${Date.now()}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value: "0.50" },
        },
      ],
    },
  });

  console.log(`Order ${order.id} status ${order.status}`);
  const url = approveLink(order);
  if (!url) throw new Error("No approve link on order");

  console.log("\nOpen this link and log in as SANDBOX BUYER:");
  console.log(`  email: ${process.env.OWNER_BUYER_EMAIL || "owner-buyer@business.example.com"}`);
  console.log("  password: see PAYPAL_SANDBOX_PASSWORD in your .env");
  console.log(url);
  console.log("\nWaiting for PayPal to show order APPROVED (no Enter needed)...");
  console.log("After you click Pay / Agree, leave the localhost error page — that's OK.\n");

  const approved = await waitUntilApproved(order.id);
  console.log(`Order ${approved.id} status ${approved.status}`);

  const authRes = await paypalRequest<{
    purchase_units?: {
      payments?: { authorizations?: { id: string; status: string }[] };
    }[];
  }>(`/v2/checkout/orders/${order.id}/authorize`, {
    method: "POST",
    requestId: `spike-auth-${order.id}`,
    body: {},
  });

  const auth = authRes.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth?.id) throw new Error("No authorization id after authorize");
  console.log(`Authorized (funds held): ${auth.id} (${auth.status})`);

  if (voidMode) {
    await paypalRequest(`/v2/payments/authorizations/${auth.id}/void`, {
      method: "POST",
      requestId: `spike-void-${auth.id}`,
      body: {},
    });
    console.log("Voided: { status: 204 }");
  } else {
    const captured = await paypalRequest<{ id: string; status: string }>(
      `/v2/payments/authorizations/${auth.id}/capture`,
      {
        method: "POST",
        requestId: `spike-capture-${auth.id}`,
        body: {
          amount: { currency_code: "USD", value: "0.50" },
        },
      }
    );
    console.log(`Captured: ${captured.id} ${captured.status}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});