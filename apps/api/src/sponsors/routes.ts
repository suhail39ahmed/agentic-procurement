import { Router } from "express";
import { assertDemoAmount, demoMaxUsd } from "../demo-cap";
import { channel3Configured, searchChannel3 } from "./channel3";
import { fetchInvoicePageText, kernelConfigured } from "./kernel";

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
    note: "Env-gated sponsors: set CHANNEL3_API_KEY / KERNEL_API_KEY to activate live calls.",
  });
});

sponsorsRouter.post("/channel3/search", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query || query.length > 200) {
    return res.status(400).json({ error: "query must be 1..200 characters" });
  }
  const cap = demoMaxUsd() ?? 2;
  const maxPrice = Number(req.body?.maxPrice ?? cap);
  const priceCap = assertDemoAmount(maxPrice, "Channel3 maxPrice");
  if (!priceCap.ok) return res.status(400).json({ error: priceCap.error });

  try {
    const result = await searchChannel3(query, Math.min(maxPrice, cap));
    const suggestion = result.products[0];
    return res.json({
      ...result,
      suggestion: suggestion
        ? {
          brief: `Source ${suggestion.title} via Channel3 catalog (sandbox enrich).`,
          quantity: 1,
          maxUnitPrice: suggestion.price != null
            ? Math.min(suggestion.price, cap).toFixed(2)
            : Math.min(2, cap).toFixed(2),
          currency: "USD",
          neededByDays: 14,
          priority: "balanced",
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

  const now = Date.now();
  const day = 86_400_000;
  return res.json({
    provider: "bryntum-style-schedule",
    note: "Delivery / replenishment / payout due timeline (Bryntum Calendar/Scheduler category UI).",
    events: [
      {
        id: "delivery-eta",
        title: "Supplier delivery ETA",
        start: new Date(now + 3 * day).toISOString(),
        end: new Date(now + 5 * day).toISOString(),
        type: "delivery",
      },
      {
        id: "replenish-check",
        title: "Replenishment evaluate",
        start: new Date(now + 1 * day).toISOString(),
        end: new Date(now + 1 * day + 3_600_000).toISOString(),
        type: "replenish",
      },
      {
        id: "invoice-due",
        title: "Supplier invoice due",
        start: new Date(now + 7 * day).toISOString(),
        end: new Date(now + 7 * day + 3_600_000).toISOString(),
        type: "payout",
      },
      {
        id: "client-invoice",
        title: "Client invoice follow-up",
        start: new Date(now + 2 * day).toISOString(),
        end: new Date(now + 2 * day + 3_600_000).toISOString(),
        type: "client",
      },
    ],
  });
});
