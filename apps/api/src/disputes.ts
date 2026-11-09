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
      eventHint: "CUSTOMER.DISPUTE.CREATED webhooks persist into local disputes",
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

disputesRouter.post("/simulate", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const disputeId = `PP-D-SIM-${randomUUID().slice(0, 8).toUpperCase()}`;
  const amount = typeof req.body?.amount === "string" ? req.body.amount : "25.00";
  const reason = typeof req.body?.reason === "string"
    ? req.body.reason
    : "MERCHANDISE_OR_SERVICE_NOT_RECEIVED";
  const orderId = typeof req.body?.orderId === "string" ? req.body.orderId : undefined;
  const supplierId = typeof req.body?.supplierId === "string" ? req.body.supplierId : "seller-a";

  try {
    await upsertLocalDispute({
      disputeId,
      orderId,
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

    return res.status(201).json({
      eventType: "CUSTOMER.DISPUTE.CREATED",
      disputeId,
      status: "OPEN",
      reason,
      amount,
      note: "Sandbox simulation persisted locally so the dashboard can demo draft/accept flows.",
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

  try {
    let local = await getLocalDispute(req.params.id);
    let toolkitDetail: unknown = null;
    try {
      const raw = await runPayPalTool("get_dispute", { dispute_id: req.params.id }, "assistant");
      toolkitDetail = parseToolJson(raw);
    } catch {
      // sandbox may not have this dispute remotely
    }

    if (!local && toolkitDetail) {
      await upsertLocalDispute({
        disputeId: req.params.id,
        reason: "UNKNOWN",
        status: "OPEN",
      });
      local = await getLocalDispute(req.params.id);
    }
    if (!local) return res.status(404).json({ error: "Dispute not found locally or via Toolkit" });

    const drafted = await chat("buyer", [
      {
        role: "system",
        content:
          "You draft a concise seller response to a PayPal customer dispute for the workspace owner. "
          + "Be factual, courteous, and never accept liability. Do not say funds will be refunded unless asked. "
          + "Return plain text only (no markdown).",
      },
      {
        role: "user",
        content: JSON.stringify({
          local,
          toolkit: toolkitDetail,
          instruction: "Draft a response the owner can review before any accept_dispute_claim call.",
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

disputesRouter.post("/:id/accept", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  if (req.body?.approved !== true) {
    return res.status(400).json({
      error: "accept_dispute_claim requires explicit owner approval",
      hint: "POST with JSON { \"approved\": true, \"note\": \"...\" }",
    });
  }

  const note = typeof req.body?.note === "string" && req.body.note.trim()
    ? req.body.note.trim().slice(0, 500)
    : "Owner-approved accept via ProcureAI dashboard";

  try {
    const local = await getLocalDispute(req.params.id);
    if (!local?.agentDraft) {
      return res.status(409).json({ error: "Generate and review an agent draft before accepting the claim" });
    }

    // Ensure toolkit is constructible (owner mode includes disputes.create → accept_dispute_claim).
    getPayPalToolkit("owner");
    const raw = await runPayPalTool(
      "accept_dispute_claim",
      { dispute_id: req.params.id, note },
      "owner",
    );
    await markDisputeAcceptApproved(req.params.id, `owner:${ownerId}`);
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
      toolkit: parseToolJson(raw),
      approvedBy: `owner:${ownerId}`,
    });
  } catch (err) {
    console.error("[disputes] accept failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
