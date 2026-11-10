"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import s from "./dashboard.module.css";
import type { DemoRole } from "@/lib/demo-auth";

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
  captureId?: string;
  /** Bump to re-trigger auto inbound after capture. */
  token: number;
};

type CapturedClaim = {
  disputeId: string;
  reason: string;
  amount?: string;
  orderId?: string | null;
  eventType: string;
  supplierId?: string;
};

function isClosedStatus(status: string): boolean {
  const value = status.toUpperCase();
  return value === "RESOLVED" || value === "CLOSED" || value === "ACCEPTED" || value === "FILED";
}

export function DisputePanel({
  setNotice,
  demoRole = null,
  inboundSeed = null,
}: {
  setNotice: (value: string) => void;
  demoRole?: DemoRole | null;
  inboundSeed?: DisputeInboundSeed | null;
}) {
  const isSeller = demoRole === "seller";
  const isBuyerSide = demoRole === "buyer" || demoRole === "owner" || demoRole === null;
  const [items, setItems] = useState<LocalDispute[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [inboundPhase, setInboundPhase] = useState<"idle" | "waiting" | "received" | "reading" | "done">("idle");
  const [inboundEmail, setInboundEmail] = useState("");
  const [capturedClaim, setCapturedClaim] = useState<CapturedClaim | null>(null);
  const [openSectionOpen, setOpenSectionOpen] = useState(true);
  const [closedSectionOpen, setClosedSectionOpen] = useState(false);
  const inboundTokenRef = useRef(0);
  const lastSeedTokenRef = useRef(0);

  const openItems = useMemo(
    () => items.filter((item) => !isClosedStatus(item.status)),
    [items],
  );
  const closedItems = useMemo(
    () => items.filter((item) => isClosedStatus(item.status)),
    [items],
  );

  const activeOpen = useMemo(() => {
    if (selected) {
      const match = openItems.find((item) => item.disputeId === selected);
      if (match) return match;
    }
    if (capturedClaim) {
      const match = openItems.find((item) => item.disputeId === capturedClaim.disputeId);
      if (match) return match;
    }
    return openItems[openItems.length - 1] ?? null;
  }, [openItems, selected, capturedClaim]);

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

  async function openBuyerClaim(seed?: {
    orderId?: string;
    amount?: string;
    supplierId?: string;
    brief?: string;
    captureId?: string;
  }) {
    if (isSeller) {
      setNotice("Seller does not open disputes — switch to Buyer to open a PayPal case, then return as Seller to accept.");
      return;
    }
    const token = ++inboundTokenRef.current;
    setBusy(true);
    setOpenSectionOpen(true);
    setClosedSectionOpen(false);
    setInboundPhase("waiting");
    setInboundEmail("");
    setCapturedClaim(null);
    setNotice("Opening PayPal dispute case as Buyer (~4s)…");
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
          captureId: seed?.captureId,
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
        supplierId?: string;
      };
      if (!response.ok) {
        setInboundPhase("idle");
        setNotice(payload.error ?? "PayPal dispute case did not open.");
        return;
      }
      if (token !== inboundTokenRef.current) return;

      setInboundEmail(payload.emailText ?? "");
      setInboundPhase("received");
      setSelected(payload.disputeId ?? null);
      setNotice("PayPal dispute case opened — AI agent is reading case details…");

      await new Promise((resolve) => setTimeout(resolve, 1400));
      if (token !== inboundTokenRef.current) return;

      setInboundPhase("reading");
      setNotice("AI agent capturing dispute id, reason, amount, and seller…");

      const claim: CapturedClaim = {
        disputeId: payload.disputeId ?? "unknown",
        reason: payload.reason ?? "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
        amount: payload.amount,
        orderId: payload.orderId,
        eventType: payload.eventType ?? "BUYER_DISPUTE_OPENED",
        supplierId: payload.supplierId,
      };
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (token !== inboundTokenRef.current) return;

      setCapturedClaim(claim);
      await refresh();
      setInboundPhase("done");
      setNotice(
        `PayPal dispute ${claim.disputeId} open. Draft the dispute statement as Buyer, then Seller accepts (refund).`,
      );
    } catch {
      if (token === inboundTokenRef.current) {
        setInboundPhase("idle");
        setNotice("Open dispute failed — try Open PayPal dispute again.");
      }
    } finally {
      if (token === inboundTokenRef.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!inboundSeed?.token || inboundSeed.token === lastSeedTokenRef.current) return;
    lastSeedTokenRef.current = inboundSeed.token;
    void openBuyerClaim({
      orderId: inboundSeed.orderId,
      amount: inboundSeed.amount,
      supplierId: inboundSeed.supplierId,
      brief: inboundSeed.brief,
      captureId: inboundSeed.captureId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboundSeed?.token]);

  async function draft(id: string) {
    if (isSeller) {
      setNotice("Switch to Buyer to draft the dispute statement. Seller only accepts (refund).");
      return;
    }
    setBusy(true);
    setSelected(id);
    setOpenSectionOpen(true);
    try {
      const response = await fetch(`/api/disputes/${encodeURIComponent(id)}/draft`, {
        method: "POST",
        headers: {
          ...(demoRole ? { "x-demo-role": demoRole } : {}),
        },
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Draft failed.");
        return;
      }
      setNotice("Dispute statement drafted for PayPal. Switch to Seller → Accept claim (refund buyer).");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: string) {
    if (!isSeller) {
      setNotice("Only Seller can accept. Sign in as seller / seller → Accept claim (closes in buyer's favor / refund).");
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
        body: JSON.stringify({ approved: true, note: "Seller approved accept_dispute_claim from dashboard" }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        toolkitError?: string;
        toolkitNote?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Accept failed.");
        return;
      }
      setNotice(
        payload.toolkitNote
        ?? "Seller accepted — dispute closes in buyer's favor (refund path) via accept_dispute_claim.",
      );
      if (payload.toolkitError) {
        setNotice(`Seller accepted in app (refund path). Toolkit note: ${payload.toolkitError}`);
      }
      setClosedSectionOpen(true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const stepEmailDone = inboundPhase === "received" || inboundPhase === "reading" || inboundPhase === "done" || Boolean(inboundEmail);
  const stepExtractDone = inboundPhase === "done" || Boolean(capturedClaim);
  const stepRespondActive = stepExtractDone || Boolean(activeOpen);

  return (
    <div className={s.reviewPanel} style={{ marginTop: 18 }}>
      <div className={s.sectionHeader}>
        <div>
          <h3>Disputes · PayPal case</h3>
          <p className={s.description}>
            Not an email to the seller. <strong>Buyer</strong> opens a PayPal dispute → AI drafts the statement →
            <strong> Seller</strong> accepts (buyer wins / refund). Supervisor is only for over-$20 spend.
            {isSeller ? " You are Seller — accept below to refund." : " You are Buyer — open + draft, then switch to Seller."}
          </p>
        </div>
        <div className={s.reviewActions}>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void refresh()}>Refresh</button>
          {isBuyerSide && (
            <button
              type="button"
              className={s.secondary}
              disabled={busy}
              onClick={() => void openBuyerClaim({
                orderId: inboundSeed?.orderId,
                amount: inboundSeed?.amount,
                supplierId: inboundSeed?.supplierId,
                brief: inboundSeed?.brief,
                captureId: inboundSeed?.captureId,
              })}
            >
              {busy && inboundPhase === "waiting" ? "Opening…" : "Open PayPal dispute"}
            </button>
          )}
        </div>
      </div>

      <div className={s.paymentNest} style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={s.paymentNestToggle}
          aria-expanded={openSectionOpen}
          onClick={() => setOpenSectionOpen((open) => !open)}
        >
          {openSectionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>Open</span>
          <em>{openItems.length}</em>
        </button>
        {openSectionOpen && (
          <div className={s.paymentNestBody}>
            <p className={s.description}>
              1) Buyer opens PayPal dispute case → 2) AI reads case fields → 3) Buyer drafts statement → 4) Seller accepts = refund.
            </p>

            <div className={s.disputeFlowWindow}>
              <div className={s.disputeStep}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>1</span>
                  <strong>PayPal dispute case (Buyer)</strong>
                  <span className={s.pending}>
                    {inboundPhase === "waiting" && "Opening…"}
                    {(inboundPhase === "received" || inboundPhase === "reading") && "Case ready"}
                    {(inboundPhase === "done" || (inboundPhase === "idle" && inboundEmail)) && "Opened"}
                    {inboundPhase === "idle" && !inboundEmail && "—"}
                  </span>
                </div>
                {inboundPhase === "waiting" && (
                  <p className={s.description}>Filing dispute with PayPal — goods not as negotiated (~4s)…</p>
                )}
                {stepEmailDone && inboundEmail ? (
                  <pre className={s.shipInboxBody} aria-live="polite">{inboundEmail}</pre>
                ) : inboundPhase !== "waiting" ? (
                  <p className={s.tableNote}>
                    Capture as Buyer, or click <strong>Open PayPal dispute</strong>. This is a dispute case — not a seller email.
                  </p>
                ) : null}
              </div>

              <div className={`${s.disputeStep} ${stepExtractDone ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>2</span>
                  <strong>AI reads case fields</strong>
                  <span className={s.pending}>
                    {inboundPhase === "reading" && "Reading…"}
                    {stepExtractDone && "Captured"}
                    {!stepExtractDone && inboundPhase !== "reading" && "—"}
                  </span>
                </div>
                {(inboundPhase === "received" || inboundPhase === "reading") && !capturedClaim && (
                  <p className={s.agentCaptureBanner} role="status">
                    AI agent reading the PayPal dispute case…
                  </p>
                )}
                {capturedClaim ? (
                  <div className={s.agentCaptureCard}>
                    <p className={s.agentCaptureBanner} role="status">Case fields captured</p>
                    <dl className={s.summaryList}>
                      <div><dt>Event</dt><dd>{capturedClaim.eventType}</dd></div>
                      <div><dt>Dispute</dt><dd>{capturedClaim.disputeId}</dd></div>
                      <div><dt>Reason</dt><dd>{capturedClaim.reason}</dd></div>
                      {capturedClaim.supplierId && <div><dt>Seller</dt><dd>{capturedClaim.supplierId}</dd></div>}
                      {capturedClaim.amount && <div><dt>Amount</dt><dd>${capturedClaim.amount}</dd></div>}
                      {capturedClaim.orderId && <div><dt>Order</dt><dd>{capturedClaim.orderId}</dd></div>}
                    </dl>
                  </div>
                ) : (
                  <p className={s.tableNote}>Fields appear after the agent reads the case.</p>
                )}
              </div>

              <div className={`${s.disputeStep} ${stepRespondActive ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>3</span>
                  <strong>Statement (Buyer) → Accept = refund (Seller)</strong>
                  <span className={s.pending}>
                    {activeOpen?.acceptApprovedBy
                      ? "Refund path"
                      : activeOpen?.agentDraft
                        ? (isSeller ? "Ready for Seller" : "Statement ready")
                        : stepRespondActive ? "Needs statement" : "—"}
                  </span>
                </div>
                {activeOpen ? (
                  <>
                    <p className={s.description}>
                      {activeOpen.disputeId} · {activeOpen.status}
                      {activeOpen.amount ? ` · $${activeOpen.amount}` : ""}
                      {activeOpen.orderId ? ` · order ${activeOpen.orderId}` : ""}
                    </p>
                    {activeOpen.agentDraft ? (
                      <div className={s.agentCaptureCard}>
                        <p className={s.agentCaptureBanner}>Dispute statement for PayPal (not an email)</p>
                        <p className={s.description} style={{ margin: 0 }}>{activeOpen.agentDraft}</p>
                      </div>
                    ) : (
                      <p className={s.tableNote}>Buyer: draft the statement attached to this PayPal case. Seller waits.</p>
                    )}
                    <div className={s.reviewActions}>
                      <button
                        type="button"
                        className={s.secondary}
                        disabled={busy || isSeller}
                        onClick={() => void draft(activeOpen.disputeId)}
                      >
                        Draft dispute statement <ArrowRight size={15} />
                      </button>
                      <button
                        type="button"
                        className={s.primary}
                        disabled={busy || !isSeller || !activeOpen.agentDraft || Boolean(activeOpen.acceptApprovedBy)}
                        onClick={() => void accept(activeOpen.disputeId)}
                      >
                        {isSeller ? "Accept claim (refund buyer)" : "Seller login required"}
                      </button>
                    </div>
                    {!isSeller && activeOpen.agentDraft && (
                      <p className={s.summaryNote}>
                        Switch to <strong>Seller</strong> (seller / seller). Accept = buyer wins, refund — not “pay extra.”
                      </p>
                    )}
                  </>
                ) : (
                  <p className={s.tableNote}>No open PayPal dispute yet — finish steps 1–2 as Buyer first.</p>
                )}
              </div>
            </div>

            {openItems.length > 1 && (
              <div className={s.disputeOtherOpen}>
                <p className={s.description}>Other open claims</p>
                <ul className={s.draftList}>
                  {openItems
                    .filter((item) => item.disputeId !== activeOpen?.disputeId)
                    .map((item) => (
                      <li key={item.disputeId}>
                        <div className={s.iconTile}><ShieldCheck size={19} /></div>
                        <div>
                          <strong>{item.disputeId}</strong>
                          <p>{item.reason}{item.amount ? ` · $${item.amount}` : ""}</p>
                          <button type="button" className={s.textButton} onClick={() => { setSelected(item.disputeId); setOpenSectionOpen(true); }}>
                            Work this claim <ArrowRight size={14} />
                          </button>
                        </div>
                        <span className={s.draftBadge}>{item.status}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {openItems.length === 0 && inboundPhase === "idle" && !inboundEmail && (
              <div className={s.empty}>
                <span className={s.emptyIcon}><ShieldCheck size={26} /></span>
                <h3>No open claims</h3>
                <p>As Buyer: capture or Open PayPal dispute. As Seller: wait for a drafted statement, then Accept (refund).</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={s.paymentNest}>
        <button
          type="button"
          className={s.paymentNestToggle}
          aria-expanded={closedSectionOpen}
          onClick={() => setClosedSectionOpen((open) => !open)}
        >
          {closedSectionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>Closed</span>
          <em>{closedItems.length}</em>
        </button>
        {closedSectionOpen && (
          <div className={s.paymentNestBody}>
            {closedItems.length === 0 ? (
              <p className={s.tableNote}>No resolved claims yet — they land here after Seller accept.</p>
            ) : (
              <ul className={s.draftList}>
                {closedItems.map((item) => (
                  <li key={item.disputeId}>
                    <div className={s.iconTile}><ShieldCheck size={19} /></div>
                    <details className={s.draftDetail}>
                      <summary>{item.disputeId} · {item.status}</summary>
                      <p>
                        {item.reason}
                        {item.amount ? ` · $${item.amount}` : ""}
                        {item.orderId ? ` · order ${item.orderId}` : ""}
                      </p>
                      {item.agentDraft && <p><strong>Draft:</strong> {item.agentDraft}</p>}
                      {item.acceptApprovedBy && <p>Accepted by {item.acceptApprovedBy}</p>}
                    </details>
                    <span className={s.draftBadge}>{item.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
