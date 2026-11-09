"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, PackageSearch, Globe } from "lucide-react";
import s from "./dashboard.module.css";

type TimelineEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  type: string;
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
  const [kernelUrl, setKernelUrl] = useState("https://example.com");
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const [st, tl] = await Promise.all([
          fetch("/api/sponsors/status", { cache: "no-store" }),
          fetch("/api/sponsors/timeline", { cache: "no-store" }),
        ]);
        if (st.ok) setStatus(await st.json() as Record<string, boolean | number | null>);
        if (tl.ok) {
          const payload = await tl.json() as { events?: TimelineEvent[] };
          setEvents(Array.isArray(payload.events) ? payload.events : []);
        }
      })().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function searchChannel3() {
    setBusy(true);
    try {
      const response = await fetch("/api/sponsors/channel3/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, maxPrice: 2 }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        note?: string;
        configured?: boolean;
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
      setNotice(payload.note ?? (payload.configured ? "Channel3 ok" : "Channel3 not configured"));
      if (payload.suggestion && onChannel3Suggestion) {
        onChannel3Suggestion({
          brief: payload.suggestion.brief,
          quantity: String(payload.suggestion.quantity),
          maxUnitPrice: payload.suggestion.maxUnitPrice,
          currency: "USD",
          neededByDays: String(payload.suggestion.neededByDays),
          priority: "balanced",
        });
      }
    } finally {
      setBusy(false);
    }
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

  return (
    <div className={s.stretchGrid}>
      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><PackageSearch size={20} /></span>
            <div>
              <h2>Channel3 → RFQ for sellers</h2>
              <p className={s.description}>
                Search catalog (≤$2), load Overview RFQ, then Queue negotiation so sellers quote that product.{" "}
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
          <button type="button" className={s.primary} disabled={busy} title="Search Channel3 and prefill RFQ suggestion" onClick={() => void searchChannel3()}>
            Enrich RFQ <ArrowRight size={15} />
          </button>
        </div>
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

      <section className={`${s.card} ${s.stretchCard}`}>
        <div className={s.sectionHeader}>
          <div className={s.inlineTitle}>
            <span className={s.iconTile}><CalendarDays size={20} /></span>
            <div>
              <h2>Bryntum schedule timeline</h2>
              <p className={s.description}>Delivery, replenishment, and payout due dates (scheduler category UI).</p>
            </div>
          </div>
        </div>
        <div className={s.timeline}>
          {events.map((ev) => (
            <div key={ev.id} className={s.timelineRow}>
              <strong>{ev.type}</strong>
              <div className={s.timelineBar} title={`${ev.start} → ${ev.end}`}>
                {ev.title}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
