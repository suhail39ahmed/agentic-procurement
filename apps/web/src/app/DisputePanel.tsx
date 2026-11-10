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
      setNotice("Seller does not open claims — switch to Buyer to raise a dispute, then come back as Seller to accept.");
      return;
    }
    const token = ++inboundTokenRef.current;
    setBusy(true);
    setOpenSectionOpen(true);
    setClosedSectionOpen(false);
    setInboundPhase("waiting");
    setInboundEmail("");
    setCapturedClaim(null);
    setNotice("Buyer opening claim against supplier (~4s)…");
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
        setNotice(payload.error ?? "Buyer claim did not open.");
        return;
      }
      if (token !== inboundTokenRef.current) return;

      setInboundEmail(payload.emailText ?? "");
      setInboundPhase("received");
      setSelected(payload.disputeId ?? null);
      setNotice("Claim notice ready — AI agent is reading your buyer claim…");

      await new Promise((resolve) => setTimeout(resolve, 1400));
      if (token !== inboundTokenRef.current) return;

      setInboundPhase("reading");
      setNotice("AI agent capturing claim id, reason, amount, and supplier…");

      const claim: CapturedClaim = {
        disputeId: payload.disputeId ?? "unknown",
        reason: payload.reason ?? "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED",
        amount: payload.amount,
        orderId: payload.orderId,
        eventType: payload.eventType ?? "BUYER_CLAIM_OPENED",
        supplierId: payload.supplierId,
      };
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (token !== inboundTokenRef.current) return;

      setCapturedClaim(claim);
      await refresh();
      setInboundPhase("done");
      setNotice(
        `Buyer claim opened ✓ · ${claim.disputeId}. Draft as Buyer, then switch to Seller (seller / seller) to accept.`,
      );
    } catch {
      if (token === inboundTokenRef.current) {
        setInboundPhase("idle");
        setNotice("Buyer claim failed — try Replay buyer claim.");
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
      setNotice("Switch to Buyer to draft the claim. Seller only accepts.");
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
      setNotice("Buyer claim draft ready. Switch to Seller (seller / seller) → Approve accept_dispute_claim.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: string) {
    if (!isSeller) {
      setNotice("Only Seller can accept. Sign in as seller / seller, then Approve accept_dispute_claim.");
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
        ?? "Seller accepted the buyer claim via PayPal Toolkit accept_dispute_claim.",
      );
      if (payload.toolkitError) {
        setNotice(`Seller accepted in app. Toolkit note: ${payload.toolkitError}`);
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
          <h3>Disputes · Buyer claim ↔ Seller accept</h3>
          <p className={s.description}>
            <strong>Buyer</strong> opens claim + drafts · <strong>Seller</strong> accepts via PayPal Toolkit · Supervisor is only for over-$20 spend.
            {isSeller ? " You are Seller — accept drafted claims below." : " You are on the buyer side — open/draft, then switch to Seller."}
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
              {busy && inboundPhase === "waiting" ? "Opening…" : "Replay buyer claim"}
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
              How to run: 1) As Buyer after capture (or Replay) → claim notice → 2) AI extracts → 3) Draft as Buyer → 4) Switch to Seller → Accept.
            </p>

            <div className={s.disputeFlowWindow}>
              <div className={s.disputeStep}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>1</span>
                  <strong>Buyer raises claim</strong>
                  <span className={s.pending}>
                    {inboundPhase === "waiting" && "Opening…"}
                    {(inboundPhase === "received" || inboundPhase === "reading") && "Notice ready"}
                    {(inboundPhase === "done" || (inboundPhase === "idle" && inboundEmail)) && "Opened"}
                    {inboundPhase === "idle" && !inboundEmail && "—"}
                  </span>
                </div>
                {inboundPhase === "waiting" && (
                  <p className={s.description}>Buyer claiming goods from supplier are not as negotiated (~4s)…</p>
                )}
                {stepEmailDone && inboundEmail ? (
                  <pre className={s.shipInboxBody} aria-live="polite">{inboundEmail}</pre>
                ) : inboundPhase !== "waiting" ? (
                  <p className={s.tableNote}>
                    Capture an order as Buyer, or click <strong>Replay buyer claim</strong>.
                  </p>
                ) : null}
              </div>

              <div className={`${s.disputeStep} ${stepExtractDone ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>2</span>
                  <strong>AI extracted (buyer tools)</strong>
                  <span className={s.pending}>
                    {inboundPhase === "reading" && "Reading…"}
                    {stepExtractDone && "Captured"}
                    {!stepExtractDone && inboundPhase !== "reading" && "—"}
                  </span>
                </div>
                {(inboundPhase === "received" || inboundPhase === "reading") && !capturedClaim && (
                  <p className={s.agentCaptureBanner} role="status">
                    AI agent reading the buyer claim notice…
                  </p>
                )}
                {capturedClaim ? (
                  <div className={s.agentCaptureCard}>
                    <p className={s.agentCaptureBanner} role="status">Details captured from claim</p>
                    <dl className={s.summaryList}>
                      <div><dt>Event</dt><dd>{capturedClaim.eventType}</dd></div>
                      <div><dt>Claim</dt><dd>{capturedClaim.disputeId}</dd></div>
                      <div><dt>Reason</dt><dd>{capturedClaim.reason}</dd></div>
                      {capturedClaim.supplierId && <div><dt>Seller</dt><dd>{capturedClaim.supplierId}</dd></div>}
                      {capturedClaim.amount && <div><dt>Amount</dt><dd>${capturedClaim.amount}</dd></div>}
                      {capturedClaim.orderId && <div><dt>Order</dt><dd>{capturedClaim.orderId}</dd></div>}
                    </dl>
                  </div>
                ) : (
                  <p className={s.tableNote}>Fields appear after the agent reads the claim.</p>
                )}
              </div>

              <div className={`${s.disputeStep} ${stepRespondActive ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>3</span>
                  <strong>Draft (Buyer) → Accept (Seller)</strong>
                  <span className={s.pending}>
                    {activeOpen?.acceptApprovedBy
                      ? "Accepted"
                      : activeOpen?.agentDraft
                        ? (isSeller ? "Ready for Seller" : "Draft ready")
                        : stepRespondActive ? "Needs draft" : "—"}
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
                        <p className={s.agentCaptureBanner}>Buyer claim draft</p>
                        <p className={s.description} style={{ margin: 0 }}>{activeOpen.agentDraft}</p>
                      </div>
                    ) : (
                      <p className={s.tableNote}>Buyer: click Draft claim. Seller waits until a draft exists.</p>
                    )}
                    <div className={s.reviewActions}>
                      <button
                        type="button"
                        className={s.secondary}
                        disabled={busy || isSeller}
                        onClick={() => void draft(activeOpen.disputeId)}
                      >
                        Draft claim (Buyer) <ArrowRight size={15} />
                      </button>
                      <button
                        type="button"
                        className={s.primary}
                        disabled={busy || !isSeller || !activeOpen.agentDraft || Boolean(activeOpen.acceptApprovedBy)}
                        onClick={() => void accept(activeOpen.disputeId)}
                      >
                        {isSeller ? "Approve accept_dispute_claim" : "Seller login required"}
                      </button>
                    </div>
                    {!isSeller && activeOpen.agentDraft && (
                      <p className={s.summaryNote}>Switch sidebar to <strong>Seller</strong> (seller / seller) to accept.</p>
                    )}
                  </>
                ) : (
                  <p className={s.tableNote}>No open claim yet — finish steps 1–2 as Buyer first.</p>
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
                <p>As Buyer: capture an order or Replay buyer claim. As Seller: wait for a drafted claim, then Accept.</p>
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
