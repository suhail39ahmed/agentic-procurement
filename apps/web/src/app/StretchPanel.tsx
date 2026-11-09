"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight, Bell, LineChart, Package, RefreshCw, ShieldCheck, Wallet,
} from "lucide-react";
import s from "./dashboard.module.css";

type FxQuote = {
  supplier: string;
  unitPrice: number;
  currency: string;
  leadTimeDays: number;
  unitPriceUsd: number;
  unitPriceBase: number;
};

type ReplenishmentRule = {
  id: string;
  sku: string;
  label: string;
  thresholdQty: number;
  reorderQty: number;
  maxUnitPrice: number;
  currency: string;
  lastTriggeredAt?: string;
  lastNegotiationId?: string;
};

type SlackApproval = {
  id: string;
  orderTotal: number;
  currency: string;
  supplierId?: string;
  status: string;
  createdAt: string;
  decidedAt?: string;
};

type ForecastPoint = { month: string; amountUsd: number };

export function StretchPanel({
  setNotice,
}: {
  setNotice: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [fxBase, setFxBase] = useState<"USD" | "SGD" | "INR">("USD");
  const [fxQuotes, setFxQuotes] = useState<FxQuote[]>([]);
  const [fxWinner, setFxWinner] = useState<FxQuote | null>(null);
  const [rules, setRules] = useState<ReplenishmentRule[]>([]);
  const [stock, setStock] = useState<Array<{ sku: string; onHand: number }>>([]);
  const [approvals, setApprovals] = useState<SlackApproval[]>([]);
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [forecast, setForecast] = useState<{
    series: ForecastPoint[];
    forecastNextMonthUsd: number;
    method: string;
    warehouseExport?: { columns: string[]; rows: string[][] };
  } | null>(null);

  const [sku, setSku] = useState("CHAIR-MESH-01");
  const [label, setLabel] = useState("Ergonomic mesh chairs");
  const [threshold, setThreshold] = useState("20");
  const [reorder, setReorder] = useState("50");
  const [onHand, setOnHand] = useState("15");
  const [approvalAmount, setApprovalAmount] = useState("1250.00");

  async function refreshAll() {
    const [rep, slack, fc] = await Promise.all([
      fetch("/api/stretch/replenishment", { cache: "no-store" }),
      fetch("/api/stretch/slack/approvals", { cache: "no-store" }),
      fetch("/api/stretch/forecast", { cache: "no-store" }),
    ]);
    if (rep.ok) {
      const payload = await rep.json() as { items?: ReplenishmentRule[]; stock?: Array<{ sku: string; onHand: number }> };
      setRules(Array.isArray(payload.items) ? payload.items : []);
      setStock(Array.isArray(payload.stock) ? payload.stock : []);
    }
    if (slack.ok) {
      const payload = await slack.json() as { items?: SlackApproval[]; configured?: boolean };
      setApprovals(Array.isArray(payload.items) ? payload.items : []);
      setSlackConfigured(payload.configured === true);
    }
    if (fc.ok) {
      const payload = await fc.json() as typeof forecast;
      setForecast(payload);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAll().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function compareFx() {
    setBusy(true);
    try {
      const response = await fetch("/api/stretch/fx/normalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          base: fxBase,
          maxUnitPrice: fxBase === "USD" ? 200 : fxBase === "SGD" ? 270 : 17000,
          neededByDays: 21,
          quotes: [
            { supplier: "Anchor SG", unitPrice: 268, currency: "SGD", leadTimeDays: 12 },
            { supplier: "BundleWorks US", unitPrice: 185, currency: "USD", leadTimeDays: 18 },
            { supplier: "Indie India", unitPrice: 14900, currency: "INR", leadTimeDays: 22 },
          ],
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        quotes?: FxQuote[];
        winner?: FxQuote | null;
        comparison?: Array<{ rank: number; supplier: string; original: string; normalised: string }>;
        error?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "FX compare failed.");
        return;
      }
      setFxQuotes(Array.isArray(payload.quotes) ? payload.quotes : []);
      setFxWinner(payload.winner ?? null);
      const lines = (payload.comparison ?? [])
        .map((c) => `#${c.rank} ${c.supplier}: ${c.original} → ${c.normalised}`)
        .join(" · ");
      setNotice(`FX into ${fxBase}. Winner: ${payload.winner?.supplier ?? "n/a"}. ${lines}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveRule() {
    setBusy(true);
    try {
      const response = await fetch("/api/stretch/replenishment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sku,
          label,
          thresholdQty: Number(threshold),
          reorderQty: Number(reorder),
          onHand: Number(onHand),
          maxUnitPrice: 200,
          currency: "USD",
          neededByDays: 21,
          priority: "balanced",
        }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; note?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Could not save replenishment rule.");
        return;
      }
      setNotice(payload.note ?? "Replenishment rule saved.");
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function evaluateRules() {
    setBusy(true);
    try {
      const stockRes = await fetch("/api/stretch/replenishment/stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku, onHand: Number(onHand) }),
      });
      if (!stockRes.ok) {
        const stockPayload = await stockRes.json().catch(() => ({})) as { error?: string };
        setNotice(stockPayload.error ?? "Set stock failed — save the rule first.");
        return;
      }
      const response = await fetch("/api/stretch/replenishment/evaluate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoQueue: true }),
      });
      const payload = await response.json().catch(() => ({})) as {
        triggered?: Array<{ sku: string; negotiationId?: string; onHand: number; thresholdQty: number }>;
        note?: string;
        error?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Evaluate failed.");
        return;
      }
      const queued = (payload.triggered ?? []).filter((t) => t.negotiationId);
      setNotice(
        queued.length
          ? `Low-stock fired → queued ${queued.map((t) => `${t.sku} (${t.negotiationId!.slice(0, 8)}…)`).join(", ")}`
          : (payload.note ?? "No SKUs at or below threshold."),
      );
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function postSlackApproval() {
    setBusy(true);
    try {
      const response = await fetch("/api/stretch/slack/approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderTotal: Number(approvalAmount),
          currency: "USD",
          supplierId: "seller-a",
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        note?: string;
        error?: string;
        approval?: { id: string };
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Slack approval failed.");
        return;
      }
      setNotice(payload.note ?? `Approval ${payload.approval?.id} created.`);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function decide(id: string, decision: "APPROVED" | "DENIED") {
    setBusy(true);
    try {
      const response = await fetch("/api/stretch/slack/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Decision failed.");
        return;
      }
      setNotice(`Approval ${id.slice(0, 8)}… ${decision.toLowerCase()}.`);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    if (!forecast?.warehouseExport) return;
    const { columns, rows } = forecast.warehouseExport;
    const csv = [columns.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "procureai-spend-forecast.csv";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Warehouse CSV downloaded — stage into Databricks/Snowflake.");
  }

  const maxSpend = Math.max(
    1,
    ...(forecast?.series.map((p) => p.amountUsd) ?? [1]),
    forecast?.forecastNextMonthUsd ?? 1,
  );

  return (
    <div className={s.stretchGrid}>
      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><Wallet size={20} /></span>
            <div>
              <h2>Multi-currency quotes</h2>
              <p className={s.description}>Compare USD / SGD / INR after FX normalisation into one base.</p>
            </div>
          </div>
          <button
            type="button"
            className={s.primary}
            disabled={busy}
            title="Normalise sandbox FX rates and rank quotes by unit price in the selected base"
            onClick={() => void compareFx()}
          >
            Compare quotes <ArrowRight size={15} />
          </button>
        </div>
        <div className={s.field} style={{ maxWidth: 160, marginBottom: 14 }}>
          <label htmlFor="fx-base">Base currency</label>
          <select id="fx-base" value={fxBase} onChange={(e) => setFxBase(e.target.value as typeof fxBase)}>
            <option value="USD">USD</option>
            <option value="SGD">SGD</option>
            <option value="INR">INR</option>
          </select>
        </div>
        {fxQuotes.length === 0 ? (
          <div className={s.empty}>
            <span className={s.emptyIcon}><Wallet size={24} /></span>
            <h3>No FX comparison yet</h3>
            <p>Run Compare quotes to see SGD/INR/USD offers ranked in one currency.</p>
          </div>
        ) : (
          <ul className={s.draftList}>
            {fxQuotes.map((q) => (
              <li key={`${q.supplier}-${q.currency}`}>
                <div className={s.iconTile}><Wallet size={18} /></div>
                <div className={s.draftDetail}>
                  <strong>{q.supplier}</strong>
                  <p>
                    {q.currency} {q.unitPrice.toFixed(2)} → {fxBase} {q.unitPriceBase.toFixed(2)}
                    {" · "}{q.leadTimeDays}d
                    {fxWinner?.supplier === q.supplier ? " · winner" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><Package size={20} /></span>
            <div>
              <h2>Recurring replenishment</h2>
              <p className={s.description}>Low-stock rules auto-queue a sourcing negotiation.</p>
            </div>
          </div>
          <button
            type="button"
            className={s.secondary}
            disabled={busy}
            title="Refresh rules and on-hand stock from the API"
            onClick={() => void refreshAll()}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className={s.fieldGrid}>
          <div className={s.field}>
            <label htmlFor="rep-sku">SKU</label>
            <input id="rep-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor="rep-label">Label</label>
            <input id="rep-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor="rep-threshold">Threshold qty</label>
            <input id="rep-threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor="rep-reorder">Reorder qty</label>
            <input id="rep-reorder" value={reorder} onChange={(e) => setReorder(e.target.value)} />
          </div>
          <div className={s.field}>
            <label htmlFor="rep-onhand">On hand now</label>
            <input id="rep-onhand" value={onHand} onChange={(e) => setOnHand(e.target.value)} />
          </div>
        </div>
        <div className={s.reviewActions}>
          <button
            type="button"
            className={s.secondary}
            disabled={busy}
            title="Save the low-stock rule for this SKU"
            onClick={() => void saveRule()}
          >
            Save rule
          </button>
          <button
            type="button"
            className={s.primary}
            disabled={busy}
            title="If on-hand ≤ threshold, queue a live negotiation automatically"
            onClick={() => void evaluateRules()}
          >
            Evaluate &amp; queue <ArrowRight size={15} />
          </button>
        </div>
        {rules.length > 0 && (
          <ul className={s.draftList}>
            {rules.map((r) => {
              const level = stock.find((x) => x.sku === r.sku)?.onHand;
              return (
                <li key={r.id}>
                  <div className={s.iconTile}><Package size={18} /></div>
                  <div className={s.draftDetail}>
                    <strong>{r.label}</strong>
                    <p>
                      {r.sku} · threshold {r.thresholdQty} · reorder {r.reorderQty}
                      {level !== undefined ? ` · on hand ${level}` : ""}
                      {r.lastNegotiationId ? ` · queued ${r.lastNegotiationId.slice(0, 8)}…` : ""}
                    </p>
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
            <span className={s.iconTile}><Bell size={20} /></span>
            <div>
              <h2>Slack approvals</h2>
              <p className={s.description}>
                Post an approval card{slackConfigured ? " via webhook" : " (local until SLACK_WEBHOOK_URL is set)"}.
                Button decisions persist here.
              </p>
            </div>
          </div>
        </div>
        <div className={s.field} style={{ maxWidth: 200 }}>
          <label htmlFor="slack-amt">Order total (USD)</label>
          <input id="slack-amt" value={approvalAmount} onChange={(e) => setApprovalAmount(e.target.value)} />
        </div>
        <div className={s.reviewActions}>
          <button
            type="button"
            className={s.primary}
            disabled={busy}
            title="Create an approval request and post to Slack when the webhook is configured"
            onClick={() => void postSlackApproval()}
          >
            Request approval <ArrowRight size={15} />
          </button>
        </div>
        {approvals.length === 0 ? (
          <div className={s.empty} style={{ marginTop: 16 }}>
            <span className={s.emptyIcon}><ShieldCheck size={24} /></span>
            <h3>No approvals yet</h3>
            <p>Request approval for a spend, then Approve or Deny to persist the decision.</p>
          </div>
        ) : (
          <ul className={s.draftList}>
            {approvals.map((a) => (
              <li key={a.id}>
                <div className={s.iconTile}><Bell size={18} /></div>
                <div className={s.draftDetail}>
                  <strong>{a.currency} {a.orderTotal.toFixed(2)} · {a.status}</strong>
                  <p>{a.supplierId ?? "supplier n/a"} · {new Date(a.createdAt).toLocaleString()}</p>
                  {a.status === "PENDING" && (
                    <div className={s.reviewActions}>
                      <button type="button" className={s.secondary} disabled={busy} title="Persist DENIED decision" onClick={() => void decide(a.id, "DENIED")}>Deny</button>
                      <button type="button" className={s.primary} disabled={busy} title="Persist APPROVED decision" onClick={() => void decide(a.id, "APPROVED")}>Approve</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><LineChart size={20} /></span>
            <div>
              <h2>Spend forecasting</h2>
              <p className={s.description}>Trend from ledger + warehouse CSV for Databricks/Snowflake.</p>
            </div>
          </div>
          <button
            type="button"
            className={s.secondary}
            disabled={!forecast?.warehouseExport}
            title="Download CSV for Databricks or Snowflake staging"
            onClick={downloadCsv}
          >
            Export CSV
          </button>
        </div>
        {!forecast ? (
          <div className={s.empty}>
            <span className={s.emptyIcon}><LineChart size={24} /></span>
            <h3>Loading forecast…</h3>
            <p>Pulling monthly spend from succeeded negotiations.</p>
          </div>
        ) : (
          <>
            <p className={s.description} style={{ marginBottom: 14 }}>
              Next month forecast: <strong>${forecast.forecastNextMonthUsd.toFixed(2)}</strong>
              {" · "}{forecast.method}
            </p>
            <div className={s.forecastChart} role="img" aria-label="Monthly spend bar chart">
              {forecast.series.map((p) => (
                <div key={p.month} className={s.forecastBarWrap}>
                  <div
                    className={s.forecastBar}
                    style={{ height: `${Math.max(8, (p.amountUsd / maxSpend) * 100)}%` }}
                    title={`$${p.amountUsd.toFixed(0)}`}
                  />
                  <span>{p.month.slice(5)}</span>
                </div>
              ))}
              <div className={s.forecastBarWrap}>
                <div
                  className={`${s.forecastBar} ${s.forecastBarNext}`}
                  style={{ height: `${Math.max(8, (forecast.forecastNextMonthUsd / maxSpend) * 100)}%` }}
                  title={`Forecast $${forecast.forecastNextMonthUsd.toFixed(0)}`}
                />
                <span>Next</span>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
