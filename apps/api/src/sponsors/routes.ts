import { Router } from "express";
import { assertDemoAmount, demoMaxUsd } from "../demo-cap";
import { channel3Configured, searchChannel3 } from "./channel3";
import { fetchInvoicePageText, kernelConfigured } from "./kernel";
import {
  applyPaymentSignal,
  getScheduleSnapshot,
  resetSchedule,
  timelineEventsFromSchedule,
  type PaymentSignalKind,
} from "./schedule-agent";

export const sponsorsRouter = Router();

function requireOwner(req: { header: (name: string) => string | undefined }): string | null {
  const ownerKey = process.env.OWNER_API_KEY;
  const ownerId = process.env.OWNER_ID;
  if (!ownerKey || !ownerId) return null;
  if (req.header("x-owner-key") !== ownerKey) return null;
  return ownerId;
}

sponsorsRouter.get("/status", (_req, res) => {
  res.json({
    demoMaxUsd: demoMaxUsd(),
    channel3: channel3Configured(),
    kernel: kernelConfigured(),
    bryntum: true,
    bryntumLicenseConfigured: Boolean(
      process.env.BRYNTUM_LICENSE_KEY?.trim()
      || process.env.VITE_BRYNTUM_LICENSE_KEY?.trim()
      || process.env.NEXT_PUBLIC_BRYNTUM_LICENSE_KEY?.trim(),
    ),
    note: "Env-gated sponsors: CHANNEL3_API_KEY / KERNEL_API_KEY. Bryntum Gantt uses web NEXT_PUBLIC_BRYNTUM_LICENSE_KEY (or VITE_BRYNTUM_LICENSE_KEY).",
  });
});

sponsorsRouter.post("/channel3/search", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query || query.length > 200) {
    return res.status(400).json({ error: "query must be 1..200 characters" });
  }
  const cap = demoMaxUsd() ?? 250;
  const maxPrice = Number(req.body?.maxPrice ?? cap);
  const priceCap = assertDemoAmount(maxPrice, "Channel3 maxPrice");
  if (!priceCap.ok) return res.status(400).json({ error: priceCap.error });

  try {
    const result = await searchChannel3(query, Math.min(maxPrice, cap));
    const suggestion = result.products[0];
    const unit = suggestion
      ? Math.min(Number(suggestion.price), cap)
      : Math.min(25, cap);
    const retailer = suggestion?.retailer ? ` from ${suggestion.retailer}` : "";
    return res.json({
      ...result,
      // Live Channel3 payload only — catalog rows are not written to Postgres.
      suggestion: suggestion
        ? {
          brief: `Supply 1× "${suggestion.title}"${retailer}. Match or beat Channel3 market unit price ≤ $${unit.toFixed(2)} USD. Prefer in-stock; ship within 14 days.`.slice(0, 500),
          quantity: 1,
          maxUnitPrice: unit.toFixed(2),
          currency: suggestion.currency || "USD",
          neededByDays: 30,
          priority: "balanced" as const,
          productTitle: suggestion.title,
          retailer: suggestion.retailer ?? null,
          productId: suggestion.productId ?? null,
        }
        : null,
    });
  } catch (err) {
    console.error("[channel3] search failed", err);
    return res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

sponsorsRouter.post("/kernel/fetch-invoice", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) return res.status(400).json({ error: "url is required" });

  try {
    const result = await fetchInvoicePageText(url);
    return res.json(result);
  } catch (err) {
    console.error("[kernel] fetch failed", err);
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

sponsorsRouter.get("/timeline", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  const snap = getScheduleSnapshot();
  return res.json({
    ...snap,
    events: timelineEventsFromSchedule(),
  });
});

sponsorsRouter.get("/schedule", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  return res.json(getScheduleSnapshot());
});

sponsorsRouter.post("/schedule/reset", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  resetSchedule();
  return res.json(getScheduleSnapshot());
});

const SIGNAL_KINDS = new Set<PaymentSignalKind>([
  "capture_ok",
  "capture_late",
  "capture_fail",
  "refund",
  "dispute",
  "authorize_ok",
]);

/** Demo / agent hook: apply a payment signal and reschedule Gantt milestones. */
sponsorsRouter.post("/schedule/reschedule", (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  const kind = typeof req.body?.kind === "string" ? req.body.kind.trim() : "";
  if (!SIGNAL_KINDS.has(kind as PaymentSignalKind)) {
    return res.status(400).json({
      error: `kind must be one of: ${[...SIGNAL_KINDS].join(", ")}`,
    });
  }
  const snap = applyPaymentSignal(kind as PaymentSignalKind, {
    orderId: typeof req.body?.orderId === "string" ? req.body.orderId : undefined,
    eventType: typeof req.body?.eventType === "string" ? req.body.eventType : kind,
    forceLate: Boolean(req.body?.forceLate),
  });
  return res.json(snap);
});
