import { Router } from "express";
import {
  getNegotiationForOwner,
  updateNegotiationRun,
  type Negotiation,
} from "db";
import {
  batna,
  evaluatePolicy,
  requestApproval,
  decide,
  issueMandate,
  createPaymentOrder,
  authorizePayment,
  createOrder,
  transition,
  saveOrder,
  getOrder,
  markShipped,
  confirmDelivery,
  type ScoredOffer,
  type OfferMessage,
  type RfqMessage,
  type PaymentIntent,
  type ApprovalRequest,
} from "agents";

export const checkoutRouter = Router();

type CheckoutState = {
  mandateToken: string;
  paypalOrderId: string;
  approveUrl: string;
  orderId: string;
  amount: string;
  supplierId: string;
  rfqId: string;
  mandate: PaymentIntent["mandate"];
  approvalId?: string;
  lastStatus?: string;
};

type PendingOwnerApproval = {
  approvalId: string;
  orderTotal: number;
  unitPrice: number;
  supplierId: string;
  reasons: string[];
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
  threshold: number;
};

function requireOwner(req: { header: (name: string) => string | undefined }): string | null {
  const ownerKey = process.env.OWNER_API_KEY;
  const ownerId = process.env.OWNER_ID;
  if (!ownerKey || !ownerId) return null;
  if (req.header("x-owner-key") !== ownerKey) return null;
  return ownerId;
}

function ownerActor(ownerId: string): string {
  return `owner:${ownerId}`;
}

function rankingFromResult(result: unknown): ScoredOffer[] {
  if (!result || typeof result !== "object") return [];
  const ranking = (result as { ranking?: unknown }).ranking;
  if (!Array.isArray(ranking)) return [];
  return ranking.filter((item): item is ScoredOffer => {
    if (!item || typeof item !== "object") return false;
    const offer = (item as { offer?: unknown }).offer;
    return Boolean(offer && typeof offer === "object");
  });
}

function rfqFromNegotiation(row: Negotiation): RfqMessage {
  return {
    type: "RFQ",
    rfqId: row.id,
    from: "buyer",
    to: "*",
    round: 0,
    sentAt: row.createdAt,
    items: [{
      sku: "ITEM-001",
      description: row.brief.slice(0, 200) || "Procurement item",
      quantity: row.quantity,
    }],
    maxUnitPrice: row.maxUnitPrice,
    currency: "USD",
    neededByDays: row.neededByDays,
    brief: row.brief,
  };
}

function checkoutFromResult(result: unknown): CheckoutState | null {
  if (!result || typeof result !== "object") return null;
  const checkout = (result as { checkout?: unknown }).checkout;
  if (!checkout || typeof checkout !== "object") return null;
  const c = checkout as Partial<CheckoutState>;
  if (!c.mandateToken || !c.paypalOrderId || !c.approveUrl || !c.orderId || !c.amount || !c.supplierId || !c.rfqId || !c.mandate) {
    return null;
  }
  return c as CheckoutState;
}

function intentFromCheckout(checkout: CheckoutState): PaymentIntent {
  return {
    orderId: checkout.paypalOrderId,
    approveUrl: checkout.approveUrl,
    mandate: checkout.mandate,
  };
}

async function mergeCheckout(row: Negotiation, ownerId: string, checkout: CheckoutState): Promise<void> {
  const base = row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : {};
  await updateNegotiationRun({
    id: row.id,
    ownerId,
    status: row.status,
    result: { ...base, checkout, pendingOwnerApproval: undefined },
  });
}

function pendingFromResult(result: unknown): PendingOwnerApproval | null {
  if (!result || typeof result !== "object") return null;
  const pending = (result as { pendingOwnerApproval?: unknown }).pendingOwnerApproval;
  if (!pending || typeof pending !== "object") return null;
  const p = pending as Partial<PendingOwnerApproval>;
  if (!p.approvalId || p.orderTotal == null || !p.supplierId) return null;
  return p as PendingOwnerApproval;
}

async function mergePendingApproval(
  row: Negotiation,
  ownerId: string,
  pending: PendingOwnerApproval | null,
): Promise<void> {
  const base = row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : {};
  await updateNegotiationRun({
    id: row.id,
    ownerId,
    status: row.status,
    result: { ...base, pendingOwnerApproval: pending ?? undefined },
  });
}

async function completeCheckoutWithApproval(
  row: Negotiation,
  ownerId: string,
  approval: ApprovalRequest | undefined,
) {
  const ranking = rankingFromResult(row.result);
  const winner = batna(ranking);
  if (!winner) throw new Error("No eligible winning offer to checkout");
  const rfq = rfqFromNegotiation(row);
  const decision = evaluatePolicy(rfq, winner);
  if (decision.outcome === "DENY") {
    throw new Error(decision.reasons.join("; "));
  }
  if (decision.outcome === "REQUIRE_APPROVAL") {
    if (!approval || approval.status !== "APPROVED") {
      throw new Error("Owner approval required before PayPal checkout");
    }
  }

  const mandateToken = await issueMandate(rfq.rfqId, decision, approval);
  const expected = {
    rfqId: rfq.rfqId,
    supplierId: decision.supplierId,
    amount: decision.orderTotal.toFixed(2),
  };
  const intent = await createPaymentOrder(mandateToken, expected);

  let order = createOrder({
    id: intent.mandate.jti,
    rfqId: rfq.rfqId,
    supplierId: decision.supplierId,
    amount: decision.orderTotal,
    currency: "USD",
    paypalOrderId: intent.orderId,
  });
  if (approval) {
    order = transition(order, "REQUIRE_APPROVAL", "policy-engine");
    order = transition(order, "APPROVE", approval.decidedBy ?? ownerActor(ownerId));
  } else {
    order = transition(order, "APPROVE", "policy-engine");
  }
  await saveOrder(order);

  const checkout: CheckoutState = {
    mandateToken,
    paypalOrderId: intent.orderId,
    approveUrl: intent.approveUrl,
    orderId: order.id,
    amount: expected.amount,
    supplierId: decision.supplierId,
    rfqId: rfq.rfqId,
    mandate: intent.mandate,
    approvalId: approval?.id,
    lastStatus: order.status,
  };
  await mergeCheckout(row, ownerId, checkout);

  return {
    negotiationId: row.id,
    orderId: order.id,
    status: order.status,
    paypalOrderId: intent.orderId,
    approveUrl: intent.approveUrl,
    amount: expected.amount,
    supplierId: decision.supplierId,
    winner: {
      supplier: (winner.offer as OfferMessage).from,
      unitPrice: winner.offer.unitPrice,
      leadTimeDays: winner.offer.leadTimeDays,
      score: winner.score,
    },
    policy: decision.outcome,
    reuse: false,
    note: "Owner approved (or auto-allowed). Use Pay with PayPal, then funds go on hold.",
  };
}

checkoutRouter.post("/negotiations/:id/checkout", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  try {
    const row = await getNegotiationForOwner(ownerId, req.params.id);
    if (!row) return res.sendStatus(404);
    if (row.status !== "SUCCEEDED") {
      return res.status(409).json({ error: `Negotiation must be SUCCEEDED (now ${row.status})` });
    }

    const existing = checkoutFromResult(row.result);
    if (existing) {
      const order = await getOrder(existing.orderId);
      return res.json({
        negotiationId: row.id,
        orderId: existing.orderId,
        status: order?.status ?? "UNKNOWN",
        paypalOrderId: existing.paypalOrderId,
        approveUrl: existing.approveUrl,
        amount: existing.amount,
        supplierId: existing.supplierId,
        reuse: true,
      });
    }

    const existingPending = pendingFromResult(row.result);
    if (existingPending?.status === "PENDING") {
      return res.status(202).json({
        negotiationId: row.id,
        needsOwnerApproval: true,
        policy: "REQUIRE_APPROVAL",
        approval: existingPending,
        note: `Order total $${existingPending.orderTotal.toFixed(2)} is above $${existingPending.threshold} — owner must approve before PayPal.`,
      });
    }

    const ranking = rankingFromResult(row.result);
    const winner = batna(ranking);
    if (!winner) return res.status(409).json({ error: "No eligible winning offer to checkout" });

    const rfq = rfqFromNegotiation(row);
    const decision = evaluatePolicy(rfq, winner);
    if (decision.outcome === "DENY") {
      return res.status(409).json({ error: decision.reasons.join("; "), policy: decision.outcome });
    }

    if (decision.outcome === "REQUIRE_APPROVAL") {
      const approval = await requestApproval(rfq, winner, decision);
      const pending: PendingOwnerApproval = {
        approvalId: approval.id,
        orderTotal: decision.orderTotal,
        unitPrice: winner.offer.unitPrice,
        supplierId: decision.supplierId,
        reasons: decision.reasons,
        status: "PENDING",
        threshold: Number(process.env.POLICY_APPROVAL_THRESHOLD ?? 20),
      };
      await mergePendingApproval(row, ownerId, pending);
      return res.status(202).json({
        negotiationId: row.id,
        needsOwnerApproval: true,
        policy: "REQUIRE_APPROVAL",
        approval: pending,
        note: `Order total $${decision.orderTotal.toFixed(2)} exceeds $${pending.threshold} — approve as owner before PayPal checkout.`,
      });
    }

    const payload = await completeCheckoutWithApproval(row, ownerId, undefined);
    return res.status(201).json(payload);
  } catch (err) {
    console.error("[checkout] create failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

checkoutRouter.post("/negotiations/:id/checkout/owner-decide", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const approve = req.body?.approve === true;
  const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 300) : undefined;

  try {
    const row = await getNegotiationForOwner(ownerId, req.params.id);
    if (!row) return res.sendStatus(404);
    const pending = pendingFromResult(row.result);
    if (!pending || pending.status !== "PENDING") {
      return res.status(409).json({ error: "No pending owner approval for this negotiation" });
    }

    const decided = await decide(
      pending.approvalId,
      ownerActor(ownerId),
      approve,
      note ?? (approve ? "Owner approved from dashboard" : "Owner denied from dashboard"),
    );

    if (!approve) {
      await mergePendingApproval(row, ownerId, { ...pending, status: "REJECTED" });
      return res.json({
        negotiationId: row.id,
        needsOwnerApproval: false,
        denied: true,
        approval: { ...pending, status: "REJECTED" as const },
        note: "Owner denied — PayPal checkout was not created.",
      });
    }

    const payload = await completeCheckoutWithApproval(row, ownerId, decided);
    return res.status(201).json({
      ...payload,
      needsOwnerApproval: false,
      ownerApproved: true,
    });
  } catch (err) {
    console.error("[checkout] owner-decide failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

checkoutRouter.post("/orders/:id/authorize", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.sendStatus(404);

    const negotiation = await getNegotiationForOwner(ownerId, order.rfqId);
    if (!negotiation) return res.sendStatus(404);
    const checkout = checkoutFromResult(negotiation.result);
    if (!checkout || checkout.orderId !== order.id) {
      return res.status(409).json({ error: "Checkout state missing for this order" });
    }

    // Idempotent: popup may call us twice after actions.order.authorize().
    if (order.status === "HELD" && order.authorizationId) {
      return res.json({
        orderId: order.id,
        status: order.status,
        authorizationId: order.authorizationId,
        amount: checkout.amount,
        reuse: true,
      });
    }

    if (order.status !== "APPROVED") {
      return res.status(409).json({ error: `Order must be APPROVED before authorize (now ${order.status})` });
    }

    const clientAuthId = typeof req.body?.authorizationId === "string"
      ? req.body.authorizationId.trim()
      : "";

    const intent = intentFromCheckout(checkout);
    let authorizationId: string;
    if (clientAuthId) {
      // PayPal JS SDK already authorized in the popup — just sync our ledger.
      authorizationId = clientAuthId;
    } else {
      try {
        authorizationId = await authorizePayment(intent);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/ORDER_NOT_APPROVED|Payer has not yet approved/i.test(message)) {
          return res.status(409).json({
            error: "PayPal buyer has not approved yet. Use the PayPal popup (or approve link), then Authorize hold.",
            paypalOrderId: checkout.paypalOrderId,
            approveUrl: checkout.approveUrl,
          });
        }
        if (/ORDER_ALREADY_AUTHORIZED|AUTHORIZATION_ALREADY|ALREADY_AUTHORIZED/i.test(message)) {
          return res.status(409).json({
            error: `Order already authorized on PayPal (${message}). Refresh Payments or reopen this checkout.`,
            paypalOrderId: checkout.paypalOrderId,
          });
        }
        throw err;
      }
    }

    const held = transition(order, "AUTHORIZE", clientAuthId ? "paypal-js-sdk" : "payment-tool", {
      authorizationId,
      heldAt: new Date().toISOString(),
      deliverBy: new Date(Date.now() + negotiation.neededByDays * 86_400_000).toISOString(),
    });
    await saveOrder(held);
    await mergeCheckout(negotiation, ownerId, { ...checkout, lastStatus: held.status });

    return res.json({
      orderId: held.id,
      status: held.status,
      authorizationId,
      amount: checkout.amount,
    });
  } catch (err) {
    console.error("[checkout] authorize failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

checkoutRouter.post("/orders/:id/ship", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const carrier = typeof req.body?.carrier === "string" ? req.body.carrier.trim().toUpperCase() : "";
  const number = typeof req.body?.number === "string" ? req.body.number.trim() : "";
  if (!carrier || !number) return res.status(400).json({ error: "carrier and number are required" });

  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.sendStatus(404);
    const negotiation = await getNegotiationForOwner(ownerId, order.rfqId);
    if (!negotiation) return res.sendStatus(404);

    // Owner-triggered demo ship on behalf of the winning supplier (sandbox convenience).
    const shipped = markShipped(order, order.supplierId, carrier, number);
    await saveOrder(shipped);
    const checkout = checkoutFromResult(negotiation.result);
    if (checkout && checkout.orderId === order.id) {
      await mergeCheckout(negotiation, ownerId, { ...checkout, lastStatus: shipped.status });
    }
    return res.json({
      orderId: shipped.id,
      status: shipped.status,
      tracking: shipped.tracking,
    });
  } catch (err) {
    console.error("[checkout] ship failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

checkoutRouter.post("/orders/:id/confirm-delivery", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.sendStatus(404);
    const negotiation = await getNegotiationForOwner(ownerId, order.rfqId);
    if (!negotiation) return res.sendStatus(404);
    const checkout = checkoutFromResult(negotiation.result);
    if (!checkout || checkout.orderId !== order.id) {
      return res.status(409).json({ error: "Checkout state missing for this order" });
    }
    if (order.status !== "SHIPPED") {
      return res.status(409).json({ error: `Order must be SHIPPED before capture (now ${order.status})` });
    }

    const intent = intentFromCheckout(checkout);
    const captured = await confirmDelivery(order, intent, ownerActor(ownerId));
    await saveOrder(captured);
    await mergeCheckout(negotiation, ownerId, { ...checkout, lastStatus: captured.status });
    return res.json({
      orderId: captured.id,
      status: captured.status,
      captureId: captured.captureId,
      amount: checkout.amount,
    });
  } catch (err) {
    console.error("[checkout] confirm-delivery failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

checkoutRouter.get("/orders/:id", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  try {
    const order = await getOrder(req.params.id);
    if (!order) return res.sendStatus(404);
    const negotiation = await getNegotiationForOwner(ownerId, order.rfqId);
    if (!negotiation) return res.sendStatus(404);
    const checkout = checkoutFromResult(negotiation.result);
    return res.json({
      ...order,
      paypalOrderId: checkout?.paypalOrderId ?? order.paypalOrderId ?? null,
      approveUrl: checkout?.approveUrl ?? null,
      negotiationId: negotiation.id,
    });
  } catch (err) {
    console.error("[checkout] get order failed", err);
    return res.sendStatus(500);
  }
});
