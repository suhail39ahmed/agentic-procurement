import { paypalRequest } from "paypal";
import { verifyMandate, type MandateClaims } from "./mandate";

type Link = { href: string; rel: string };
type Order = { id: string; status: string; links?: Link[] };
type AuthorizeResponse = {
  purchase_units?: { payments?: { authorizations?: { id: string; status: string; amount: { value: string } }[] } }[];
};
type Capture = { id: string; status: string; amount?: { value: string } };

export type PaymentIntent = {
  orderId: string;
  approveUrl: string;
  mandate: MandateClaims;
};

const SANDBOX_ONLY = () => {
  if (process.env.PAYPAL_ENV === "live") throw new Error("Payment tool is restricted to sandbox");
};

export async function createPaymentOrder(
  mandateToken: string,
  expected: { rfqId: string; supplierId: string; amount: string }
): Promise<PaymentIntent> {
  SANDBOX_ONLY();
  const mandate = verifyMandate(mandateToken, expected);

  const order = await paypalRequest<Order>("/v2/checkout/orders", {
    method: "POST",
    requestId: `order-${mandate.jti}`,
    body: {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: mandate.rfqId,
          custom_id: mandate.jti,
          description: `Procurement ${mandate.rfqId} from ${mandate.supplierId}`.slice(0, 127),
          amount: { currency_code: mandate.currency, value: mandate.amount },
        },
      ],
    },
  });

  const approveUrl = order.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
  if (!approveUrl) throw new Error("PayPal order has no approval link");
  return { orderId: order.id, approveUrl, mandate };
}

export async function waitForApproval(orderId: string, timeoutMs = 5 * 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const order = await paypalRequest<Order>(`/v2/checkout/orders/${orderId}`);
    if (order.status === "APPROVED") return;
    if (["COMPLETED", "VOIDED", "CANCELLED"].includes(order.status)) {
      throw new Error(`Order ended with status ${order.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Timed out waiting for payer approval");
}

export async function authorizePayment(intent: PaymentIntent): Promise<string> {
  SANDBOX_ONLY();
  const result = await paypalRequest<AuthorizeResponse>(`/v2/checkout/orders/${intent.orderId}/authorize`, {
    method: "POST",
    requestId: `auth-${intent.mandate.jti}`,
    body: {},
  });
  const auth = result.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error("No authorization returned");
  if (auth.amount.value !== intent.mandate.amount) {
    await voidPayment(auth.id, intent.mandate.jti);
    throw new Error(`Authorized amount ${auth.amount.value} differs from mandate ${intent.mandate.amount}; voided`);
  }
  return auth.id;
}

export async function capturePayment(authorizationId: string, intent: PaymentIntent): Promise<Capture> {
  SANDBOX_ONLY();
  return paypalRequest<Capture>(`/v2/payments/authorizations/${authorizationId}/capture`, {
    method: "POST",
    requestId: `capture-${intent.mandate.jti}`,
    body: { amount: { currency_code: intent.mandate.currency, value: intent.mandate.amount }, final_capture: true },
  });
}

export async function voidPayment(authorizationId: string, jti: string): Promise<void> {
  await paypalRequest(`/v2/payments/authorizations/${authorizationId}/void`, {
    method: "POST",
    requestId: `void-${jti}`,
    body: {},
  });
}