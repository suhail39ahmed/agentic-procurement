"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight, FileText, RefreshCw, Send, ShieldCheck, Wallet,
} from "lucide-react";
import s from "./dashboard.module.css";
import { DisputePanel } from "./DisputePanel";

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
};

const SAMPLE_INVOICE = `INVOICE INV-DEMO-150
Vendor: BundleBits Supply Co
Bill to: ProcureAI Sandbox
Due: 2026-11-20
Line: Demo micro pack x1 @ 1.50 USD
Total due: 1.50 USD
`;

export function PayablesPanel({
  setNotice,
  seedText,
}: {
  setNotice: (value: string) => void;
  /** When set (e.g. from KERNEL fetch), replace the extract textarea. */
  seedText?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  // Parent remounts this panel with a new key when KERNEL seeds text (avoids setState-in-effect).
  const [text, setText] = useState(() =>
    typeof seedText === "string" && seedText.trim()
      ? seedText.trim().slice(0, 20_000)
      : SAMPLE_INVOICE,
  );
  const [items, setItems] = useState<SupplierInvoice[]>([]);
  const [poAmount, setPoAmount] = useState("1.50");
  const [receiptAmount, setReceiptAmount] = useState("1.50");
  const [receiver, setReceiver] = useState("seller-a@business.example.com");
  const [clientEmail, setClientEmail] = useState("client-agentic@personal.example.com");
  const [clientAmount, setClientAmount] = useState("1.50");

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function extract() {
    setBusy(true);
    try {
      const response = await fetch("/api/invoices/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        invoice?: SupplierInvoice;
        hint?: string;
      };
      if (!response.ok) {
        setNotice([payload.error, payload.hint].filter(Boolean).join(" — ") || "Extract failed.");
        return;
      }
      setNotice(
        `Extracted ${payload.invoice?.invoiceNumber ?? payload.invoice?.id?.slice(0, 8)} · $${payload.invoice?.amount.toFixed(2)} · confidence ${payload.invoice?.confidence ?? "?"}%`,
      );
      await refresh();
    } finally {
      setBusy(false);
    }
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
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Payout failed.");
        return;
      }
      setNotice(`Payout submitted · ${payload.batchId} · ${payload.note ?? ""}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function createClientInvoice() {
    setBusy(true);
    try {
      const response = await fetch("/api/invoices/paypal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: clientEmail,
          amount: clientAmount,
          note: "ProcureAI sandbox client invoice (≤$2 demo)",
          send: true,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        invoiceId?: string;
        note?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Client invoice failed.");
        return;
      }
      setNotice(`Client invoice ${payload.invoiceId ?? "created"} · ${payload.note ?? ""}`);
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
              <h2>Supplier invoice extract</h2>
              <p className={s.description}>
                Paste invoice text (or load via Automation → KERNEL) → Extract → Match → Payout. Demo cap ≤ $2.
                Sample text below works without a URL.
              </p>
            </div>
          </div>
          <button type="button" className={s.secondary} disabled={busy} title="Reload extracted invoices" onClick={() => void refresh()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <label className={s.label} htmlFor="inv-text">Invoice text</label>
        <textarea
          id="inv-text"
          className={s.payablesTextarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
        />
        <div className={s.reviewActions}>
          <button
            type="button"
            className={s.primary}
            disabled={busy}
            title="Extract fields with the Azure extractor model"
            onClick={() => void extract()}
          >
            Extract invoice <ArrowRight size={15} />
          </button>
        </div>
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
        {items.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyIcon}><FileText size={24} /></span>
            <h3>No extracted invoices</h3>
            <p>Extract the sample $1.50 invoice first, then match and pay.</p>
          </div>
        ) : (
          <ul className={s.draftList}>
            {items.map((inv) => (
              <li key={inv.id}>
                <div className={s.iconTile}><Wallet size={18} /></div>
                <div className={s.draftDetail}>
                  <strong>
                    {inv.vendorName ?? "Vendor"} · {inv.currency} {inv.amount.toFixed(2)}
                  </strong>
                  <p>
                    {inv.invoiceNumber ?? inv.id.slice(0, 8)} · {inv.matchStatus} · {inv.status}
                    {inv.lowConfidence ? " · low confidence" : ""}
                    {inv.matchNotes ? ` · ${inv.matchNotes}` : ""}
                  </p>
                  <div className={s.reviewActions}>
                    <button type="button" className={s.secondary} disabled={busy} title="Run three-way match" onClick={() => void match(inv.id)}>
                      Match
                    </button>
                    <button
                      type="button"
                      className={s.primary}
                      disabled={busy || inv.matchStatus !== "MATCHED"}
                      title="Submit PayPal Payouts batch (MATCHED only, ≤$2)"
                      onClick={() => void payout(inv.id)}
                    >
                      Payout <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><Send size={20} /></span>
            <div>
              <h2>Client invoice (Toolkit)</h2>
              <p className={s.description}>create_invoice + send_invoice via PayPal Agent Toolkit. Default $1.50.</p>
            </div>
          </div>
        </div>
        <div className={s.fieldGrid}>
          <div className={s.field}>
            <label htmlFor="client-email">Client email</label>
            <input id="client-email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor="client-amt">Amount (USD ≤ 2)</label>
            <input id="client-amt" value={clientAmount} onChange={(e) => setClientAmount(e.target.value)} />
          </div>
        </div>
        <div className={s.reviewActions}>
          <button
            type="button"
            className={s.primary}
            disabled={busy}
            title="Create and send a sandbox client invoice"
            onClick={() => void createClientInvoice()}
          >
            Create &amp; send <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <section className={`${s.card} ${s.stretchCard}`}>
        <DisputePanel notice="" setNotice={setNotice} />
      </section>
    </div>
  );
}
