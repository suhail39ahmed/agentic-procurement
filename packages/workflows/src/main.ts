import { task, type TaskContext } from "@renderinc/sdk/workflows";
import { Rfq, negotiate, sellers, scoreOffers, batna } from "agents";

/**
 * Render Workflows tasks for long-running / scheduled agent work.
 * Deploy with the Render Workflows runtime (@renderinc/sdk).
 */
task({ name: "ping" }, function ping(_ctx: TaskContext): string {
  return "pong";
});

task(
  {
    name: "negotiate",
    retry: { maxRetries: 0, waitDurationMs: 1_000 },
    timeoutSeconds: 600,
  },
  async function negotiateTask(_ctx: TaskContext, input: unknown) {
    const rfq = Rfq.parse(input);
    const result = await negotiate(rfq, sellers);
    return JSON.parse(JSON.stringify(result));
  },
);

task(
  {
    name: "replenish-check",
    retry: { maxRetries: 1, waitDurationMs: 2_000 },
    timeoutSeconds: 120,
  },
  function replenishCheck(
    _ctx: TaskContext,
    input: { sku: string; onHand: number; thresholdQty: number; reorderQty: number },
  ) {
    const shouldReorder = input.onHand <= input.thresholdQty;
    return {
      sku: input.sku,
      onHand: input.onHand,
      thresholdQty: input.thresholdQty,
      shouldReorder,
      suggestedQty: shouldReorder ? input.reorderQty : 0,
      note: shouldReorder
        ? "Low stock — queue a sourcing negotiation from the API /dashboard Automation panel."
        : "Stock healthy.",
    };
  },
);

task(
  {
    name: "fx-normalize",
    timeoutSeconds: 30,
  },
  function fxNormalize(
    _ctx: TaskContext,
    input: {
      quotes: Array<{ from: string; unitPrice: number; currency: "USD" | "SGD" | "INR"; leadTimeDays: number }>;
      maxUnitPriceUsd: number;
      neededByDays: number;
    },
  ) {
    const rates = { USD: 1, SGD: 0.74, INR: 0.012 } as const;
    const offers = input.quotes.map((q) => ({
      type: "OFFER" as const,
      rfqId: "workflow-fx",
      from: q.from,
      to: "buyer",
      round: 1,
      sentAt: new Date().toISOString(),
      unitPrice: Math.round(q.unitPrice * rates[q.currency] * 100) / 100,
      currency: "USD" as const,
      leadTimeDays: q.leadTimeDays,
      validForHours: 48,
      message: `FX-normalised from ${q.currency}`,
    }));
    const rfq = {
      type: "RFQ" as const,
      rfqId: "workflow-fx",
      from: "buyer",
      to: "*",
      round: 0,
      sentAt: new Date().toISOString(),
      items: [{ sku: "FX", description: "FX compare", quantity: 1 }],
      maxUnitPrice: input.maxUnitPriceUsd,
      currency: "USD" as const,
      neededByDays: input.neededByDays,
      brief: "FX normalisation workflow",
    };
    const ranking = scoreOffers(rfq, offers);
    return {
      ranking,
      winner: batna(ranking) ?? null,
      rates,
    };
  },
);

task(
  {
    name: "spend-forecast",
    timeoutSeconds: 60,
  },
  function spendForecast(
    _ctx: TaskContext,
    input: { series: Array<{ month: string; amountUsd: number }> },
  ) {
    const series = [...input.series].sort((a, b) => a.month.localeCompare(b.month));
    const last3 = series.slice(-3).map((p) => p.amountUsd);
    const avg = last3.reduce((a, b) => a + b, 0) / Math.max(1, last3.length);
    const slope = last3.length >= 2 ? (last3[last3.length - 1]! - last3[0]!) / (last3.length - 1) : 0;
    return {
      series,
      forecastNextMonthUsd: Math.round((avg + slope) * 100) / 100,
      method: "moving-average + slope",
      warehouse: "Export CSV from /api/stretch/forecast for Databricks/Snowflake",
    };
  },
);
