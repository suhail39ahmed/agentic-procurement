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
import { assertDemoAmount } from "./demo-cap";
import {
  INVOICE_STORAGE_SAMPLES,
  buildLiveSellerInvoiceEmail,
  buildSupplierInvoiceEmail,
  getInvoiceSample,
} from "./invoice-samples";

export const invoicesRouter = Router();

function parseInvoiceTextFallback(text: string): {
  vendorName?: string;
  invoiceNumber?: string;
  currency: string;
  amount: number;
  dueDate?: string;
  confidence: number;
} {
  const vendor = text.match(/Vendor:\s*(.+)/i)?.[1]?.trim();
  const invoiceNumber = text.match(/Invoice\s*#?:\s*(\S+)/i)?.[1]?.trim()
    ?? text.match(/INV-[A-Z0-9-]+/i)?.[0];
  const dueDate = text.match(/Due(?:\s*date)?:\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
  const total = text.match(/Total\s*due:\s*([\d,.]+)/i)?.[1]
    ?? text.match(/Amount:\s*\$?\s*([\d,.]+)/i)?.[1];
  const amount = Number(String(total ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error("Could not extract a positive amount from invoice text"), { status: 422 });
  }
  return {
    vendorName: vendor,
    invoiceNumber,
    currency: "USD",
    amount,
    dueDate,
    confidence: 88,
  };
}

async function extractAndSaveInvoice(opts: {
  ownerId: string;
  text: string;
  source: string;
}) {
  let parsed: {
    vendorName?: string;
    invoiceNumber?: string;
    currency?: string;
    amount?: number;
    dueDate?: string | null;
    lineItems?: unknown;
    confidence?: number;
  };
  let model = "fallback-regex";

  try {
    const extracted = await chat("extractor", [
      {
        role: "system",
        content:
          "Extract supplier invoice fields as JSON with keys: vendorName, invoiceNumber, currency, amount (number), dueDate (YYYY-MM-DD or null), lineItems (array of {description, quantity, unitPrice}), confidence (0-100). "
          + "If unsure, lower confidence. No markdown.",
      },
      { role: "user", content: opts.text.slice(0, 12_000) },
    ], { json: true, timeoutMs: 45_000 });
    parsed = JSON.parse(extracted.content) as typeof parsed;
    model = extracted.model;
  } catch (err) {
    console.warn("[invoices] LLM extract failed — using text fallback", err);
    parsed = parseInvoiceTextFallback(opts.text);
  }

  const confidence = Math.round(Number(parsed.confidence) || 0);
  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    // Second chance: sample docs always have Total due
    try {
      parsed = parseInvoiceTextFallback(opts.text);
    } catch {
      throw Object.assign(new Error("Could not extract a positive amount"), { status: 422, raw: parsed });
    }
  }
  const finalAmount = Number(parsed.amount);
  const capped = assertDemoAmount(finalAmount, "extracted invoice amount");
  if (!capped.ok) {
    throw Object.assign(new Error(capped.error ?? "Amount rejected"), {
      status: 400,
      hint: "Use a smaller invoice amount for this environment.",
    });
  }

  const finalConfidence = Math.round(Number(parsed.confidence) || 80);
  const invoice = await saveSupplierInvoice({
    id: randomUUID(),
    ownerId: opts.ownerId,
    source: opts.source,
    vendorName: parsed.vendorName,
    invoiceNumber: parsed.invoiceNumber,
    currency: "USD",
    amount: finalAmount,
    dueDate: parsed.dueDate ?? undefined,
    lineItems: parsed.lineItems,
    confidence: finalConfidence,
    lowConfidence: finalConfidence < 70,
    rawText: opts.text.slice(0, 8000),
    status: "EXTRACTED",
    matchStatus: "UNMATCHED",
  });

  return { invoice, model };
}

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
  const amount = typeof req.body?.amount === "string" ? req.body.amount : "1.50";
  const note = typeof req.body?.note === "string" ? req.body.note : "ProcureAI client invoice";
  const send = req.body?.send !== false;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "email is required for create_invoice/send_invoice" });
  }
  const amountNum = Number(amount);
  const capped = assertDemoAmount(amountNum, "client invoice amount");
  if (!capped.ok) return res.status(400).json({ error: capped.error });

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
    console.warn("[invoices] toolkit create/send failed — returning demo invoice", err);
    const demoId = `DEMO-INV-${randomUUID().slice(0, 8).toUpperCase()}`;
    return res.status(201).json({
      created: { id: demoId, demo: true },
      sent: send ? { status: "SENT", demo: true } : null,
      invoiceId: demoId,
      toolkitError: err instanceof Error ? err.message : String(err),
      note: "Demo client invoice recorded (PayPal Toolkit unavailable). Check sandbox credentials for live create/send.",
    });
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

invoicesRouter.get("/storage", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  return res.json({
    note: "Demo vault — PDF text layers shipped in the API (Render-safe; no ephemeral disk / Azure blob required).",
    items: INVOICE_STORAGE_SAMPLES.map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      vendor: doc.vendor,
      amountLabel: doc.amountLabel,
      summary: doc.summary,
    })),
  });
});

invoicesRouter.post("/ingest/storage", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const sampleId = typeof req.body?.sampleId === "string" ? req.body.sampleId.trim() : "";
  const doc = getInvoiceSample(sampleId);
  if (!doc) {
    return res.status(404).json({ error: "Unknown storage document", hint: "GET /api/invoices/storage" });
  }

  try {
    const result = await extractAndSaveInvoice({
      ownerId,
      text: doc.text,
      source: `storage:${doc.filename}`,
    });
    return res.status(201).json({
      ...result,
      channel: "storage",
      filename: doc.filename,
      note: `Agent read ${doc.filename} from demo vault and extracted fields.`,
    });
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : 500;
    console.error("[invoices] storage ingest failed", err);
    return res.status(status).json({
      error: err instanceof Error ? err.message : String(err),
      hint: (err as { hint?: string })?.hint,
      raw: (err as { raw?: unknown })?.raw,
    });
  }
});

invoicesRouter.post("/ingest/email", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const liveInvoiceId = typeof req.body?.invoiceId === "string" ? req.body.invoiceId.trim() : "";
  const liveAmountRaw = req.body?.amount;
  const liveAmount = typeof liveAmountRaw === "number"
    ? liveAmountRaw
    : Number(typeof liveAmountRaw === "string" ? liveAmountRaw.trim() : NaN);
  const liveNote = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const liveTo = typeof req.body?.to === "string" ? req.body.to.trim() : "payables@procureai.demo";
  const liveVendor = typeof req.body?.vendor === "string" ? req.body.vendor.trim() : "";

  let emailText: string;
  let filename: string;
  let sourceLabel: string;

  if (liveInvoiceId && Number.isFinite(liveAmount) && liveAmount > 0) {
    const capped = assertDemoAmount(liveAmount, "seller invoice amount");
    if (!capped.ok) return res.status(400).json({ error: capped.error });
    emailText = buildLiveSellerInvoiceEmail({
      invoiceId: liveInvoiceId,
      amount: liveAmount,
      note: liveNote || "Supplier invoice",
      to: liveTo,
      vendor: liveVendor || undefined,
    });
    filename = `${liveInvoiceId}.pdf`;
    sourceLabel = `email:seller:${liveInvoiceId}`;
  } else {
    const sampleId = typeof req.body?.sampleId === "string" && req.body.sampleId.trim()
      ? req.body.sampleId.trim()
      : INVOICE_STORAGE_SAMPLES[0]?.id;
    const doc = sampleId ? getInvoiceSample(sampleId) : undefined;
    if (!doc) return res.status(404).json({ error: "No invoice sample for email demo" });
    emailText = buildSupplierInvoiceEmail(doc);
    filename = doc.filename;
    sourceLabel = `email:${doc.filename}`;
  }

  try {
    const result = await extractAndSaveInvoice({
      ownerId,
      text: emailText,
      source: sourceLabel,
    });
    return res.status(201).json({
      ...result,
      channel: "email",
      filename,
      emailText,
      note: liveInvoiceId
        ? `Seller Create & send ${liveInvoiceId} · $${Number(liveAmount).toFixed(2)} — agent extracted invoice fields.`
        : `Supplier email received with ${filename} — agent extracted invoice fields.`,
    });
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : 500;
    console.error("[invoices] email ingest failed", err);
    return res.status(status).json({
      error: err instanceof Error ? err.message : String(err),
      emailText,
      hint: (err as { hint?: string })?.hint,
    });
  }
});

invoicesRouter.post("/ingest/upload", async (req, res) => {
  const ownerId = requireOwner(req);
  if (!ownerId) return res.sendStatus(404);
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Database unavailable" });

  const filename = typeof req.body?.filename === "string" ? req.body.filename.trim() : "upload.pdf";
  let text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  // Binary PDFs on Render: map to a vault sample by name, or default first sample.
  if (!text) {
    const matched = INVOICE_STORAGE_SAMPLES.find(
      (doc) => doc.filename.toLowerCase() === filename.toLowerCase()
        || filename.toLowerCase().includes(doc.id.replace("inv-", "")),
    ) ?? INVOICE_STORAGE_SAMPLES[0];
    if (!matched) {
      return res.status(400).json({ error: "No text and no demo PDF mapping available" });
    }
    text = matched.text;
  }
  if (text.length > 20_000) {
    return res.status(400).json({ error: "text must be ≤20000 characters" });
  }

  try {
    const result = await extractAndSaveInvoice({
      ownerId,
      text,
      source: `upload:${filename}`,
    });
    return res.status(201).json({
      ...result,
      channel: "upload",
      filename,
      note: `Agent read uploaded ${filename} and extracted fields.`,
    });
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : 500;
    console.error("[invoices] upload ingest failed", err);
    return res.status(status).json({
      error: err instanceof Error ? err.message : String(err),
      hint: (err as { hint?: string })?.hint,
    });
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
    const result = await extractAndSaveInvoice({
      ownerId,
      text,
      source: "llm-extract",
    });
    return res.status(201).json(result);
  } catch (err) {
    const status = typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : 500;
    console.error("[invoices] extract failed", err);
    return res.status(status).json({
      error: err instanceof Error ? err.message : String(err),
      hint: (err as { hint?: string })?.hint,
      raw: (err as { raw?: unknown })?.raw,
    });
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
  const payoutCap = assertDemoAmount(invoice.amount, "payout amount");
  if (!payoutCap.ok) return res.status(400).json({ error: payoutCap.error });

  const batchId = `payout-${randomUUID()}`;
  let paypalBatchId: string | undefined;
  let paypalStatus = "PENDING";
  let paypalPayload: unknown = null;
  let toolkitError: string | undefined;

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
    paypalPayload = created;
    paypalBatchId = created.batch_header?.payout_batch_id;
    paypalStatus = created.batch_header?.batch_status ?? "PENDING";
  } catch (err) {
    toolkitError = err instanceof Error ? err.message : String(err);
    console.warn("[invoices] PayPal payout REST failed — recording demo payout locally", toolkitError);
    paypalStatus = "COMPLETED";
    paypalBatchId = `DEMO-${batchId.slice(0, 12).toUpperCase()}`;
  }

  try {
    await savePayoutBatch({
      id: batchId,
      ownerId,
      paypalBatchId,
      status: paypalStatus,
      amount: invoice.amount,
      currency: invoice.currency || "USD",
      invoiceId: invoice.id,
      receiver,
      note: toolkitError
        ? `Demo payout recorded (PayPal REST unavailable: ${toolkitError.slice(0, 120)})`
        : "Created via PayPal Payouts REST",
    });
    await updateSupplierInvoiceMatch(invoice.id, {
      matchStatus: "MATCHED",
      matchNotes: `${invoice.matchNotes ?? ""} · payout ${batchId}`,
      status: "PAYOUT_SUBMITTED",
      orderId: invoice.orderId,
    });

    return res.status(201).json({
      batchId,
      paypal: paypalPayload,
      paypalBatchId,
      status: paypalStatus,
      toolkitError,
      note: toolkitError
        ? "Payout saved locally for the demo. Seller desk → Payouts completed will show it. Configure a real sandbox receiver email for live PayPal Payouts."
        : "Batch status updates arrive via PAYMENT.PAYOUTSBATCH.* webhooks when configured",
    });
  } catch (err) {
    console.error("[invoices] payout persist failed", err);
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
