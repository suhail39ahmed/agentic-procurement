export type OrderStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "HELD"
  | "SHIPPED"
  | "CAPTURED"
  | "VOIDED"
  | "REFUNDED"
  | "EXPIRED"
  | "REJECTED";

export type OrderEvent =
  | "REQUIRE_APPROVAL"
  | "APPROVE"
  | "REJECT"
  | "AUTHORIZE"
  | "SHIP"
  | "CAPTURE"
  | "VOID"
  | "REFUND"
  | "EXPIRE";

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>> = {
  DRAFT: { REQUIRE_APPROVAL: "PENDING_APPROVAL", APPROVE: "APPROVED", REJECT: "REJECTED" },
  PENDING_APPROVAL: { APPROVE: "APPROVED", REJECT: "REJECTED", EXPIRE: "EXPIRED" },
  APPROVED: { AUTHORIZE: "HELD", EXPIRE: "EXPIRED" },
  HELD: { SHIP: "SHIPPED", CAPTURE: "CAPTURED", VOID: "VOIDED", EXPIRE: "VOIDED" },
  SHIPPED: { CAPTURE: "CAPTURED", VOID: "VOIDED" },
  CAPTURED: { REFUND: "REFUNDED" },
  VOIDED: {},
  REFUNDED: {},
  EXPIRED: {},
  REJECTED: {},
};

export interface OrderTransition {
  from: OrderStatus;
  to: OrderStatus;
  event: OrderEvent;
  actor: string;
  at: string;
  note?: string;
}

export interface Order {
  id: string;
  rfqId: string;
  supplierId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  paypalOrderId?: string;
  authorizationId?: string;
  captureId?: string;
  tracking?: { carrier: string; number: string };
  history: OrderTransition[];
}

export class InvalidTransitionError extends Error {
  constructor(public readonly from: OrderStatus, public readonly event: OrderEvent) {
    super(`Invalid transition: ${event} from ${from}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(status: OrderStatus, event: OrderEvent): boolean {
  return TRANSITIONS[status][event] !== undefined;
}

export function isTerminal(status: OrderStatus): boolean {
  return Object.keys(TRANSITIONS[status]).length === 0;
}

export function createOrder(init: Omit<Order, "status" | "history">): Order {
  return { ...init, status: "DRAFT", history: [] };
}

export function transition(
  order: Order,
  event: OrderEvent,
  actor: string,
  patch: Partial<Pick<Order, "paypalOrderId" | "authorizationId" | "captureId" | "tracking">> = {},
  note?: string,
): Order {
  const to = TRANSITIONS[order.status][event];
  if (!to) throw new InvalidTransitionError(order.status, event);
  const entry: OrderTransition = {
    from: order.status,
    to,
    event,
    actor,
    at: new Date().toISOString(),
    ...(note ? { note } : {}),
  };
  return { ...order, ...patch, status: to, history: [...order.history, entry] };
}