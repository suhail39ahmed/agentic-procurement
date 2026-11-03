import { paypalRequest } from "paypal";
import { transition, type Order } from "../orders/order-state";
import { voidPayment } from "./payment-tool";

const DAY_MS = 86_400_000;
export const HONOR_PERIOD_DAYS = 3;
export const MAX_AUTH_DAYS = 29;
const SAFETY_DAYS = 1;

export type ExpiryAction = "VOID_MISSED_DEADLINE" | "VOID_AUTH_EXPIRING" | "REAUTHORIZE" | "NONE";

export interface ExpiryDeps {
  voidAuthorization(order: Order): Promise<void>;
  reauthorize(order: Order): Promise<string>;
}

export interface SweepResult {
  orderId: string;
  action: ExpiryAction;
  order: Order;
  error?: string;
}

export const paypalExpiryDeps: ExpiryDeps = {
  async voidAuthorization(order) {
    if (process.env.PAYPAL_ENV === "live") throw new Error("Expiry job is restricted to sandbox");
    await voidPayment(order.authorizationId!, order.id);
  },
  async reauthorize(order) {
    if (process.env.PAYPAL_ENV === "live") throw new Error("Expiry job is restricted to sandbox");
    const result = await paypalRequest<{ id: string; status: string }>(
      `/v2/payments/authorizations/${order.authorizationId}/reauthorize`,
      {
        method: "POST",
        requestId: `reauth-${order.id}`,
        body: { amount: { currency_code: order.currency, value: order.amount.toFixed(2) } },
      }
    );
    if (result.status !== "CREATED") throw new Error(`Reauthorization ended with status ${result.status}`);
    return result.id;
  },
};

export function planExpiry(order: Order, now: Date = new Date()): ExpiryAction {
  if ((order.status !== "HELD" && order.status !== "SHIPPED") || !order.heldAt || !order.authorizationId) return "NONE";
  const ageDays = (now.getTime() - Date.parse(order.heldAt)) / DAY_MS;
  const late = order.deliverBy !== undefined && now.getTime() > Date.parse(order.deliverBy);

  if (order.status === "HELD" && late) return "VOID_MISSED_DEADLINE";
  if (ageDays >= MAX_AUTH_DAYS - SAFETY_DAYS) return "VOID_AUTH_EXPIRING";
  if (ageDays >= HONOR_PERIOD_DAYS && !order.reauthorizedAt) return "REAUTHORIZE";
  return "NONE";
}

export async function applyExpiry(
  order: Order,
  action: ExpiryAction,
  now: Date,
  deps: ExpiryDeps
): Promise<Order> {
  switch (action) {
    case "VOID_MISSED_DEADLINE":
      await deps.voidAuthorization(order);
      return transition(order, "EXPIRE", "expiry-job", {}, "missed delivery deadline");
    case "VOID_AUTH_EXPIRING":
      await deps.voidAuthorization(order);
      return transition(order, order.status === "HELD" ? "EXPIRE" : "VOID", "expiry-job", {}, "authorization expiring");
    case "REAUTHORIZE": {
      const authorizationId = await deps.reauthorize(order);
      return transition(
        order,
        "REAUTHORIZE",
        "expiry-job",
        { authorizationId, reauthorizedAt: now.toISOString() },
        `reauthorized ${authorizationId}`
      );
    }
    default:
      return order;
  }
}

export async function sweepExpired(
  orders: Order[],
  now: Date = new Date(),
  deps: ExpiryDeps = paypalExpiryDeps
): Promise<SweepResult[]> {
  const results: SweepResult[] = [];
  for (const order of orders) {
    const action = planExpiry(order, now);
    if (action === "NONE") continue;
    try {
      results.push({ orderId: order.id, action, order: await applyExpiry(order, action, now, deps) });
    } catch (err) {
      results.push({ orderId: order.id, action, order, error: (err as Error).message });
    }
  }
  return results;
}