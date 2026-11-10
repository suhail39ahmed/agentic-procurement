"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Package, ShieldCheck, UserRound } from "lucide-react";
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
  const isBuyerSide = !isSeller;
  const [items, setItems] = useState<LocalDispute[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [inboundPhase, setInboundPhase] = useState<"idle" | "waiting" | "received" | "reading" | "done">("idle");
  const [caseText, setCaseText] = useState("");
  const [capturedClaim, setCapturedClaim] = useState<CapturedClaim | null>(null);
  const [buyerOpen, setBuyerOpen] = useState(true);
  const [sellerInboxOpen, setSellerInboxOpen] = useState(true);
  const [closedOpen, setClosedOpen] = useState(false);
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
  const awaitingSeller = useMemo(
    () => openItems.filter((item) => Boolean(item.agentDraft) && !item.acceptApprovedBy),
    [openItems],
  );
  const needsDraft = useMemo(
    () => openItems.filter((item) => !item.agentDraft),
    [openItems],
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

  async function openPaypalDispute(seed?: {
    orderId?: string;
    amount?: string;
    supplierId?: string;
    brief?: string;
    captureId?: string;
  }) {
    if (isSeller) return;
    const token = ++inboundTokenRef.current;
    setBusy(true);
    setBuyerOpen(true);
    setClosedOpen(false);
    setInboundPhase("waiting");
    setCaseText("");
    setCapturedClaim(null);
    setNotice("Buyer: opening PayPal dispute case (~4s)…");
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
        setNotice(payload.error ?? "PayPal dispute did not open.");
        return;
      }
      if (token !== inboundTokenRef.current) return;

      setCaseText(payload.emailText ?? "");
      setInboundPhase("received");
      setSelected(payload.disputeId ?? null);
      setNotice("PayPal case opened — AI reading case fields…");

      await new Promise((resolve) => setTimeout(resolve, 1400));
      if (token !== inboundTokenRef.current) return;
      setInboundPhase("reading");

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
      setNotice(`Buyer window: dispute ${claim.disputeId} open — draft your statement, then switch to Seller.`);
    } catch {
      if (token === inboundTokenRef.current) {
        setInboundPhase("idle");
        setNotice("Open dispute failed.");
      }
    } finally {
      if (token === inboundTokenRef.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (isSeller) return;
    if (!inboundSeed?.token || inboundSeed.token === lastSeedTokenRef.current) return;
    lastSeedTokenRef.current = inboundSeed.token;
    void openPaypalDispute({
      orderId: inboundSeed.orderId,
      amount: inboundSeed.amount,
      supplierId: inboundSeed.supplierId,
      brief: inboundSeed.brief,
      captureId: inboundSeed.captureId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboundSeed?.token, isSeller]);

  async function draft(id: string) {
    if (isSeller) return;
    setBusy(true);
    setSelected(id);
    try {
      const response = await fetch(`/api/disputes/${encodeURIComponent(id)}/draft`, {
        method: "POST",
        headers: { ...(demoRole ? { "x-demo-role": demoRole } : {}) },
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Draft failed.");
        return;
      }
      setNotice("Buyer statement ready. Switch sidebar to Seller to accept (refund).");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function accept(id: string) {
    if (!isSeller) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/disputes/${encodeURIComponent(id)}/accept`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(demoRole ? { "x-demo-role": demoRole } : {}),
        },
        body: JSON.stringify({ approved: true, note: "Seller accepted dispute — refund buyer" }),
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
        ?? "Seller accepted — buyer wins, refund path (PayPal accept_dispute_claim).",
      );
      if (payload.toolkitError) {
        setNotice(`Seller accepted in app. Toolkit: ${payload.toolkitError}`);
      }
      setClosedOpen(true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const caseVisible = inboundPhase === "received" || inboundPhase === "reading" || inboundPhase === "done" || Boolean(caseText);

  /* ─── SELLER WINDOW ─── */
  if (isSeller) {
    return (
      <div className={s.reviewPanel} style={{ marginTop: 18 }}>
        <div className={s.sectionHeader}>
          <div>
            <h3 className={s.disputeRoleTitle}>
              <Package size={18} aria-hidden /> Seller window · Incoming disputes
            </h3>
            <p className={s.description}>
              You only see buyer-opened PayPal cases. Review their statement, then <strong>Accept claim (refund buyer)</strong>.
              You cannot open or draft disputes.
            </p>
          </div>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void refresh()}>Refresh</button>
        </div>

        <div className={s.paymentNest} style={{ marginBottom: 12 }}>
          <button
            type="button"
            className={s.paymentNestToggle}
            aria-expanded={sellerInboxOpen}
            onClick={() => setSellerInboxOpen((v) => !v)}
          >
            {sellerInboxOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span>Needs your accept</span>
            <em>{awaitingSeller.length}</em>
          </button>
          {sellerInboxOpen && (
            <div className={s.paymentNestBody}>
              {awaitingSeller.length === 0 ? (
                <div className={s.empty}>
                  <span className={s.emptyIcon}><Package size={26} /></span>
                  <h3>No drafted claims waiting</h3>
                  <p>Ask the Buyer to open a PayPal dispute and draft a statement, then Refresh.</p>
                </div>
              ) : (
                <ul className={s.draftList}>
                  {awaitingSeller.map((item) => (
                    <li key={item.disputeId} className={s.paymentQueueSelected}>
                      <div className={s.iconTile}><Package size={19} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{item.disputeId}</strong>
                        <p>
                          {item.reason}
                          {item.amount ? ` · $${item.amount}` : ""}
                          {item.orderId ? ` · order ${item.orderId}` : ""}
                        </p>
                        <div className={s.agentCaptureCard}>
                          <p className={s.agentCaptureBanner}>Buyer’s dispute statement</p>
                          <p className={s.description} style={{ margin: 0 }}>{item.agentDraft}</p>
                        </div>
                        <div className={s.reviewActions} style={{ marginTop: 10 }}>
                          <button
                            type="button"
                            className={s.primary}
                            disabled={busy}
                            onClick={() => void accept(item.disputeId)}
                          >
                            Accept claim (refund buyer) <ArrowRight size={15} />
                          </button>
                        </div>
                        <p className={s.summaryNote}>Accept = buyer wins. Money goes back — not “pay extra.”</p>
                      </div>
                      <span className={s.draftBadge}>OPEN</span>
                    </li>
                  ))}
                </ul>
              )}
              {needsDraft.length > 0 && (
                <p className={s.tableNote}>
                  {needsDraft.length} case(s) still waiting for Buyer to draft a statement — they won’t appear here until drafted.
                </p>
              )}
            </div>
          )}
        </div>

        <ClosedNest
          open={closedOpen}
          setOpen={setClosedOpen}
          items={closedItems}
          emptyHint="Resolved after you accept — buyer refund path."
        />
      </div>
    );
  }

  /* ─── BUYER WINDOW ─── */
  return (
    <div className={s.reviewPanel} style={{ marginTop: 18 }}>
      <div className={s.sectionHeader}>
        <div>
          <h3 className={s.disputeRoleTitle}>
            <UserRound size={18} aria-hidden /> Buyer window · My PayPal disputes
          </h3>
          <p className={s.description}>
            You open the PayPal case and draft the statement. Then switch to <strong>Seller</strong> — they accept (refund).
            You cannot accept claims here.
          </p>
        </div>
        <div className={s.reviewActions}>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void refresh()}>Refresh</button>
          <button
            type="button"
            className={s.primary}
            disabled={busy}
            onClick={() => void openPaypalDispute({
              orderId: inboundSeed?.orderId,
              amount: inboundSeed?.amount,
              supplierId: inboundSeed?.supplierId,
              brief: inboundSeed?.brief,
              captureId: inboundSeed?.captureId,
            })}
          >
            {busy && inboundPhase === "waiting" ? "Opening…" : "Open PayPal dispute"}
          </button>
        </div>
      </div>

      <div className={s.paymentNest} style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={s.paymentNestToggle}
          aria-expanded={buyerOpen}
          onClick={() => setBuyerOpen((v) => !v)}
        >
          {buyerOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span>My open cases</span>
          <em>{openItems.length}</em>
        </button>
        {buyerOpen && (
          <div className={s.paymentNestBody}>
            <div className={s.disputeFlowWindow}>
              <div className={s.disputeStep}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>1</span>
                  <strong>Open PayPal case</strong>
                  <span className={s.pending}>
                    {inboundPhase === "waiting" && "Opening…"}
                    {(inboundPhase === "received" || inboundPhase === "reading") && "Case ready"}
                    {(inboundPhase === "done" || (inboundPhase === "idle" && caseText)) && "Opened"}
                    {inboundPhase === "idle" && !caseText && "—"}
                  </span>
                </div>
                {inboundPhase === "waiting" && (
                  <p className={s.description}>Filing with PayPal — goods not as negotiated (~4s)…</p>
                )}
                {caseVisible && caseText ? (
                  <pre className={s.shipInboxBody} aria-live="polite">{caseText}</pre>
                ) : inboundPhase !== "waiting" ? (
                  <p className={s.tableNote}>After capture, or click <strong>Open PayPal dispute</strong>.</p>
                ) : null}
              </div>

              <div className={`${s.disputeStep} ${capturedClaim ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>2</span>
                  <strong>AI reads case</strong>
                  <span className={s.pending}>
                    {inboundPhase === "reading" && "Reading…"}
                    {capturedClaim ? "Captured" : "—"}
                  </span>
                </div>
                {(inboundPhase === "received" || inboundPhase === "reading") && !capturedClaim && (
                  <p className={s.agentCaptureBanner} role="status">AI reading PayPal case fields…</p>
                )}
                {capturedClaim ? (
                  <div className={s.agentCaptureCard}>
                    <p className={s.agentCaptureBanner}>Case fields</p>
                    <dl className={s.summaryList}>
                      <div><dt>Dispute</dt><dd>{capturedClaim.disputeId}</dd></div>
                      <div><dt>Reason</dt><dd>{capturedClaim.reason}</dd></div>
                      {capturedClaim.supplierId && <div><dt>Against seller</dt><dd>{capturedClaim.supplierId}</dd></div>}
                      {capturedClaim.amount && <div><dt>Amount</dt><dd>${capturedClaim.amount}</dd></div>}
                      {capturedClaim.orderId && <div><dt>Order</dt><dd>{capturedClaim.orderId}</dd></div>}
                    </dl>
                  </div>
                ) : (
                  <p className={s.tableNote}>Fields appear after the case opens.</p>
                )}
              </div>

              <div className={`${s.disputeStep} ${activeOpen ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>3</span>
                  <strong>Draft statement (Buyer only)</strong>
                  <span className={s.pending}>
                    {activeOpen?.agentDraft ? "Sent to Seller inbox" : activeOpen ? "Needs draft" : "—"}
                  </span>
                </div>
                {activeOpen ? (
                  <>
                    <p className={s.description}>
                      {activeOpen.disputeId} · {activeOpen.status}
                      {activeOpen.amount ? ` · $${activeOpen.amount}` : ""}
                    </p>
                    {activeOpen.agentDraft ? (
                      <div className={s.agentCaptureCard}>
                        <p className={s.agentCaptureBanner}>Your dispute statement (Seller will review this)</p>
                        <p className={s.description} style={{ margin: 0 }}>{activeOpen.agentDraft}</p>
                      </div>
                    ) : (
                      <p className={s.tableNote}>AI writes the PayPal dispute statement — not an email to the seller.</p>
                    )}
                    <div className={s.reviewActions}>
                      <button
                        type="button"
                        className={s.primary}
                        disabled={busy || Boolean(activeOpen.agentDraft)}
                        onClick={() => void draft(activeOpen.disputeId)}
                      >
                        {activeOpen.agentDraft ? "Statement ready" : "Draft dispute statement"} <ArrowRight size={15} />
                      </button>
                    </div>
                    {activeOpen.agentDraft && (
                      <p className={s.summaryNote}>
                        Next: sidebar → <strong>Seller</strong> (`seller` / `seller`) → Accept claim (refund).
                      </p>
                    )}
                  </>
                ) : (
                  <p className={s.tableNote}>Open a case in step 1 first.</p>
                )}
              </div>
            </div>

            {openItems.length > 1 && (
              <div className={s.disputeOtherOpen}>
                <p className={s.description}>Your other open cases</p>
                <ul className={s.draftList}>
                  {openItems
                    .filter((item) => item.disputeId !== activeOpen?.disputeId)
                    .map((item) => (
                      <li key={item.disputeId}>
                        <div className={s.iconTile}><UserRound size={19} /></div>
                        <div>
                          <strong>{item.disputeId}</strong>
                          <p>{item.agentDraft ? "Waiting for Seller" : "Needs your draft"} · {item.reason}</p>
                          <button type="button" className={s.textButton} onClick={() => setSelected(item.disputeId)}>
                            Select <ArrowRight size={14} />
                          </button>
                        </div>
                        <span className={s.draftBadge}>{item.agentDraft ? "DRAFTED" : "OPEN"}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {openItems.length === 0 && inboundPhase === "idle" && !caseText && (
              <div className={s.empty}>
                <span className={s.emptyIcon}><UserRound size={26} /></span>
                <h3>No open disputes</h3>
                <p>Capture an order, or click Open PayPal dispute.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <ClosedNest
        open={closedOpen}
        setOpen={setClosedOpen}
        items={closedItems}
        emptyHint="Appear here after Seller accepts (refund)."
      />

      {isBuyerSide && (
        <p className={s.tableNote} style={{ marginTop: 10 }}>
          Supervisor role does not accept disputes — only Seller does.
        </p>
      )}
    </div>
  );
}

function ClosedNest({
  open,
  setOpen,
  items,
  emptyHint,
}: {
  open: boolean;
  setOpen: (fn: (v: boolean) => boolean) => void;
  items: LocalDispute[];
  emptyHint: string;
}) {
  return (
    <div className={s.paymentNest}>
      <button
        type="button"
        className={s.paymentNestToggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span>Closed</span>
        <em>{items.length}</em>
      </button>
      {open && (
        <div className={s.paymentNestBody}>
          {items.length === 0 ? (
            <p className={s.tableNote}>{emptyHint}</p>
          ) : (
            <ul className={s.draftList}>
              {items.map((item) => (
                <li key={item.disputeId}>
                  <div className={s.iconTile}><ShieldCheck size={19} /></div>
                  <details className={s.draftDetail}>
                    <summary>{item.disputeId} · {item.status}</summary>
                    <p>
                      {item.reason}
                      {item.amount ? ` · $${item.amount}` : ""}
                    </p>
                    {item.agentDraft && <p><strong>Statement:</strong> {item.agentDraft}</p>}
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
  );
}
