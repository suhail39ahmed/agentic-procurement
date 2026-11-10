import { randomUUID } from "node:crypto";
import { Router } from "express";
import { chat } from "ai";
import {
  getLocalDispute,
  listLocalDisputes,
  markDisputeAcceptApproved,
  saveDisputeDraft,
  upsertLocalDispute,
  upsertSupplierReputation,
  getSupplierReputation,
} from "db";
import { getPayPalToolkit, parseToolJson, runPayPalTool } from "./paypal-toolkit";

export const disputesRouter = Router();

function requireOwner(req: { header: (name: string) => string | undefined }): string | null {
  const ownerKey = process.env.OWNER_API_KEY;
  const ownerId = process.env.OWNER_ID;
  if (!ownerKey || !ownerId) return null;
  if (req.header("x-owner-key") !== ownerKey) return null;
  return ownerId;
}

disputesRouter.get("/", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  try {
    const local = await listLocalDisputes();
    let toolkitItems: unknown[] = [];
    let toolkitError: string | undefined;
    try {
      const raw = await runPayPalTool("list_disputes", {}, "assistant");
      const parsed = parseToolJson<{ items?: unknown[]; disputes?: unknown[] } | unknown[]>(raw);
      if (Array.isArray(parsed)) toolkitItems = parsed;
      else if (parsed && typeof parsed === "object") {
        const obj = parsed as { items?: unknown[]; disputes?: unknown[] };
        toolkitItems = obj.items ?? obj.disputes ?? [parsed];
      }
    } catch (err) {
      toolkitError = err instanceof Error ? err.message : String(err);
    }

    return res.json({
      source: "paypal-agent-toolkit+local",
      local,
      toolkit: toolkitItems,
      toolkitError,
      eventHint: "Buyer opens claim vs seller; Seller accepts via Toolkit accept_dispute_claim",
    });
  } catch (err) {
    console.error("[disputes] list failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

disputesRouter.get("/:id", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  try {
    const local = await getLocalDispute(req.params.id);
    let toolkit: unknown = null;
    let toolkitError: string | undefined;
    try {
      const raw = await runPayPalTool("get_dispute", { dispute_id: req.params.id }, "assistant");
      toolkit = parseToolJson(raw);
    } catch (err) {
      toolkitError = err instanceof Error ? err.message : String(err);
    }
    if (!local && !toolkit) return res.sendStatus(404);
    return res.json({ local, toolkit, toolkitError });
  } catch (err) {
    console.error("[disputes] get failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

function buildPaypalDisputeCase(opts: {
  claimId: string;
  reason: string;
  amount: string;
  orderId?: string;
  supplierId: string;
  brief?: string;
  captureId?: string;
}): string {
  const reasonLabel = opts.reason.replace(/_/g, " ").toLowerCase();
  const itemLine = opts.brief?.trim()
    ? opts.brief.trim().slice(0, 120)
    : `Supply from ${opts.supplierId}`;
  return `PAYPAL DISPUTE CASE (sandbox demo)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dispute ID:  ${opts.claimId}
Status:      OPEN
Reason:      ${opts.reason}
             (${reasonLabel})
Amount:      $${opts.amount} USD
Order:       ${opts.orderId ?? "(sandbox capture)"}
Capture:     ${opts.captureId ?? "(n/a)"}
Seller:      ${opts.supplierId}
Item:        ${itemLine}

Opened by:   BUYER (procurement company)
Channel:     PayPal Customer Disputes
Outcome if Seller accepts:
  Dispute closes in BUYER's favor → refund of captured funds
  (not an extra payment)

Next steps in ProcureAI:
  1) Buyer — AI drafts the dispute statement (evidence for this case)
  2) Seller — Approve accept_dispute_claim (PayPal Agent Toolkit)
`;
}

/**
 * Demo: Buyer opens a claim against the winning seller after capture.
 * Seller later accepts via PayPal Toolkit accept_dispute_claim.
 */
disputesRouter.post("/simulate", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const claimId = `PP-D-${randomUUID().slice(0, 8).toUpperCase()}`;
  const amount = typeof req.body?.amount === "string" && req.body.amount.trim()
    ? req.body.amount.trim()
    : "25.00";
  const reason = typeof req.body?.reason === "string" && req.body.reason.trim()
    ? req.body.reason.trim()
    : "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED";
  const orderId = typeof req.body?.orderId === "string" && req.body.orderId.trim()
    ? req.body.orderId.trim()
    : undefined;
  const captureId = typeof req.body?.captureId === "string" && req.body.captureId.trim()
    ? req.body.captureId.trim()
    : undefined;
  const supplierId = typeof req.body?.supplierId === "string" && req.body.supplierId.trim()
    ? req.body.supplierId.trim()
    : "seller-a";
  const brief = typeof req.body?.brief === "string" ? req.body.brief : undefined;

  try {
    await upsertLocalDispute({
      disputeId: claimId,
      orderId,
      captureId,
      reason,
      amount,
      status: "OPEN",
      openedAt: new Date().toISOString(),
    });

    const existing = await getSupplierReputation(supplierId);
    await upsertSupplierReputation({
      supplierId,
      onTimeScore: existing?.onTimeScore ?? 0.5,
      disputeScore: Math.max(0, (existing?.disputeScore ?? 0.5) - 0.1),
      priceHonestyScore: existing?.priceHonestyScore ?? 0.5,
      ordersCounted: existing?.ordersCounted ?? 0,
      disputesCounted: (existing?.disputesCounted ?? 0) + 1,
    });

    const emailText = buildPaypalDisputeCase({
      claimId,
      reason,
      amount,
      orderId,
      supplierId,
      brief,
      captureId,
    });

    return res.status(201).json({
      eventType: "BUYER_DISPUTE_OPENED",
      disputeId: claimId,
      status: "OPEN",
      reason,
      amount,
      orderId: orderId ?? null,
      captureId: captureId ?? null,
      supplierId,
      emailText,
      note: "Buyer opened a PayPal dispute case vs the seller. Draft the statement as Buyer, then Seller accepts (refund path).",
    });
  } catch (err) {
    console.error("[disputes] simulate failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

disputesRouter.post("/:id/draft", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const demoRole = String(req.header("x-demo-role") ?? "").toLowerCase();
  if (demoRole === "seller") {
    return res.status(403).json({
      error: "Seller views claims but Buyer drafts the claim wording.",
      requiredRole: "buyer",
      currentRole: demoRole,
    });
  }

  try {
    const local = await getLocalDispute(req.params.id);
    if (!local) return res.status(404).json({ error: "Claim not found" });

    const drafted = await chat("buyer", [
      {
        role: "system",
        content:
          "You write a short PayPal dispute statement for a BUYER (procurement company). "
          + "Goods from the supplier were not as negotiated after capture. "
          + "This text is evidence attached to the PayPal dispute case — not an email to the seller. "
          + "Be factual and firm. Request refund / remedy. Do not invent tracking numbers. "
          + "Return plain text only (no markdown).",
      },
      {
        role: "user",
        content: JSON.stringify({
          claim: local,
          instruction: "Draft the dispute statement for this PayPal case. Seller will later accept_dispute_claim.",
        }),
      },
    ], { timeoutMs: 45_000 });

    await saveDisputeDraft(req.params.id, drafted.content.trim());
    const updated = await getLocalDispute(req.params.id);
    return res.json({
      disputeId: req.params.id,
      agentDraft: updated?.agentDraft,
      agentDraftAt: updated?.agentDraftAt,
      model: drafted.model,
    });
  } catch (err) {
    console.error("[disputes] draft failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Seller accepts the buyer claim via PayPal Toolkit accept_dispute_claim.
 * Demo claim ids may not exist remotely — we still resolve locally after Seller approval.
 */
disputesRouter.post("/:id/accept", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const demoRole = String(req.header("x-demo-role") ?? "").toLowerCase();
  if (demoRole && demoRole !== "seller") {
    return res.status(403).json({
      error: "Seller login required to accept a dispute claim.",
      requiredRole: "seller",
      currentRole: demoRole,
    });
  }

  if (req.body?.approved !== true) {
    return res.status(400).json({
      error: "accept_dispute_claim requires explicit Seller approval",
      hint: "POST with JSON { \"approved\": true, \"note\": \"...\" }",
    });
  }

  const note = typeof req.body?.note === "string" && req.body.note.trim()
    ? req.body.note.trim().slice(0, 500)
    : "Seller-approved accept_dispute_claim via ProcureAI";

  try {
    const local = await getLocalDispute(req.params.id);
    if (!local?.agentDraft) {
      return res.status(409).json({ error: "Buyer must draft the claim before Seller can accept" });
    }

    getPayPalToolkit("owner");

    let toolkitResult: unknown = null;
    let toolkitError: string | undefined;
    try {
      const raw = await runPayPalTool(
        "accept_dispute_claim",
        { dispute_id: req.params.id, note },
        "owner",
      );
      toolkitResult = parseToolJson(raw);
    } catch (err) {
      toolkitError = err instanceof Error ? err.message : String(err);
    }

    await markDisputeAcceptApproved(req.params.id, `seller:${ownerId}`);
    await upsertLocalDispute({
      disputeId: req.params.id,
      reason: local.reason,
      amount: local.amount,
      status: "RESOLVED",
      orderId: local.orderId,
      captureId: local.captureId,
      openedAt: local.openedAt,
    });

    return res.json({
      disputeId: req.params.id,
      accepted: true,
      toolkitAction: "accept_dispute_claim",
      toolkit: toolkitResult,
      toolkitError,
      toolkitNote:
        toolkitError
          ? "Seller accepted in ProcureAI. Toolkit accept may fail for demo claim ids that are not live PayPal disputes — local claim is still RESOLVED."
          : "Seller accepted via PayPal Agent Toolkit accept_dispute_claim.",
      approvedBy: `seller:${ownerId}`,
      status: "RESOLVED",
    });
  } catch (err) {
    console.error("[disputes] seller accept failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
