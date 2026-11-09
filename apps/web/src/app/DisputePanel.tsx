"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import s from "./dashboard.module.css";

type LocalDispute = {
  disputeId: string;
  status: string;
  reason: string;
  amount?: string;
  orderId?: string | null;
  agentDraft?: string;
  agentDraftAt?: string;
  acceptApprovedBy?: string;
};

export type DisputeInboundSeed = {
  orderId?: string;
  amount?: string;
  supplierId?: string;
  brief?: string;
  /** Bump to re-trigger auto inbound after capture. */
  token: number;
};

type CapturedClaim = {
  disputeId: string;
  reason: string;
  amount?: string;
  orderId?: string | null;
  eventType: string;
};

export function DisputePanel({
  setNotice,
  demoRole = null,
  inboundSeed = null,
}: {
  setNotice: (value: string) => void;
  demoRole?: "buyer" | "owner" | null;
  inboundSeed?: DisputeInboundSeed | null;
}) {
  const isOwner = demoRole === "owner";
  const [items, setItems] = useState<LocalDispute[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [inboundPhase, setInboundPhase] = useState<"idle" | "waiting" | "received" | "reading" | "done">("idle");
  const [inboundEmail, setInboundEmail] = useState("");
  const [capturedClaim, setCapturedClaim] = useState<CapturedClaim | null>(null);
  const inboundTokenRef = useRef(0);
  const lastSeedTokenRef = useRef(0);

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

  async function receiveBuyerDispute(seed?: {
    orderId?: string;
    amount?: string;
    supplierId?: string;
    brief?: string;
  }) {
    const token = ++inboundTokenRef.current;
    setBusy(true);
    setInboundPhase("waiting");
    setInboundEmail("");
    setCapturedClaim(null);
    setNotice("Listening for PayPal CUSTOMER.DISPUTE.CREATED (~4s)…");
    try {
      await new Promise((resolve) => setTimeout(resolve, 3800));
      if (token !== inboundTokenRef.current) return;

      const response = await fetch("/api/disputes/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: seed?.orderId,
          amount: seed?.amount,
          supplierId: seed?.supplierId,
          brief: seed?.brief,
          reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        disputeId?: string;
        eventType?: string;
        emailText?: string;
        reason?: string;
        amount?: string;
        orderId?: string | null;
        note?: string;
      };
      if (!response.ok) {
        setInboundPhase("idle");
        setNotice(payload.error ?? "Buyer dispute did not arrive.");
        return;
      }
      if (token !== inboundTokenRef.current) return;

      setInboundEmail(payload.emailText ?? "");
      setInboundPhase("received");
      setSelected(payload.disputeId ?? null);
      setNotice(`Email received — PayPal dispute webhook. AI agent is reading the claim…`);

      await new Promise((resolve) => setTimeout(resolve, 1400));
      if (token !== inboundTokenRef.current) return;

      setInboundPhase("reading");
      setNotice("AI agent capturing dispute id, reason, amount, and linked order…");

      const claim: CapturedClaim = {
        disputeId: payload.disputeId ?? "unknown",
        reason: payload.reason ?? "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
        amount: payload.amount,
        orderId: payload.orderId,
        eventType: payload.eventType ?? "CUSTOMER.DISPUTE.CREATED",
      };
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (token !== inboundTokenRef.current) return;

      setCapturedClaim(claim);
      await refresh();
      setInboundPhase("done");
      setNotice(
        `Email received ✓ · Agent captured ${claim.disputeId} (${claim.reason}${claim.amount ? ` · $${claim.amount}` : ""}). Draft a response next.`,
      );
    } catch {
      if (token === inboundTokenRef.current) {
        setInboundPhase("idle");
        setNotice("Buyer dispute inbound failed — try Replay buyer claim.");
      }
    } finally {
      if (token === inboundTokenRef.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!inboundSeed?.token || inboundSeed.token === lastSeedTokenRef.current) return;
    lastSeedTokenRef.current = inboundSeed.token;
    void receiveBuyerDispute({
      orderId: inboundSeed.orderId,
      amount: inboundSeed.amount,
      supplierId: inboundSeed.supplierId,
      brief: inboundSeed.brief,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboundSeed?.token]);

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
      setNotice("Agent draft stored. Switch to Supervisor to approve accept_dispute_claim.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: string) {
    if (!isOwner) {
      setNotice("Switch to Supervisor login (supervisor / supervisor) to accept a dispute claim.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/disputes/${encodeURIComponent(id)}/accept`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(demoRole ? { "x-demo-role": demoRole } : {}),
        },
        body: JSON.stringify({ approved: true, note: "Supervisor approved from dashboard" }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Accept failed (sandbox Toolkit).");
        return;
      }
      setNotice("accept_dispute_claim invoked behind Supervisor approval.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.reviewPanel} style={{ marginTop: 18 }}>
      <div className={s.sectionHeader}>
        <div>
          <h3>Disputes</h3>
          <p className={s.description}>
            After capture, a buyer claim arrives (~4s). AI agent reads the webhook email and captures the fields below — then Draft → Supervisor accept.
          </p>
        </div>
        <div className={s.reviewActions}>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void refresh()}>Refresh</button>
          <button
            type="button"
            className={s.secondary}
            disabled={busy}
            onClick={() => void receiveBuyerDispute({
              orderId: inboundSeed?.orderId,
              amount: inboundSeed?.amount,
              supplierId: inboundSeed?.supplierId,
              brief: inboundSeed?.brief,
            })}
          >
            {busy && inboundPhase === "waiting" ? "Waiting…" : "Replay buyer claim"}
          </button>
        </div>
      </div>

      <div className={s.shipInbox} style={{ marginBottom: 14 }}>
        <div className={s.shipInboxHead}>
          <strong>Dispute inbox</strong>
          <span className={s.pending}>
            {inboundPhase === "waiting" && "Waiting for email…"}
            {inboundPhase === "received" && "Email received"}
            {inboundPhase === "reading" && "AI reading…"}
            {inboundPhase === "done" && "Details captured"}
            {inboundPhase === "idle" && (items.length ? "Open claims" : "Quiet")}
          </span>
        </div>
        {inboundPhase === "waiting" && (
          <p className={s.description}>Listening for buyer dispute webhook (~4s)…</p>
        )}
        {(inboundPhase === "received" || inboundPhase === "reading") && inboundEmail && (
          <p className={s.agentCaptureBanner} role="status">
            {inboundPhase === "received"
              ? "Email received — AI agent opening the PayPal dispute message…"
              : "AI agent extracting dispute id, reason, amount, and order…"}
          </p>
        )}
        {inboundEmail ? (
          <pre className={s.shipInboxBody} aria-live="polite">{inboundEmail}</pre>
        ) : (
          <p className={s.tableNote}>
            Confirm delivery & capture on an order, or click <strong>Replay buyer claim</strong>.
          </p>
        )}
        {capturedClaim && (
          <div className={s.agentCaptureCard}>
            <p className={s.agentCaptureBanner} role="status">
              Details captured from email
            </p>
            <dl className={s.summaryList}>
              <div><dt>Event</dt><dd>{capturedClaim.eventType}</dd></div>
              <div><dt>Dispute</dt><dd>{capturedClaim.disputeId}</dd></div>
              <div><dt>Reason</dt><dd>{capturedClaim.reason}</dd></div>
              {capturedClaim.amount && <div><dt>Amount</dt><dd>${capturedClaim.amount}</dd></div>}
              {capturedClaim.orderId && <div><dt>Order</dt><dd>{capturedClaim.orderId}</dd></div>}
            </dl>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyIcon}><ShieldCheck size={26} /></span>
          <h3>No open disputes</h3>
          <p>Capture an order (or Replay buyer claim) to receive a PayPal dispute email in this inbox.</p>
        </div>
      ) : (
        <ul className={s.draftList}>
          {items.map((item) => (
            <li key={item.disputeId} className={selected === item.disputeId ? s.paymentQueueSelected : undefined}>
              <div className={s.iconTile}><ShieldCheck size={19} /></div>
              <details className={s.draftDetail} open={selected === item.disputeId}>
                <summary>{item.disputeId} · {item.status}</summary>
                <p>
                  {item.reason}
                  {item.amount ? ` · $${item.amount}` : ""}
                  {item.orderId ? ` · order ${item.orderId}` : ""}
                </p>
                {item.agentDraft && <p><strong>Draft:</strong> {item.agentDraft}</p>}
                {item.acceptApprovedBy && <p>Accepted by {item.acceptApprovedBy}</p>}
                <div className={s.reviewActions}>
                  <button type="button" className={s.textButton} disabled={busy} onClick={() => void draft(item.disputeId)}>
                    Draft response <ArrowRight size={15} />
                  </button>
                  <button
                    type="button"
                    className={s.textButton}
                    disabled={busy || !isOwner || !item.agentDraft || Boolean(item.acceptApprovedBy)}
                    onClick={() => void accept(item.disputeId)}
                  >
                    {isOwner ? "Approve accept_dispute_claim" : "Supervisor login required"} <ArrowRight size={15} />
                  </button>
                </div>
              </details>
              <span className={s.draftBadge}>{item.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
