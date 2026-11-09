import { randomUUID } from "node:crypto";
import { Router } from "express";
import { createNegotiation, listNegotiationsForOwner, type NegotiationPriority } from "db";
import { scheduleNegotiationRun } from "./run-negotiation";
import { fxTable, isQuoteCurrency, normalizeQuotes, toUsd, type QuoteCurrency } from "./fx";

export const stretchRouter = Router();

function requireOwner(req: { header: (name: string) => string | undefined }): string | null {
  const ownerKey = process.env.OWNER_API_KEY;
  const ownerId = process.env.OWNER_ID;
  if (!ownerKey || !ownerId) return null;
  if (req.header("x-owner-key") !== ownerKey) return null;
  return ownerId;
}

type ReplenishmentRule = {
  id: string;
  ownerId: string;
  sku: string;
  label: string;
  thresholdQty: number;
  reorderQty: number;
  maxUnitPrice: number;
  currency: QuoteCurrency;
  neededByDays: number;
  priority: NegotiationPriority;
  enabled: boolean;
  lastTriggeredAt?: string;
  lastNegotiationId?: string;
  createdAt: string;
};

type SlackApproval = {
  id: string;
  ownerId: string;
  negotiationId?: string;
  orderTotal: number;
  currency: QuoteCurrency;
  supplierId?: string;
  status: "PENDING" | "APPROVED" | "DENIED";
  slackTs?: string;
  slackChannel?: string;
  decidedBy?: string;
  decidedAt?: string;
  createdAt: string;
};

const rules = new Map<string, ReplenishmentRule>();
const slackApprovals = new Map<string, SlackApproval>();
const stockLevels = new Map<string, number>(); // key ownerId:sku

function stockKey(ownerId: string, sku: string) {
  return `${ownerId}:${sku}`;
}

/** GET /api/stretch/fx */
stretchRouter.get("/fx", (_req, res) => {
  res.json(fxTable());
});

/** POST /api/stretch/fx/normalize — compare multi-currency quotes in base currency */
stretchRouter.post("/fx/normalize", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  const base = isQuoteCurrency(req.body?.base) ? req.body.base : "USD";
  const quotes = Array.isArray(req.body?.quotes) ? req.body.quotes : [];
  const cleaned = quotes.flatMap((q: unknown) => {
    if (!q || typeof q !== "object") return [];
    const row = q as { supplier?: unknown; unitPrice?: unknown; currency?: unknown; leadTimeDays?: unknown };
    const unitPrice = Number(row.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return [];
    return [{
      supplier: typeof row.supplier === "string" ? row.supplier : "unknown",
      unitPrice,
      currency: isQuoteCurrency(row.currency) ? row.currency : "USD",
      leadTimeDays: Number(row.leadTimeDays) || 14,
    }];
  });

  const normalized = normalizeQuotes(cleaned, base).sort((a, b) => a.unitPriceBase - b.unitPriceBase);
  return res.json({
    base,
    fx: fxTable(),
    quotes: normalized,
    winner: normalized[0] ?? null,
    note: "Quotes compared after FX normalisation into the selected base currency.",
  });
});

/** GET/POST replenishment rules */
stretchRouter.get("/replenishment", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  const items = [...rules.values()].filter((r) => r.ownerId === ownerId);
  const stock = items.map((r) => ({
    sku: r.sku,
    onHand: stockLevels.get(stockKey(ownerId, r.sku)) ?? r.thresholdQty + 5,
  }));
  return res.json({ items, stock });
});

stretchRouter.post("/replenishment", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  const sku = typeof req.body?.sku === "string" ? req.body.sku.trim().slice(0, 64) : "";
  const label = typeof req.body?.label === "string" ? req.body.label.trim().slice(0, 200) : "";
  const thresholdQty = Number(req.body?.thresholdQty);
  const reorderQty = Number(req.body?.reorderQty);
  const maxUnitPrice = Number(req.body?.maxUnitPrice);
  const neededByDays = Number(req.body?.neededByDays ?? 30);
  const currency = isQuoteCurrency(req.body?.currency) ? req.body.currency : "USD";
  const priority = req.body?.priority;
  if (!sku || !label) return res.status(400).json({ error: "sku and label required" });
  if (![thresholdQty, reorderQty, maxUnitPrice, neededByDays].every((n) => Number.isFinite(n) && n > 0)) {
    return res.status(400).json({ error: "thresholdQty, reorderQty, maxUnitPrice, neededByDays must be > 0" });
  }
  if (priority !== "price" && priority !== "speed" && priority !== "balanced") {
    return res.status(400).json({ error: "priority must be price|speed|balanced" });
  }

  const rule: ReplenishmentRule = {
    id: randomUUID(),
    ownerId,
    sku,
    label,
    thresholdQty: Math.floor(thresholdQty),
    reorderQty: Math.floor(reorderQty),
    maxUnitPrice: Math.round(maxUnitPrice * 100) / 100,
    currency,
    neededByDays: Math.floor(neededByDays),
    priority,
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  rules.set(rule.id, rule);
  if (!stockLevels.has(stockKey(ownerId, sku))) {
    stockLevels.set(stockKey(ownerId, sku), thresholdQty + 5);
  }
  return res.status(201).json({ rule });
});

stretchRouter.post("/replenishment/stock", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  const sku = typeof req.body?.sku === "string" ? req.body.sku.trim() : "";
  const onHand = Number(req.body?.onHand);
  if (!sku || !Number.isFinite(onHand) || onHand < 0) {
    return res.status(400).json({ error: "sku and onHand (>=0) required" });
  }
  stockLevels.set(stockKey(ownerId, sku), Math.floor(onHand));
  return res.json({ sku, onHand: Math.floor(onHand) });
});

/** Evaluate low-stock rules → optionally queue negotiation */
stretchRouter.post("/replenishment/evaluate", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const autoQueue = req.body?.autoQueue !== false;
  const owned = [...rules.values()].filter((r) => r.ownerId === ownerId && r.enabled);
  const triggered: Array<{ ruleId: string; sku: string; onHand: number; negotiationId?: string }> = [];

  for (const rule of owned) {
    const onHand = stockLevels.get(stockKey(ownerId, rule.sku)) ?? rule.thresholdQty + 5;
    if (onHand > rule.thresholdQty) continue;

    let negotiationId: string | undefined;
    if (autoQueue) {
      const usdMax = toUsd(rule.maxUnitPrice, rule.currency);
      const row = await createNegotiation({
        id: randomUUID(),
        ownerId,
        idempotencyKey: `replenish-${rule.id}-${Date.now()}`,
        brief: `Auto-replenish ${rule.label} (${rule.sku}): stock ${onHand} ≤ threshold ${rule.thresholdQty}. Reorder ${rule.reorderQty}. Budget was ${rule.currency} ${rule.maxUnitPrice.toFixed(2)} (≈ $${usdMax.toFixed(2)} USD).`,
        priority: rule.priority,
        quantity: rule.reorderQty,
        maxUnitPriceDollars: usdMax,
        currency: "USD",
        neededByDays: rule.neededByDays,
      });
      negotiationId = row.id;
      scheduleNegotiationRun(ownerId, row.id);
      rule.lastTriggeredAt = new Date().toISOString();
      rule.lastNegotiationId = row.id;
      rules.set(rule.id, rule);
    }

    triggered.push({ ruleId: rule.id, sku: rule.sku, onHand, negotiationId });
  }

  return res.json({
    evaluated: owned.length,
    triggered,
    note: triggered.length
      ? "Low-stock rule(s) fired and queued sourcing negotiations."
      : "No SKUs at or below threshold.",
  });
});

/** Slack approval card */
stretchRouter.get("/slack/approvals", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  const items = [...slackApprovals.values()]
    .filter((a) => a.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({
    items,
    configured: Boolean(process.env.SLACK_WEBHOOK_URL),
    channel: process.env.SLACK_CHANNEL ?? null,
  });
});

stretchRouter.post("/slack/approvals", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  const orderTotal = Number(req.body?.orderTotal);
  const currency = isQuoteCurrency(req.body?.currency) ? req.body.currency : "USD";
  const negotiationId = typeof req.body?.negotiationId === "string" ? req.body.negotiationId : undefined;
  const supplierId = typeof req.body?.supplierId === "string" ? req.body.supplierId : undefined;
  if (!Number.isFinite(orderTotal) || orderTotal <= 0) {
    return res.status(400).json({ error: "orderTotal must be > 0" });
  }

  const approval: SlackApproval = {
    id: randomUUID(),
    ownerId,
    negotiationId,
    orderTotal: Math.round(orderTotal * 100) / 100,
    currency,
    supplierId,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };

  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (webhook) {
    try {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `ProcureAI approval needed: ${approval.currency} ${approval.orderTotal.toFixed(2)}`
            + (supplierId ? ` · ${supplierId}` : ""),
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*ProcureAI · approval required*\n*Amount:* ${approval.currency} ${approval.orderTotal.toFixed(2)}\n*Supplier:* ${supplierId ?? "n/a"}\n*Negotiation:* ${negotiationId ?? "n/a"}\n*Approval id:* \`${approval.id}\``,
              },
            },
            {
              type: "actions",
              block_id: `procureai_approval_${approval.id}`,
              elements: [
                {
                  type: "button",
                  action_id: "approve",
                  text: { type: "plain_text", text: "Approve" },
                  style: "primary",
                  value: JSON.stringify({ id: approval.id, decision: "APPROVED" }),
                },
                {
                  type: "button",
                  action_id: "deny",
                  text: { type: "plain_text", text: "Deny" },
                  style: "danger",
                  value: JSON.stringify({ id: approval.id, decision: "DENIED" }),
                },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        approval.slackChannel = process.env.SLACK_CHANNEL ?? "webhook";
        approval.slackTs = new Date().toISOString();
      }
    } catch (err) {
      console.warn("[slack] webhook post failed", err);
    }
  }

  slackApprovals.set(approval.id, approval);
  return res.status(201).json({
    approval,
    posted: Boolean(approval.slackTs),
    note: webhook
      ? "Approval card posted to Slack webhook (button clicks via /api/stretch/slack/decision)."
      : "SLACK_WEBHOOK_URL not set — card stored locally; decide via API.",
  });
});

stretchRouter.post("/slack/decision", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  // Support both our API body and Slack interactive payload (url-encoded payload=)
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
  const approval = slackApprovals.get(id);
  if (!approval || approval.ownerId !== ownerId) return res.sendStatus(404);
  if (approval.status !== "PENDING") {
    return res.status(409).json({ error: `Already ${approval.status}` });
  }

  approval.status = decision;
  approval.decidedBy = `owner:${ownerId}`;
  approval.decidedAt = new Date().toISOString();
  slackApprovals.set(id, approval);
  return res.json({ approval, persisted: true });
});

/** Spend forecast from negotiations + synthetic ledger trend */
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

    // Ensure at least a short demo series for the chart
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
