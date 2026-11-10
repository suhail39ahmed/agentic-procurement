"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
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

function isClosedStatus(status: string): boolean {
  const value = status.toUpperCase();
  return value === "RESOLVED" || value === "CLOSED" || value === "ACCEPTED";
}

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

  async function receiveBuyerDispute(seed?: {
    orderId?: string;
    amount?: string;
    supplierId?: string;
    brief?: string;
  }) {
    const token = ++inboundTokenRef.current;
    setBusy(true);
    setOpenSectionOpen(true);
    setClosedSectionOpen(false);
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
      setNotice("Email received — PayPal dispute webhook. AI agent is reading the claim…");

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
        `Email received ✓ · Agent captured ${claim.disputeId}. Draft a response in Open → step 3.`,
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
    setOpenSectionOpen(true);
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
          <h3>Disputes</h3>
          <p className={s.description}>
            Open = email → AI extract → draft/accept in one window. Closed = resolved claims (collapsed).
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
              One live window: 1) Email received → 2) AI extracted → 3) Agent helps respond.
            </p>

            <div className={s.disputeFlowWindow}>
              <div className={s.disputeStep}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>1</span>
                  <strong>Email received</strong>
                  <span className={s.pending}>
                    {inboundPhase === "waiting" && "Waiting…"}
                    {inboundPhase === "received" && "Just arrived"}
                    {inboundPhase === "reading" && "Opening…"}
                    {(inboundPhase === "done" || (inboundPhase === "idle" && inboundEmail)) && "Received"}
                    {inboundPhase === "idle" && !inboundEmail && "—"}
                  </span>
                </div>
                {inboundPhase === "waiting" && (
                  <p className={s.description}>Listening for PayPal CUSTOMER.DISPUTE.CREATED (~4s)…</p>
                )}
                {stepEmailDone && inboundEmail ? (
                  <pre className={s.shipInboxBody} aria-live="polite">{inboundEmail}</pre>
                ) : inboundPhase !== "waiting" ? (
                  <p className={s.tableNote}>Capture an order or click <strong>Replay buyer claim</strong>.</p>
                ) : null}
              </div>

              <div className={`${s.disputeStep} ${stepExtractDone ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>2</span>
                  <strong>AI agent extracted</strong>
                  <span className={s.pending}>
                    {inboundPhase === "reading" && "Reading…"}
                    {stepExtractDone && "Captured"}
                    {!stepExtractDone && inboundPhase !== "reading" && "—"}
                  </span>
                </div>
                {(inboundPhase === "received" || inboundPhase === "reading") && !capturedClaim && (
                  <p className={s.agentCaptureBanner} role="status">
                    {inboundPhase === "received"
                      ? "Email received — AI agent opening the message…"
                      : "AI agent extracting dispute id, reason, amount, and order…"}
                  </p>
                )}
                {capturedClaim ? (
                  <div className={s.agentCaptureCard}>
                    <p className={s.agentCaptureBanner} role="status">Details captured from email</p>
                    <dl className={s.summaryList}>
                      <div><dt>Event</dt><dd>{capturedClaim.eventType}</dd></div>
                      <div><dt>Dispute</dt><dd>{capturedClaim.disputeId}</dd></div>
                      <div><dt>Reason</dt><dd>{capturedClaim.reason}</dd></div>
                      {capturedClaim.amount && <div><dt>Amount</dt><dd>${capturedClaim.amount}</dd></div>}
                      {capturedClaim.orderId && <div><dt>Order</dt><dd>{capturedClaim.orderId}</dd></div>}
                    </dl>
                  </div>
                ) : (
                  <p className={s.tableNote}>Fields appear here after the agent reads the email.</p>
                )}
              </div>

              <div className={`${s.disputeStep} ${stepRespondActive ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>3</span>
                  <strong>AI helps respond</strong>
                  <span className={s.pending}>
                    {activeOpen?.agentDraft ? "Draft ready" : stepRespondActive ? "Needs draft" : "—"}
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
                        <p className={s.agentCaptureBanner}>Agent draft</p>
                        <p className={s.description} style={{ margin: 0 }}>{activeOpen.agentDraft}</p>
                      </div>
                    ) : (
                      <p className={s.tableNote}>Ask the agent to draft a seller response, then Supervisor accepts.</p>
                    )}
                    <div className={s.reviewActions}>
                      <button type="button" className={s.secondary} disabled={busy} onClick={() => void draft(activeOpen.disputeId)}>
                        Draft response <ArrowRight size={15} />
                      </button>
                      <button
                        type="button"
                        className={s.primary}
                        disabled={busy || !isOwner || !activeOpen.agentDraft || Boolean(activeOpen.acceptApprovedBy)}
                        onClick={() => void accept(activeOpen.disputeId)}
                      >
                        {isOwner ? "Approve accept_dispute_claim" : "Supervisor login required"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className={s.tableNote}>No open claim yet — finish steps 1–2 first.</p>
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
                <h3>No open disputes</h3>
                <p>Capture an order or Replay buyer claim to start the Open flow.</p>
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
              <p className={s.tableNote}>No resolved disputes yet — they land here after Supervisor accept.</p>
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
