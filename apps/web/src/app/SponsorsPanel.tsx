"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import s from "./dashboard.module.css";

export function SponsorsPanel({
  setNotice,
  onKernelInvoiceText,
}: {
  setNotice: (value: string) => void;
  onKernelInvoiceText?: (text: string) => void;
}) {
  const [status, setStatus] = useState<Record<string, boolean | number | null>>({});
  const [kernelUrl, setKernelUrl] = useState("https://example.com");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const st = await fetch("/api/sponsors/status", { cache: "no-store" });
        if (st.ok) setStatus(await st.json() as Record<string, boolean | number | null>);
      })().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
    </div>
  );
}
