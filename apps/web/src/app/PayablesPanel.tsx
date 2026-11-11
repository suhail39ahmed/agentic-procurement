"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Cloud, FileText, Mail, RefreshCw, Send, ShieldCheck, Upload, Wallet,
} from "lucide-react";
import s from "./dashboard.module.css";

type SupplierInvoice = {
  id: string;
  vendorName?: string;
  invoiceNumber?: string;
  amount: number;
  currency: string;
  status: string;
  matchStatus: string;
  matchNotes?: string;
  confidence: number;
  lowConfidence: boolean;
  dueDate?: string;
  source?: string;
};

type StorageDoc = {
  id: string;
  filename: string;
  vendor: string;
  amountLabel: string;
  summary: string;
};

type IngestChannel = "upload" | "email" | "storage";

type InvoiceResult = {
  error?: string;
  hint?: string;
  note?: string;
  emailText?: string;
  filename?: string;
  channel?: string;
  invoice?: SupplierInvoice;
};

export function PayablesPanel({
  setNotice,
  seedText,
}: {
  setNotice: (value: string) => void;
  seedText?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<IngestChannel>("storage");
  const [items, setItems] = useState<SupplierInvoice[]>([]);
  const [storageDocs, setStorageDocs] = useState<StorageDoc[]>([]);
  const [selectedStorage, setSelectedStorage] = useState("");
  const [emailPhase, setEmailPhase] = useState<"idle" | "waiting" | "received" | "extracting" | "done">("idle");
  const [emailText, setEmailText] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadPreview, setUploadPreview] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const emailTokenRef = useRef(0);

  const [poAmount, setPoAmount] = useState("45.00");
  const [receiptAmount, setReceiptAmount] = useState("45.00");
  const [receiver, setReceiver] = useState("seller-a@business.example.com");
  const [clientEmail, setClientEmail] = useState("client-agentic@personal.example.com");
  const [clientAmount, setClientAmount] = useState("45.00");

  // Optional KERNEL seed still supported as paste fallback in upload channel
  const [pasteText, setPasteText] = useState(() =>
    typeof seedText === "string" && seedText.trim()
      ? seedText.trim().slice(0, 20_000)
      : "",
  );

  async function refresh() {
    const response = await fetch("/api/invoices/extracted", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as {
      items?: SupplierInvoice[];
      error?: string;
    };
    if (!response.ok) {
      setNotice(payload.error ?? "Could not load extracted invoices.");
      return;
    }
    setItems(Array.isArray(payload.items) ? payload.items : []);
  }

  async function loadStorage() {
    const response = await fetch("/api/invoices/storage", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as {
      items?: StorageDoc[];
      error?: string;
    };
    if (!response.ok) {
      setNotice(payload.error ?? "Could not list storage vault.");
      return;
    }
    const docs = Array.isArray(payload.items) ? payload.items : [];
    setStorageDocs(docs);
    if (!selectedStorage && docs[0]) setSelectedStorage(docs[0].id);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() => undefined);
      void loadStorage().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyExtractSuccess(payload: InvoiceResult) {
    const inv = payload.invoice;
    setNotice(
      payload.note
      ?? `Extracted ${inv?.invoiceNumber ?? inv?.id?.slice(0, 8)} · $${inv?.amount.toFixed(2)} · ${payload.channel ?? "extract"}`,
    );
    if (inv?.amount) {
      setPoAmount(inv.amount.toFixed(2));
      setReceiptAmount(inv.amount.toFixed(2));
    }
  }

  async function ingestFromStorage(sampleId: string) {
    setBusy(true);
    setNotice("Agent reading vault PDF…");
    try {
      const response = await fetch("/api/invoices/ingest/storage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sampleId }),
      });
      const payload = await response.json().catch(() => ({})) as InvoiceResult;
      if (!response.ok) {
        setNotice([payload.error, payload.hint].filter(Boolean).join(" — ") || `Storage read failed (${response.status}).`);
        return;
      }
      applyExtractSuccess(payload);
      await refresh();
    } catch (err) {
      setNotice(`Storage read failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function ingestFromEmail() {
    const token = ++emailTokenRef.current;
    setBusy(true);
    setEmailPhase("waiting");
    setEmailText("");
    setNotice("Waiting for supplier invoice email (~3s)…");
    try {
      await new Promise((resolve) => setTimeout(resolve, 2800));
      if (token !== emailTokenRef.current) return;

      setEmailPhase("extracting");
      setNotice("Email received — agent extracting PDF attachment…");
      const response = await fetch("/api/invoices/ingest/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sampleId: selectedStorage || storageDocs[0]?.id }),
      });
      const payload = await response.json().catch(() => ({})) as InvoiceResult;
      if (token !== emailTokenRef.current) return;
      if (!response.ok) {
        setEmailPhase("idle");
        setNotice([payload.error, payload.hint].filter(Boolean).join(" — ") || "Email ingest failed.");
        return;
      }
      setEmailText(payload.emailText ?? "");
      setEmailPhase("received");
      applyExtractSuccess(payload);
      await refresh();
      setEmailPhase("done");
    } finally {
      if (token === emailTokenRef.current) setBusy(false);
    }
  }

  async function ingestUpload(opts: { filename: string; text?: string }) {
    setBusy(true);
    setNotice(`Agent reading ${opts.filename}…`);
    try {
      const response = await fetch("/api/invoices/ingest/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filename: opts.filename,
          text: opts.text,
        }),
      });
      const payload = await response.json().catch(() => ({})) as InvoiceResult;
      if (!response.ok) {
        setNotice([payload.error, payload.hint].filter(Boolean).join(" — ") || "Upload extract failed.");
        return;
      }
      applyExtractSuccess(payload);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    setUploadName(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".txt") || lower.endsWith(".md") || file.type.startsWith("text/")) {
      const text = (await file.text()).slice(0, 20_000);
      setUploadPreview(text.slice(0, 600));
      await ingestUpload({ filename: file.name, text });
      return;
    }
    // PDF / other: demo maps to vault sample on the API (Render-safe)
    setUploadPreview(`Binary ${file.name} — agent will read via demo vault mapping on Render (no disk blob).`);
    await ingestUpload({ filename: file.name });
  }

  async function match(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(id)}/match`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          poAmount: Number(poAmount),
          receiptAmount: Number(receiptAmount),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        queuedForPayment?: boolean;
        deltaPct?: number;
        invoice?: SupplierInvoice;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Three-way match failed.");
        return;
      }
      setNotice(
        payload.queuedForPayment
          ? `MATCHED (Δ ${payload.deltaPct?.toFixed(2)}%) — ready for payout.`
          : `MISMATCH (Δ ${payload.deltaPct?.toFixed(2)}%) — ${payload.invoice?.matchNotes ?? ""}`,
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function payout(id: string) {
    setBusy(true);
    setNotice("Submitting payout…");
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(id)}/payout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receiver }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        batchId?: string;
        note?: string;
        status?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? `Payout failed (${response.status}).`);
        return;
      }
      setNotice(`Payout ${payload.status ?? "submitted"} · ${payload.batchId} · ${payload.note ?? ""}`);
      await refresh();
    } catch (err) {
      setNotice(`Payout failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function createClientInvoice() {
    setBusy(true);
    setNotice("Creating client invoice…");
    try {
      const response = await fetch("/api/invoices/paypal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: clientEmail,
          amount: clientAmount,
          note: "ProcureAI sandbox client invoice",
          send: true,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        invoiceId?: string;
        note?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? `Client invoice failed (${response.status}).`);
        return;
      }
      setNotice(`Client invoice ${payload.invoiceId ?? "created"} · ${payload.note ?? ""}`);
    } catch (err) {
      setNotice(`Client invoice failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.stretchGrid}>
      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><FileText size={20} /></span>
            <div>
              <h2>Invoice intake</h2>
              <p className={s.description}>
                Three ways in: <strong>Upload PDF</strong>, <strong>supplier email</strong>, or <strong>storage vault</strong>.
                Same extract → match → payout. Render keeps results in Postgres (no ephemeral disk).
              </p>
            </div>
          </div>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void refresh()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <div className={s.roleSwitch} style={{ marginBottom: 14 }}>
          <button
            type="button"
            className={channel === "upload" ? s.primary : s.secondary}
            onClick={() => setChannel("upload")}
          >
            <Upload size={14} /> Upload PDF
          </button>
          <button
            type="button"
            className={channel === "email" ? s.primary : s.secondary}
            onClick={() => setChannel("email")}
          >
            <Mail size={14} /> From email
          </button>
          <button
            type="button"
            className={channel === "storage" ? s.primary : s.secondary}
            onClick={() => setChannel("storage")}
          >
            <Cloud size={14} /> Storage vault
          </button>
        </div>

        {channel === "upload" && (
          <div className={s.agentCaptureCard}>
            <p className={s.agentCaptureBanner}>1 · Direct upload</p>
            <p className={s.description}>
              Drop a supplier PDF (or .txt). On Render the agent reads the file; binary PDFs map to the demo vault text layer.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,text/plain,application/pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                void onPickFile(file);
                e.target.value = "";
              }}
            />
            <div className={s.reviewActions}>
              <button
                type="button"
                className={s.primary}
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? "Reading…" : "Choose PDF / text"} <Upload size={14} />
              </button>
              {uploadName && <span className={s.pending}>{uploadName}</span>}
            </div>
            {uploadPreview && (
              <pre className={s.shipInboxBody} style={{ marginTop: 10 }}>{uploadPreview}</pre>
            )}
            <label className={s.label} htmlFor="inv-paste" style={{ marginTop: 10 }}>Or paste invoice text</label>
            <textarea
              id="inv-paste"
              className={s.payablesTextarea}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              placeholder="Optional paste / Automation → KERNEL seed…"
            />
            {pasteText.trim() && (
              <div className={s.reviewActions}>
                <button
                  type="button"
                  className={s.secondary}
                  disabled={busy}
                  onClick={() => void ingestUpload({ filename: "pasted.txt", text: pasteText })}
                >
                  Extract pasted text <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {channel === "email" && (
          <div className={s.agentCaptureCard}>
            <p className={s.agentCaptureBanner}>2 · Supplier email → PDF</p>
            <p className={s.description}>
              Like the ship-email path: invoice arrives by email with a PDF attached; the agent extracts fields automatically.
            </p>
            <div className={s.field} style={{ marginTop: 8 }}>
              <label htmlFor="email-sample">Preferred attachment (from vault)</label>
              <select
                id="email-sample"
                value={selectedStorage}
                onChange={(e) => setSelectedStorage(e.target.value)}
              >
                {storageDocs.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.filename} · {doc.vendor} · {doc.amountLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className={s.reviewActions}>
              <button type="button" className={s.primary} disabled={busy} onClick={() => void ingestFromEmail()}>
                {emailPhase === "waiting" ? "Waiting for email…" : emailPhase === "extracting" ? "Extracting…" : "Simulate invoice email"} <Mail size={14} />
              </button>
            </div>
            {(emailPhase === "received" || emailPhase === "done" || emailText) && emailText && (
              <pre className={s.shipInboxBody} style={{ marginTop: 10 }} aria-live="polite">{emailText}</pre>
            )}
          </div>
        )}

        {channel === "storage" && (
          <div className={s.agentCaptureCard}>
            <p className={s.agentCaptureBanner}>3 · Storage vault</p>
            <p className={s.description}>
              Demo vault of supplier PDFs (text layers in the API). On Render this stands in for Azure Blob / S3 — extract results persist in Postgres.
            </p>
            <ul className={s.draftList} style={{ marginTop: 10 }}>
              {storageDocs.map((doc) => (
                <li key={doc.id} className={selectedStorage === doc.id ? s.paymentQueueSelected : undefined}>
                  <div className={s.iconTile}><Cloud size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{doc.filename}</strong>
                    <p>{doc.vendor} · {doc.summary} · {doc.amountLabel}</p>
                    <div className={s.reviewActions} style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className={s.primary}
                        disabled={busy}
                        onClick={() => {
                          setSelectedStorage(doc.id);
                          void ingestFromStorage(doc.id);
                        }}
                      >
                        {busy && selectedStorage === doc.id ? "Reading…" : "Agent read & extract"} <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                  <span className={s.draftBadge}>PDF</span>
                </li>
              ))}
            </ul>
            {storageDocs.length === 0 && (
              <p className={s.tableNote}>Loading vault…</p>
            )}
          </div>
        )}
      </section>

      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><ShieldCheck size={20} /></span>
            <div>
              <h2>Three-way match &amp; payout</h2>
              <p className={s.description}>Compare PO + receipt + invoice, then PayPal Payouts when MATCHED.</p>
            </div>
          </div>
        </div>
        <div className={s.fieldGrid}>
          <div className={s.field}>
            <label htmlFor="po-amt">PO amount (USD)</label>
            <input id="po-amt" value={poAmount} onChange={(e) => setPoAmount(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor="rc-amt">Receipt amount (USD)</label>
            <input id="rc-amt" value={receiptAmount} onChange={(e) => setReceiptAmount(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor="pay-recv">Payout receiver email</label>
            <input id="pay-recv" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
          </div>
        </div>
        <p className={s.tableNote}>
          Flow: extract → set PO/receipt amounts → <strong>Match</strong> → <strong>Payout</strong> (Payout stays off until MATCHED).
        </p>
        {items.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyIcon}><FileText size={24} /></span>
            <h3>No extracted invoices</h3>
            <p>Use Upload, Email, or Storage vault on the left, then match and pay.</p>
          </div>
        ) : (
          <ul className={s.draftList}>
            {items.map((inv) => {
              const canPay = inv.matchStatus === "MATCHED" && inv.status !== "PAYOUT_SUBMITTED";
              const paid = inv.status === "PAYOUT_SUBMITTED";
              return (
                <li key={inv.id}>
                  <div className={s.iconTile}><Wallet size={18} /></div>
                  <div className={s.draftDetail}>
                    <strong>
                      {inv.vendorName ?? "Vendor"} · {inv.currency} {inv.amount.toFixed(2)}
                    </strong>
                    <p>
                      {inv.invoiceNumber ?? inv.id.slice(0, 8)} · {inv.matchStatus} · {inv.status}
                      {inv.source ? ` · via ${inv.source}` : ""}
                      {inv.lowConfidence ? " · low confidence" : ""}
                      {inv.matchNotes ? ` · ${inv.matchNotes}` : ""}
                    </p>
                    <div className={s.reviewActions}>
                      <button
                        type="button"
                        className={s.secondary}
                        disabled={busy || paid}
                        onClick={() => void match(inv.id)}
                      >
                        {inv.matchStatus === "MATCHED" ? "Re-match" : "Match"}
                      </button>
                      <button
                        type="button"
                        className={s.primary}
                        disabled={busy || !canPay}
                        title={
                          paid
                            ? "Already paid"
                            : inv.matchStatus !== "MATCHED"
                              ? "Click Match first"
                              : "Submit payout"
                        }
                        onClick={() => void payout(inv.id)}
                      >
                        {paid ? "Paid" : "Payout"} <ArrowRight size={15} />
                      </button>
                    </div>
                    {inv.matchStatus !== "MATCHED" && !paid && (
                      <p className={s.summaryNote}>Payout disabled until Match succeeds.</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><Send size={20} /></span>
            <div>
              <h2>Client invoice (Toolkit)</h2>
              <p className={s.description}>create_invoice + send_invoice via PayPal Agent Toolkit.</p>
            </div>
          </div>
        </div>
        <div className={s.fieldGrid}>
          <div className={s.field}>
            <label htmlFor="client-email">Client email</label>
            <input id="client-email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor="client-amt">Amount (USD)</label>
            <input id="client-amt" value={clientAmount} onChange={(e) => setClientAmount(e.target.value)} />
          </div>
        </div>
        <div className={s.reviewActions}>
          <button type="button" className={s.primary} disabled={busy} onClick={() => void createClientInvoice()}>
            Create &amp; send <ArrowRight size={15} />
          </button>
        </div>
      </section>
    </div>
  );
}
