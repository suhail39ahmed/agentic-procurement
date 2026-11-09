"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarDays, PackageSearch, Globe, RefreshCw } from "lucide-react";
import s from "./dashboard.module.css";
import type { GanttDependency, GanttTaskRow } from "./BryntumGanttPanel";

const BryntumGanttPanel = dynamic(
  () => import("./BryntumGanttPanel").then((m) => m.BryntumGanttPanel),
  { ssr: false, loading: () => <p className={s.description}>Loading Bryntum Gantt…</p> },
);

type AgentLogEntry = {
  at: string;
  signal: string;
  action: string;
  taskIds: string[];
};

type SchedulePayload = {
  provider?: string;
  note?: string;
  tasks?: GanttTaskRow[];
  dependencies?: GanttDependency[];
  agentLog?: AgentLogEntry[];
  projectStartDate?: string;
  projectEndDate?: string;
  error?: string;
};

export function SponsorsPanel({
  setNotice,
  onChannel3Suggestion,
  onKernelInvoiceText,
}: {
  setNotice: (value: string) => void;
  onChannel3Suggestion?: (fields: {
    brief: string;
    quantity: string;
    maxUnitPrice: string;
    currency: "USD";
    neededByDays: string;
    priority: "balanced";
  }) => void;
  onKernelInvoiceText?: (text: string) => void;
}) {
  const [status, setStatus] = useState<Record<string, boolean | number | null>>({});
  const [query, setQuery] = useState("office sticky notes pack");
  const [products, setProducts] = useState<Array<{
    title: string;
    price?: number;
    currency?: string;
    retailer?: string;
    productId?: string;
  }>>([]);
  const [kernelUrl, setKernelUrl] = useState("https://example.com");
  const [schedule, setSchedule] = useState<SchedulePayload | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSchedule = useCallback(async () => {
    const response = await fetch("/api/sponsors/schedule", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as SchedulePayload;
    if (response.ok) setSchedule(payload);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const st = await fetch("/api/sponsors/status", { cache: "no-store" });
        if (st.ok) setStatus(await st.json() as Record<string, boolean | number | null>);
        await loadSchedule();
      })().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSchedule]);

  async function searchChannel3() {
    setBusy(true);
    setProducts([]);
    try {
      const response = await fetch("/api/sponsors/channel3/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, maxPrice: 250 }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        note?: string;
        configured?: boolean;
        products?: Array<{
          title: string;
          price?: number;
          currency?: string;
          retailer?: string;
          productId?: string;
        }>;
        suggestion?: {
          brief: string;
          quantity: number;
          maxUnitPrice: string;
          neededByDays: number;
        } | null;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Channel3 search failed.");
        return;
      }
      const rows = Array.isArray(payload.products) ? payload.products : [];
      setProducts(rows);
      setNotice(
        rows.length
          ? `${payload.note ?? "Channel3 results"} · pick a product to fill the RFQ.`
          : (payload.note ?? (payload.configured ? "No products" : "Channel3 not configured")),
      );
    } finally {
      setBusy(false);
    }
  }

  function useProduct(product: {
    title: string;
    price?: number;
    retailer?: string;
  }) {
    if (!onChannel3Suggestion) return;
    const unit = product.price != null && Number.isFinite(product.price)
      ? Math.min(product.price, 250)
      : 25;
    const retailer = product.retailer ? ` from ${product.retailer}` : "";
    onChannel3Suggestion({
      brief: `Supply 1× "${product.title}"${retailer}. Match or beat unit price ≤ $${unit.toFixed(2)} USD. Prefer in-stock; ship within 14 days.`.slice(0, 500),
      quantity: "1",
      maxUnitPrice: unit.toFixed(2),
      currency: "USD",
      neededByDays: "14",
      priority: "balanced",
    });
    setNotice(`Selected “${product.title}” — Overview RFQ filled. Review → Queue.`);
  }

  async function kernelFetch() {
    setBusy(true);
    try {
      const response = await fetch("/api/sponsors/kernel/fetch-invoice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: kernelUrl }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        note?: string;
        text?: string;
        source?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "KERNEL fetch failed.");
        return;
      }
      if (payload.text && onKernelInvoiceText) {
        onKernelInvoiceText(payload.text);
        setNotice(`${payload.note ?? "Fetched"} · opened Payables with page text for extract.`);
      } else {
        setNotice(`${payload.note ?? "Fetched"} · ${payload.source} · ${payload.text?.slice(0, 80) ?? ""}…`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function reschedule(kind: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/sponsors/schedule/reschedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const payload = await response.json().catch(() => ({})) as SchedulePayload;
      if (!response.ok) {
        setNotice(payload.error ?? "Reschedule failed.");
        return;
      }
      setSchedule(payload);
      const latest = payload.agentLog?.[0];
      setNotice(latest ? `Bryntum agent: ${latest.action}` : `Applied ${kind}`);
    } finally {
      setBusy(false);
    }
  }

  async function resetSchedule() {
    setBusy(true);
    try {
      const response = await fetch("/api/sponsors/schedule/reset", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as SchedulePayload;
      if (!response.ok) {
        setNotice(payload.error ?? "Reset failed.");
        return;
      }
      setSchedule(payload);
      setNotice("Schedule reset to baseline milestones.");
    } finally {
      setBusy(false);
    }
  }

  const tasks = schedule?.tasks ?? [];
  const dependencies = schedule?.dependencies ?? [];

  return (
    <div className={s.stretchGrid}>
      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><PackageSearch size={20} /></span>
            <div>
              <h2>Channel3 product catalog</h2>
              <p className={s.description}>
                Search real products and prices, pick one to fill the Overview RFQ.{" "}
                {status.channel3 ? "API key live." : "Set CHANNEL3_API_KEY to activate."}
              </p>
            </div>
          </div>
        </div>
        <div className={s.field}>
          <label htmlFor="c3-q">Search query</label>
          <input id="c3-q" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className={s.reviewActions}>
          <button type="button" className={s.primary} disabled={busy} title="Search Channel3 catalog" onClick={() => void searchChannel3()}>
            Search catalog <ArrowRight size={15} />
          </button>
        </div>
        {products.length > 0 && (
          <ul className={s.channel3List} aria-label="Channel3 catalog results">
            {products.map((product, index) => {
              const priceLabel = product.price != null && Number.isFinite(product.price)
                ? `$${product.price.toFixed(2)} ${product.currency ?? "USD"}`
                : "Price n/a";
              return (
                <li key={product.productId ?? `${product.title}-${index}`}>
                  <div>
                    <strong>{product.title}</strong>
                    <span>{priceLabel}{product.retailer ? ` · ${product.retailer}` : ""}</span>
                  </div>
                  <button type="button" className={s.secondary} onClick={() => useProduct(product)}>
                    Use this
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><Globe size={20} /></span>
            <div>
              <h2>KERNEL → Payables extract</h2>
              <p className={s.description}>
                Fetch a public invoice page, then open Payables with that text ready to Extract.{" "}
                {status.kernel ? "Key present." : "Optional KERNEL_API_KEY (direct fetch still works)."}
              </p>
            </div>
          </div>
        </div>
        <div className={s.field}>
          <label htmlFor="k-url">Public invoice / page URL</label>
          <input id="k-url" value={kernelUrl} onChange={(e) => setKernelUrl(e.target.value)} />
        </div>
        <div className={s.reviewActions}>
          <button type="button" className={s.secondary} disabled={busy} title="Fetch page text via KERNEL bridge" onClick={() => void kernelFetch()}>
            Fetch page text
          </button>
        </div>
      </section>

      <section className={`${s.card} ${s.stretchCard}`} style={{ gridColumn: "1 / -1" }}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><CalendarDays size={20} /></span>
            <div>
              <h2>Bryntum Gantt — payment-aware rescheduler</h2>
              <p className={s.description}>
                Agent watches PayPal capture / refund / dispute signals and moves or flags milestones.
                {status.bryntumLicenseConfigured ? " License env seen on API." : " Set NEXT_PUBLIC_BRYNTUM_LICENSE_KEY (or VITE_) on the web service."}
              </p>
            </div>
          </div>
          <button type="button" className={s.secondary} disabled={busy} title="Reload schedule" onClick={() => void loadSchedule()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        <BryntumGanttPanel
          tasks={tasks}
          dependencies={dependencies}
          projectStartDate={schedule?.projectStartDate}
          projectEndDate={schedule?.projectEndDate}
        />

        <div className={s.reviewActions} style={{ flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void reschedule("capture_ok")}>Simulate capture OK</button>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void reschedule("capture_late")}>Simulate late capture</button>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void reschedule("capture_fail")}>Simulate fail</button>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void reschedule("refund")}>Simulate refund</button>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void reschedule("dispute")}>Simulate dispute</button>
          <button type="button" className={s.primary} disabled={busy} onClick={() => void resetSchedule()}>Reset plan</button>
        </div>

        {schedule?.agentLog && schedule.agentLog.length > 0 && (
          <div className={s.agentRegistry} style={{ marginTop: 12 }}>
            {schedule.agentLog.slice(0, 5).map((entry) => (
              <article key={`${entry.at}-${entry.signal}`}>
                <strong>{entry.signal}</strong>
                <p>{entry.action}</p>
                <p>{new Date(entry.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · {entry.taskIds.join(", ")}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
