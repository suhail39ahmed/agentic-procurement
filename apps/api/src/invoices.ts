import { randomUUID } from "node:crypto";
import { Router } from "express";
import { chat } from "ai";
import {
  getSupplierInvoice,
  listSupplierInvoices,
  saveSupplierInvoice,
  updateSupplierInvoiceMatch,
  listPayoutBatches,
  savePayoutBatch,
  listSupplierReputation,
  upsertSupplierReputation,
  getSupplierReputation,
} from "db";
import { paypalRequest } from "paypal";
import { parseToolJson, runPayPalTool } from "./paypal-toolkit";

export const invoicesRouter = Router();

function requireOwner(req: { header: (name: string) => string | undefined }): string | null {
  const ownerKey = process.env.OWNER_API_KEY;
  const ownerId = process.env.OWNER_ID;
  if (!ownerKey || !ownerId) return null;
  if (req.header("x-owner-key") !== ownerKey) return null;
  return ownerId;
}

invoicesRouter.get("/paypal", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  try {
    const raw = await runPayPalTool("list_invoices", { page: 1, page_size: 20 }, "assistant");
    return res.json({ source: "paypal-agent-toolkit", result: parseToolJson(raw) });
  } catch (err) {
    console.error("[invoices] list paypal failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

invoicesRouter.post("/paypal", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);

  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const givenName = typeof req.body?.givenName === "string" ? req.body.givenName.trim() : "Sandbox";
  const surname = typeof req.body?.surname === "string" ? req.body.surname.trim() : "Client";
  const amount = typeof req.body?.amount === "string" ? req.body.amount : "50.00";
  const note = typeof req.body?.note === "string" ? req.body.note : "ProcureAI client invoice";
  const send = req.body?.send !== false;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "email is required for create_invoice/send_invoice" });
  }

  try {
    const createRaw = await runPayPalTool("create_invoice", {
      currency_code: "USD",
      note,
      primary_recipients: [{
        billing_info: {
          email_address: email,
          name: { given_name: givenName, surname },
        },
      }],
      items: [{
        name: note.slice(0, 60) || "Procurement services",
        quantity: "1",
        unit_amount: { currency_code: "USD", value: amount },
      }],
    }, "assistant");
    const created = parseToolJson<{ id?: string; href?: string }>(createRaw);
    const invoiceId = created.id
      ?? (typeof created.href === "string" ? created.href.split("/").pop() : undefined);

    let sent: unknown = null;
    if (send && invoiceId) {
      const sendRaw = await runPayPalTool("send_invoice", { invoice_id: invoiceId }, "assistant");
      sent = parseToolJson(sendRaw);
    }

    return res.status(201).json({
      created,
      sent,
      invoiceId: invoiceId ?? null,
      note: "Created via PayPal Agent Toolkit create_invoice"
        + (send ? " and send_invoice" : " (send skipped)"),
    });
  } catch (err) {
    console.error("[invoices] create/send failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

invoicesRouter.get("/extracted", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });
  try {
    const items = await listSupplierInvoices(ownerId);
    return res.json({ items });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

invoicesRouter.post("/extract", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text || text.length > 20_000) {
    return res.status(400).json({ error: "text must be 1..20000 characters (paste PDF text or invoice body)" });
  }

  try {
    const extracted = await chat("extractor", [
      {
        role: "system",
        content:
          "Extract supplier invoice fields as JSON with keys: vendorName, invoiceNumber, currency, amount (number), dueDate (YYYY-MM-DD or null), lineItems (array of {description, quantity, unitPrice}), confidence (0-100). "
          + "If unsure, lower confidence. No markdown.",
      },
      { role: "user", content: text.slice(0, 12_000) },
    ], { json: true, timeoutMs: 60_000 });

    const parsed = JSON.parse(extracted.content) as {
      vendorName?: string;
      invoiceNumber?: string;
      currency?: string;
      amount?: number;
      dueDate?: string | null;
      lineItems?: unknown;
      confidence?: number;
    };

    const confidence = Math.round(Number(parsed.confidence) || 0);
    const amount = Number(parsed.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(422).json({ error: "Could not extract a positive amount", raw: parsed });
    }

    const invoice = await saveSupplierInvoice({
      id: randomUUID(),
      ownerId,
      source: "llm-extract",
      vendorName: parsed.vendorName,
      invoiceNumber: parsed.invoiceNumber,
      currency: parsed.currency === "USD" ? "USD" : "USD",
      amount,
      dueDate: parsed.dueDate ?? undefined,
      lineItems: parsed.lineItems,
      confidence,
      lowConfidence: confidence < 70,
      rawText: text.slice(0, 8000),
      status: "EXTRACTED",
      matchStatus: "UNMATCHED",
    });

    return res.status(201).json({ invoice, model: extracted.model });
  } catch (err) {
    console.error("[invoices] extract failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

invoicesRouter.post("/:id/match", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const invoice = await getSupplierInvoice(ownerId, req.params.id);
  if (!invoice) return res.sendStatus(404);

  const poAmount = Number(req.body?.poAmount);
  const receiptAmount = Number(req.body?.receiptAmount);
  if (![poAmount, receiptAmount].every((n) => Number.isFinite(n) && n > 0)) {
    return res.status(400).json({ error: "poAmount and receiptAmount are required positive numbers" });
  }

  const invoiceAmount = invoice.amount;
  const avg = (poAmount + receiptAmount + invoiceAmount) / 3;
  const maxDelta = Math.max(
    Math.abs(poAmount - invoiceAmount),
    Math.abs(receiptAmount - invoiceAmount),
    Math.abs(poAmount - receiptAmount),
  );
  const pct = avg === 0 ? 100 : (maxDelta / avg) * 100;
  const matched = pct <= 2;
  const matchStatus = matched ? "MATCHED" : "MISMATCH";
  const matchNotes = matched
    ? `Three-way match within 2% (delta ${pct.toFixed(2)}%)`
    : `Mismatch ${pct.toFixed(2)}% exceeds 2% threshold`;

  await updateSupplierInvoiceMatch(invoice.id, {
    matchStatus,
    matchNotes,
    orderId: typeof req.body?.orderId === "string" ? req.body.orderId : undefined,
    status: matched ? "QUEUED_FOR_PAYMENT" : "FLAGGED",
  });

  const updated = await getSupplierInvoice(ownerId, invoice.id);
  return res.json({ invoice: updated, deltaPct: pct, queuedForPayment: matched });
});

invoicesRouter.post("/:id/payout", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const invoice = await getSupplierInvoice(ownerId, req.params.id);
  if (!invoice) return res.sendStatus(404);
  if (invoice.matchStatus !== "MATCHED") {
    return res.status(409).json({ error: "Only MATCHED invoices can be paid out" });
  }

  const receiver = typeof req.body?.receiver === "string" ? req.body.receiver.trim() : "";
  if (!receiver || !receiver.includes("@")) {
    return res.status(400).json({ error: "receiver PayPal email is required" });
  }

  const batchId = `payout-${randomUUID()}`;
  try {
    const created = await paypalRequest<{ batch_header?: { payout_batch_id?: string; batch_status?: string } }>(
      "/v1/payments/payouts",
      {
        method: "POST",
        requestId: batchId,
        body: {
          sender_batch_header: {
            sender_batch_id: batchId,
            email_subject: "ProcureAI supplier payout",
          },
          items: [{
            recipient_type: "EMAIL",
            amount: { value: invoice.amount.toFixed(2), currency: invoice.currency || "USD" },
            receiver,
            note: `Payout for invoice ${invoice.invoiceNumber ?? invoice.id}`,
            sender_item_id: invoice.id.slice(0, 30),
          }],
        },
      },
    );

    await savePayoutBatch({
      id: batchId,
      ownerId,
      paypalBatchId: created.batch_header?.payout_batch_id,
      status: created.batch_header?.batch_status ?? "PENDING",
      amount: invoice.amount,
      currency: invoice.currency || "USD",
      invoiceId: invoice.id,
      receiver,
      note: "Created via PayPal Payouts REST",
    });
    await updateSupplierInvoiceMatch(invoice.id, {
      matchStatus: "MATCHED",
      matchNotes: `${invoice.matchNotes ?? ""} · payout ${batchId}`,
      status: "PAYOUT_SUBMITTED",
      orderId: invoice.orderId,
    });

    return res.status(201).json({
      batchId,
      paypal: created,
      note: "Batch status updates arrive via PAYMENT.PAYOUTSBATCH.* webhooks when configured",
    });
  } catch (err) {
    console.error("[invoices] payout failed", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

invoicesRouter.get("/payouts", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });
  return res.json({ items: await listPayoutBatches(ownerId) });
});

invoicesRouter.get("/reputation", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });
  return res.json({ items: await listSupplierReputation() });
});

invoicesRouter.post("/reputation/:supplierId/record", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const onTime = req.body?.onTime === true;
  const disputed = req.body?.disputed === true;
  const priceHonest = req.body?.priceHonest !== false;
  const existing = await getSupplierReputation(req.params.supplierId);
  const ordersCounted = (existing?.ordersCounted ?? 0) + 1;
  const disputesCounted = (existing?.disputesCounted ?? 0) + (disputed ? 1 : 0);
  const blend = (prev: number, next: number, n: number) => ((prev * (n - 1)) + next) / n;

  await upsertSupplierReputation({
    supplierId: req.params.supplierId,
    onTimeScore: blend(existing?.onTimeScore ?? 0.5, onTime ? 1 : 0, ordersCounted),
    disputeScore: blend(existing?.disputeScore ?? 0.5, disputed ? 0 : 1, ordersCounted),
    priceHonestyScore: blend(existing?.priceHonestyScore ?? 0.5, priceHonest ? 1 : 0, ordersCounted),
    ordersCounted,
    disputesCounted,
  });

  return res.json({ item: await getSupplierReputation(req.params.supplierId) });
});
