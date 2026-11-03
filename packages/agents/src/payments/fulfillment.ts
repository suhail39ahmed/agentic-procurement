import { paypalRequest } from "paypal";
import { transition, type Order } from "../orders/order-state";
import { capturePayment, type PaymentIntent } from "./payment-tool";

const CARRIER = /^[A-Z0-9_]{2,40}$/;
const TRACKING = /^[A-Za-z0-9-]{4,64}$/;

export function markShipped(order: Order, sellerId: string, carrier: string, number: string): Order {
  if (sellerId !== order.supplierId) throw new Error(`Only ${order.supplierId} can ship this order`);
  if (!CARRIER.test(carrier) || !TRACKING.test(number)) throw new Error("Invalid carrier or tracking number");
  return transition(order, "SHIP", sellerId, { tracking: { carrier, number } }, `${carrier} ${number}`);
}

export async function confirmDelivery(order: Order, intent: PaymentIntent, confirmedBy: string): Promise<Order> {
  if (confirmedBy === order.supplierId || confirmedBy.startsWith("seller-")) throw new Error("Seller cannot confirm own delivery");
  if (!order.authorizationId || !order.paypalOrderId || !order.tracking) throw new Error("Order is not ready for capture");

  const capture = await capturePayment(order.authorizationId, intent);
  if (capture.status !== "COMPLETED") throw new Error(`Capture ended with status ${capture.status}`);
  let next = transition(order, "CAPTURE", confirmedBy, { captureId: capture.id }, "delivery confirmed");

  try {
    await paypalRequest(`/v2/checkout/orders/${order.paypalOrderId}/track`, {
      method: "POST",
      requestId: `track-${order.id}`,
      body: {
        capture_id: capture.id,
        tracking_number: order.tracking.number,
        carrier: order.tracking.carrier,
        notify_payer: false,
      },
    });
  } catch (err) {
    const last = next.history[next.history.length - 1];
    next = { ...next, history: [...next.history.slice(0, -1), { ...last, note: `delivery confirmed; tracking sync failed: ${(err as Error).message}` }] };
  }
  return next;
}