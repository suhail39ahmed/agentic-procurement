import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  createNegotiation,
  createReplenishmentRule,
  createSlackApproval,
  decideSlackApproval,
  listNegotiationsForOwner,
  listReplenishmentRules,
  listSlackApprovals,
  markReplenishmentTriggered,
  setReplenishmentOnHand,
  type NegotiationPriority,
} from "db";
import { scheduleNegotiationRun } from "./run-negotiation";
import {
  fxTable,
  isQuoteCurrency,
  normalizeQuotes,
  toUsd,
  type FxQuoteInput,
  type QuoteCurrency,
} from "./fx";

export const stretchRouter = Router();

function requireOwner(req: { header: (name: string) => string | undefined }): string | null {
  const ownerKey = process.env.OWNER_API_KEY;
  const ownerId = process.env.OWNER_ID;
  if (!ownerKey || !ownerId) return null;
  if (req.header("x-owner-key") !== ownerKey) return null;
  return ownerId;
}

function requireDb(res: { status: (code: number) => { json: (body: unknown) => unknown } }) {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: "Database unavailable" });
    return false;
  }
  return true;
}

/** GET /api/stretch/fx */
stretchRouter.get("/fx", (_req, res) => {
  res.json(fxTable());
});

/**
 * POST /api/stretch/fx/normalize
 * Compare USD/SGD/INR supplier quotes in a selected base currency (#38).
 */
stretchRouter.post("/fx/normalize", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  const base = isQuoteCurrency(req.body?.base) ? req.body.base : "USD";
  const maxUnitPriceBase = Number(req.body?.maxUnitPrice);
  const neededByDays = Number(req.body?.neededByDays ?? 30);
  const quotes = Array.isArray(req.body?.quotes) ? req.body.quotes : [];

  const cleaned: FxQuoteInput[] = quotes.flatMap((q: unknown) => {
    if (!q || typeof q !== "object") return [] as FxQuoteInput[];
    const row = q as {
      supplier?: unknown;
      unitPrice?: unknown;
      currency?: unknown;
      leadTimeDays?: unknown;
    };
    const unitPrice = Number(row.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return [] as FxQuoteInput[];
    return [{
      supplier: typeof row.supplier === "string" ? row.supplier : "unknown",
      unitPrice,
      currency: isQuoteCurrency(row.currency) ? row.currency : "USD",
      leadTimeDays: Number(row.leadTimeDays) || 14,
    }];
  });

  if (cleaned.length === 0) {
    return res.status(400).json({
      error: "Provide at least one quote with unitPrice and currency (USD|SGD|INR)",
    });
  }

  const normalized = normalizeQuotes(cleaned, base)
    .map((q) => ({
      ...q,
      withinBudget: Number.isFinite(maxUnitPriceBase) && maxUnitPriceBase > 0
        ? q.unitPriceBase <= maxUnitPriceBase
        : true,
      meetsDeadline: q.leadTimeDays <= (Number.isFinite(neededByDays) ? neededByDays : 365),
    }))
    .sort((a, b) => {
      const aOk = a.withinBudget && a.meetsDeadline ? 1 : 0;
      const bOk = b.withinBudget && b.meetsDeadline ? 1 : 0;
      return bOk - aOk || a.unitPriceBase - b.unitPriceBase || a.leadTimeDays - b.leadTimeDays;
    });

  const winner = normalized.find((q) => q.withinBudget && q.meetsDeadline) ?? normalized[0] ?? null;

  return res.json({
    base,
    fx: fxTable(),
    maxUnitPriceBase: Number.isFinite(maxUnitPriceBase) && maxUnitPriceBase > 0 ? maxUnitPriceBase : null,
    neededByDays: Number.isFinite(neededByDays) ? neededByDays : 30,
    quotes: normalized,
    winner,
    comparison: normalized.map((q, index) => ({
      rank: index + 1,
      supplier: q.supplier,
      original: `${q.currency} ${q.unitPrice.toFixed(2)}`,
      normalised: `${base} ${q.unitPriceBase.toFixed(2)}`,
      usd: `USD ${q.unitPriceUsd.toFixed(2)}`,
      leadTimeDays: q.leadTimeDays,
      withinBudget: q.withinBudget,
      meetsDeadline: q.meetsDeadline,
    })),
    note: "Quotes compared after FX normalisation into the selected base currency (USD/SGD/INR).",
  });
});

/** GET replenishment rules (#37) */
stretchRouter.get("/replenishment", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!requireDb(res)) return;

  try {
    const items = await listReplenishmentRules(ownerId);
    const stock = items.map((r) => ({ sku: r.sku, onHand: r.onHand }));
    return res.json({ items, stock });
  } catch (err) {
    console.error("[stretch] list replenishment failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST create/upsert replenishment rule (#37) */
stretchRouter.post("/replenishment", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!requireDb(res)) return;

  const sku = typeof req.body?.sku === "string" ? req.body.sku.trim().slice(0, 64) : "";
  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 200) : "";
  const thresholdQty = Number(req.body?.thresholdQty);
  const reorderQty = Number(req.body?.reorderQty);
  const maxUnitPrice = Number(req.body?.maxUnitPrice);
  const neededByDays = Number(req.body?.neededByDays ?? 30);
  const onHand = Number(req.body?.onHand ?? thresholdQty + 5);
  const currency = isQuoteCurrency(req.body?.currency) ? req.body.currency : "USD";
  const priority = req.body?.priority as NegotiationPriority | undefined;

  if (!sku || !label) return res.status(400).json({ error: "sku and label required" });
  if (![thresholdQty, reorderQty, maxUnitPrice, neededByDays].every((n) => Number.isFinite(n) && n > 0)) {
    return res.status(400).json({ error: "thresholdQty, reorderQty, maxUnitPrice, neededByDays must be > 0" });
  }
  if (!Number.isFinite(onHand) || onHand < 0) {
    return res.status(400).json({ error: "onHand must be >= 0" });
  }
  if (priority !== "price" && priority !== "speed" && priority !== "balanced") {
    return res.status(400).json({ error: "priority must be price|speed|balanced" });
  }

  try {
    const rule = await createReplenishmentRule({
      id: randomUUID(),
      ownerId,
      sku,
      label,
      thresholdQty: Math.floor(thresholdQty),
      reorderQty: Math.floor(reorderQty),
      onHand: Math.floor(onHand),
      maxUnitPriceDollars: Math.round(maxUnitPrice * 100) / 100,
      currency,
      neededByDays: Math.floor(neededByDays),
      priority,
    });
    return res.status(201).json({
      rule,
      note: rule.onHand <= rule.thresholdQty
        ? "Rule saved and already below threshold — call evaluate to queue sourcing."
        : "Rule saved. Drop on-hand to/below threshold, then evaluate to queue sourcing.",
    });
  } catch (err) {
    console.error("[stretch] create replenishment failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

stretchRouter.post("/replenishment/stock", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!requireDb(res)) return;

  const sku = typeof req.body?.sku === "string" ? req.body.sku.trim() : "";
  const onHand = Number(req.body?.onHand);
  if (!sku || !Number.isFinite(onHand) || onHand < 0) {
    return res.status(400).json({ error: "sku and onHand (>=0) required" });
  }

  try {
    const rule = await setReplenishmentOnHand(ownerId, sku, Math.floor(onHand));
    if (!rule) return res.status(404).json({ error: "No rule for that SKU — save a rule first" });
    return res.json({
      sku: rule.sku,
      onHand: rule.onHand,
      thresholdQty: rule.thresholdQty,
      lowStock: rule.onHand <= rule.thresholdQty,
    });
  } catch (err) {
    console.error("[stretch] set stock failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Evaluate low-stock rules → queue negotiation (#37 acceptance:
 * Low-stock rule triggers new sourcing request)
 */
stretchRouter.post("/replenishment/evaluate", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!requireDb(res)) return;

  const autoQueue = req.body?.autoQueue !== false;

  try {
    const owned = (await listReplenishmentRules(ownerId)).filter((r) => r.enabled);
    const triggered: Array<{
      ruleId: string;
      sku: string;
      onHand: number;
      thresholdQty: number;
      negotiationId?: string;
    }> = [];

    for (const rule of owned) {
      if (rule.onHand > rule.thresholdQty) continue;

      let negotiationId: string | undefined;
      if (autoQueue) {
        const currency = isQuoteCurrency(rule.currency) ? rule.currency : "USD";
        const usdMax = toUsd(rule.maxUnitPrice, currency);
        const row = await createNegotiation({
          id: randomUUID(),
          ownerId,
          idempotencyKey: `replenish-${rule.id}-${Date.now()}`,
          brief: `Auto-replenish ${rule.label} (${rule.sku}): stock ${rule.onHand} ≤ threshold ${rule.thresholdQty}. Reorder ${rule.reorderQty}. Budget ${currency} ${rule.maxUnitPrice.toFixed(2)} (≈ $${usdMax.toFixed(2)} USD).`,
          priority: rule.priority,
          quantity: rule.reorderQty,
          maxUnitPriceDollars: usdMax,
          currency: "USD",
          neededByDays: rule.neededByDays,
        });
        negotiationId = row.id;
        scheduleNegotiationRun(ownerId, row.id);
        await markReplenishmentTriggered({
          id: rule.id,
          ownerId,
          negotiationId: row.id,
        });
      }

      triggered.push({
        ruleId: rule.id,
        sku: rule.sku,
        onHand: rule.onHand,
        thresholdQty: rule.thresholdQty,
        negotiationId,
      });
    }

    return res.json({
      evaluated: owned.length,
      triggered,
      note: triggered.length
        ? "Low-stock rule(s) fired and queued sourcing negotiations."
        : "No SKUs at or below threshold.",
    });
  } catch (err) {
    console.error("[stretch] evaluate replenishment failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Slack approvals (persisted) */
stretchRouter.get("/slack/approvals", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!requireDb(res)) return;

  try {
    const items = await listSlackApprovals(ownerId);
    return res.json({
      items,
      configured: Boolean(process.env.SLACK_WEBHOOK_URL),
      channel: process.env.SLACK_CHANNEL ?? null,
    });
  } catch (err) {
    console.error("[stretch] list slack failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

stretchRouter.post("/slack/approvals", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!requireDb(res)) return;

  const orderTotal = Number(req.body?.orderTotal);
  const currency = isQuoteCurrency(req.body?.currency) ? req.body.currency : "USD";
  const negotiationId = typeof req.body?.negotiationId === "string" ? req.body.negotiationId : undefined;
  const supplierId = typeof req.body?.supplierId === "string" ? req.body.supplierId : undefined;
  if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
    return res.status(400).json({ error: "orderTotal must be > 0" });
  }

  const id = randomUUID();
  let slackTs: string | undefined;
  let slackChannel: string | undefined;
  const webhook = process.env.SLACK_WEBHOOK_URL;

  if (webhook) {
    try {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `ProcureAI approval needed: ${currency} ${orderTotal.toFixed(2)}`
            + (supplierId ? ` · ${supplierId}` : ""),
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*ProcureAI · approval required*\n*Amount:* ${currency} ${orderTotal.toFixed(2)}\n*Supplier:* ${supplierId ?? "n/a"}\n*Negotiation:* ${negotiationId ?? "n/a"}\n*Approval id:* \`${id}\``,
              },
            },
            {
              type: "actions",
              block_id: `procureai_approval_${id}`,
              elements: [
                {
                  type: "button",
                  action_id: "approve",
                  text: { type: "plain_text", text: "Approve" },
                  style: "primary",
                  value: JSON.stringify({ id, decision: "APPROVED" }),
                },
                {
                  type: "button",
                  action_id: "deny",
                  text: { type: "plain_text", text: "Deny" },
                  style: "danger",
                  value: JSON.stringify({ id, decision: "DENIED" }),
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        slackChannel = process.env.SLACK_CHANNEL ?? "webhook";
        slackTs = new Date().toISOString();
      }
    } catch (err) {
      console.warn("[slack] webhook post failed", err);
    }
  }

  try {
    const approval = await createSlackApproval({
      id,
      ownerId,
      negotiationId,
      orderTotalDollars: Math.round(orderTotal * 100) / 100,
      currency,
      supplierId,
      slackTs,
      slackChannel,
    });
    return res.status(201).json({
      approval,
      posted: Boolean(slackTs),
      note: webhook
        ? "Approval card posted to Slack webhook (button clicks via /api/stretch/slack/decision)."
        : "SLACK_WEBHOOK_URL not set — card stored; decide via API.",
    });
  } catch (err) {
    console.error("[stretch] create slack approval failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

stretchRouter.post("/slack/decision", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!requireDb(res)) return;

  let id = typeof req.body?.id === "string" ? req.body.id : "";
  let decision = req.body?.decision;
  if (!id && typeof req.body?.payload === "string") {
    try {
      const payload = JSON.parse(req.body.payload) as {
        actions?: Array<{ value?: string }>;
      };
      const value = payload.actions?.[0]?.value;
      if (value) {
        const parsed = JSON.parse(value) as { id?: string; decision?: string };
        id = parsed.id ?? "";
        decision = parsed.decision;
      }
    } catch {
      // ignore
    }
  }

  if (decision !== "APPROVED" && decision !== "DENIED") {
    return res.status(400).json({ error: "decision must be APPROVED or DENIED" });
  }

  try {
    const approval = await decideSlackApproval({
      id,
      ownerId,
      decision,
      decidedBy: `owner:${ownerId}`,
    });
    if (!approval) return res.sendStatus(404);
    if (approval.status !== decision) {
      return res.status(409).json({ error: `Already ${approval.status}`, approval });
    }
    return res.json({ approval, persisted: true });
  } catch (err) {
    console.error("[stretch] slack decision failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** Spend forecast */
stretchRouter.get("/forecast", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  try {
    const negotiations = process.env.DATABASE_URL
      ? await listNegotiationsForOwner(ownerId)
      : [];

    const monthly = new Map<string, number>();
    for (const row of negotiations) {
      if (row.status !== "SUCCEEDED") continue;
      const month = row.createdAt.slice(0, 7);
      const spend = row.quantity * row.maxUnitPrice;
      monthly.set(month, (monthly.get(month) ?? 0) + spend);
    }

    if (monthly.size < 3) {
      const now = new Date();
      for (let i = 5; i >= 0; i -= 1) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthly.has(key)) {
          monthly.set(key, Math.round((800 + (5 - i) * 120 + (i % 2) * 90) * 100) / 100);
        }
      }
    }

    const series = [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amountUsd]) => ({ month, amountUsd }));

    const last3 = series.slice(-3).map((p) => p.amountUsd);
    const avg = last3.reduce((a, b) => a + b, 0) / Math.max(1, last3.length);
    const slope = last3.length >= 2 ? (last3[last3.length - 1]! - last3[0]!) / (last3.length - 1) : 0;
    const forecastNext = Math.round((avg + slope) * 100) / 100;

    const warehouse = {
      format: "csv",
      columns: ["month", "amount_usd", "source"],
      rows: [
        ...series.map((p) => [p.month, String(p.amountUsd), "ledger_or_demo"]),
        [nextMonth(series[series.length - 1]?.month), String(forecastNext), "forecast"],
      ],
    };

    return res.json({
      series,
      forecastNextMonthUsd: forecastNext,
      method: "moving-average + linear slope on last 3 months",
      warehouseExport: warehouse,
      databricksHint: "Copy warehouseExport CSV into a Databricks/Snowflake stage for BI.",
    });
  } catch (err) {
    console.error("[forecast] failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

function nextMonth(ym?: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y!, m! - 1, 1);
  d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
