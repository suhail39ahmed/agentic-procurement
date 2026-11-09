"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import s from "./dashboard.module.css";

type LocalDispute = {
  disputeId: string;
  status: string;
  reason: string;
  amount?: string;
  agentDraft?: string;
  agentDraftAt?: string;
  acceptApprovedBy?: string;
};

export function DisputePanel({
  notice,
  setNotice,
}: {
  notice: string;
  setNotice: (value: string) => void;
}) {
  const [items, setItems] = useState<LocalDispute[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/disputes", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as {
      local?: LocalDispute[];
      error?: string;
      toolkitError?: string;
    };
    if (!response.ok) {
      setNotice(payload.error ?? `Disputes failed (${response.status}).`);
      return;
    }
    setItems(Array.isArray(payload.local) ? payload.local : []);
    if (payload.toolkitError) {
      setNotice(`Toolkit list warning: ${payload.toolkitError}`);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function simulate() {
    setBusy(true);
    try {
      const response = await fetch("/api/disputes/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        disputeId?: string;
        eventType?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Simulate dispute failed.");
        return;
      }
      setNotice(`${payload.eventType ?? "CUSTOMER.DISPUTE.CREATED"} · ${payload.disputeId}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function draft(id: string) {
    setBusy(true);
    setSelected(id);
    try {
      const response = await fetch(`/api/disputes/${encodeURIComponent(id)}/draft`, { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Draft failed.");
        return;
      }
      setNotice("Agent draft stored. Review, then accept only if you approve.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/disputes/${encodeURIComponent(id)}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approved: true, note: "Owner approved from dashboard" }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Accept failed (sandbox Toolkit).");
        return;
      }
      setNotice("accept_dispute_claim invoked behind owner approval.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.reviewPanel} style={{ marginTop: 18 }}>
      <div className={s.sectionHeader}>
        <div>
          <h3>Disputes (PayPal Agent Toolkit)</h3>
          <p className={s.description}>list/get via Toolkit · agent draft stored · accept_dispute_claim only after approval</p>
        </div>
        <div className={s.reviewActions}>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void refresh()}>Refresh</button>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void simulate()}>Simulate CUSTOMER.DISPUTE.CREATED</button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyIcon}><ShieldCheck size={26} /></span>
          <h3>No disputes yet</h3>
          <p>Simulate a sandbox dispute or wait for a PayPal webhook.</p>
        </div>
      ) : (
        <ul className={s.draftList}>
          {items.map((item) => (
            <li key={item.disputeId}>
              <div className={s.iconTile}><ShieldCheck size={19} /></div>
              <details className={s.draftDetail} open={selected === item.disputeId}>
                <summary>{item.disputeId} · {item.status}</summary>
                <p>{item.reason}{item.amount ? ` · $${item.amount}` : ""}</p>
                {item.agentDraft && <p><strong>Draft:</strong> {item.agentDraft}</p>}
                {item.acceptApprovedBy && <p>Accepted by {item.acceptApprovedBy}</p>}
                <div className={s.reviewActions}>
                  <button type="button" className={s.textButton} disabled={busy} onClick={() => void draft(item.disputeId)}>
                    Draft response <ArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    className={s.textButton}
                    disabled={busy || !item.agentDraft || Boolean(item.acceptApprovedBy)}
                    onClick={() => void accept(item.disputeId)}
                  >
                    Approve accept_dispute_claim <ArrowRight size={15} />
                  </button>
                </div>
              </details>
              <span className={s.draftBadge}>{item.status}</span>
            </li>
          ))}
        </ul>
      )}
      {notice ? <p className={s.status} role="status">{notice}</p> : null}
    </div>
  );
}
