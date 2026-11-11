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

/** PayPal refund payment row shown after Seller accepts. */
export type PaypalRefundPayment = {
  disputeId: string;
  amount?: string;
  orderId?: string | null;
  status: string;
  acceptedBy?: string;
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
  return (
    value === "RESOLVED"
    || value === "CLOSED"
    || value === "ACCEPTED"
    || value === "FILED"
    || value === "REFUND_RECEIVED"
  );
}

function buyerStatusLabel(item: LocalDispute): string {
  const status = item.status.toUpperCase();
  if (status === "REFUND_RECEIVED" || status === "RESOLVED" || status === "ACCEPTED") {
    return "Refund received";
  }
  if (item.agentDraft || status === "RAISED_TO_PAYPAL") {
    return "Raised to PayPal · waiting on Seller";
  }
  return "Opened — raise to PayPal";
}

export function DisputePanel({
  setNotice,
  demoRole = null,
  inboundSeed = null,
  onRefundsChange,
}: {
  setNotice: (value: string) => void;
  demoRole?: DemoRole | null;
  inboundSeed?: DisputeInboundSeed | null;
  onRefundsChange?: (refunds: PaypalRefundPayment[]) => void;
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
  const paypalToSeller = useMemo(
    () => openItems.filter((item) => Boolean(item.agentDraft) && !item.acceptApprovedBy),
    [openItems],
  );
  const needsRaise = useMemo(
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

  /** Only the active case's refund — never an older closed dispute. */
  const activeCaseId = activeOpen?.disputeId ?? capturedClaim?.disputeId ?? selected;
  const activeRefund = useMemo(() => {
    if (!activeCaseId) return null;
    return closedItems.find((item) => {
      if (item.disputeId !== activeCaseId) return false;
      const status = item.status.toUpperCase();
      return (
        Boolean(item.acceptApprovedBy)
        || status === "REFUND_RECEIVED"
        || status === "RESOLVED"
        || status === "ACCEPTED"
      );
    }) ?? null;
  }, [closedItems, activeCaseId]);

  const waitingOnSeller = Boolean(activeOpen?.agentDraft) && !activeRefund;

  const refundPayments = useMemo(
    () => closedItems
      .filter((item) => {
        const status = item.status.toUpperCase();
        return (
          Boolean(item.acceptApprovedBy)
          || status === "REFUND_RECEIVED"
          || status === "RESOLVED"
          || status === "ACCEPTED"
        );
      })
      .map((item): PaypalRefundPayment => ({
        disputeId: item.disputeId,
        amount: item.amount,
        orderId: item.orderId,
        status: "REFUND · COMPLETED",
        acceptedBy: item.acceptApprovedBy,
      })),
    [closedItems],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onRefundsChange?.(refundPayments);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refundPayments, onRefundsChange]);

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

  // Buyer polls so Refund received appears after Seller accepts
  useEffect(() => {
    if (isSeller) return;
    const hasWaiting = openItems.some((item) => Boolean(item.agentDraft));
    if (!hasWaiting) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeller, openItems.length, paypalToSeller.length]);

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
    setNotice("Buyer: raising dispute to PayPal (~4s)…");
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
      setNotice("Raised to PayPal — AI reading case…");

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

      // From capture "Raise dispute": file with PayPal so it lands in Disputes + Seller inbox
      if (claim.disputeId && claim.disputeId !== "unknown") {
        setNotice(`Case ${claim.disputeId} under Disputes — filing with PayPal…`);
        const draftRes = await fetch(`/api/disputes/${encodeURIComponent(claim.disputeId)}/draft`, {
          method: "POST",
          headers: { ...(demoRole ? { "x-demo-role": demoRole } : {}) },
        });
        if (token !== inboundTokenRef.current) return;
        if (draftRes.ok) {
          await refresh();
          setNotice(`Raised to PayPal: ${claim.disputeId} is under Disputes. PayPal will notify the Seller.`);
        } else {
          setNotice(`Case ${claim.disputeId} is under Disputes — click Raise to PayPal to notify the Seller.`);
        }
      } else {
        setNotice("Dispute case opened under Disputes.");
      }
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

  async function raiseToPaypal(id: string) {
    if (isSeller) return;
    setBusy(true);
    setSelected(id);
    try {
      const response = await fetch(`/api/disputes/${encodeURIComponent(id)}/draft`, {
        method: "POST",
        headers: { ...(demoRole ? { "x-demo-role": demoRole } : {}) },
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; note?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Raise to PayPal failed.");
        return;
      }
      setNotice(payload.note ?? "Raised to PayPal — PayPal is sending this dispute to the Seller.");
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
        body: JSON.stringify({ approved: true, note: "Seller accepted PayPal dispute — refund buyer" }),
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
        ?? "Seller accepted. Buyer will see Refund received.",
      );
      if (payload.toolkitError) {
        setNotice(`Seller accepted. Toolkit: ${payload.toolkitError}`);
      }
      setClosedOpen(true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const caseVisible = inboundPhase === "received" || inboundPhase === "reading" || inboundPhase === "done" || Boolean(caseText);
  const raisedToPaypal = Boolean(activeOpen?.agentDraft);

  /* ─── SELLER WINDOW ─── */
  if (isSeller) {
    return (
      <div className={s.reviewPanel} style={{ marginTop: 18 }}>
        <div className={s.sectionHeader}>
          <div>
            <h3 className={s.disputeRoleTitle}>
              <Package size={18} aria-hidden /> Seller window · From PayPal
            </h3>
            <p className={s.description}>
              PayPal forwards buyer disputes here. <strong>Accept claim</strong> = refund the buyer (not an extra payment).
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
            <span>PayPal sent you</span>
            <em>{paypalToSeller.length}</em>
          </button>
          {sellerInboxOpen && (
            <div className={s.paymentNestBody}>
              {paypalToSeller.length === 0 ? (
                <div className={s.empty}>
                  <span className={s.emptyIcon}><Package size={26} /></span>
                  <h3>No disputes from PayPal yet</h3>
                  <p>Buyer must raise a claim to PayPal first. Then Refresh.</p>
                </div>
              ) : (
                <ul className={s.draftList}>
                  {paypalToSeller.map((item) => (
                    <li key={item.disputeId} className={s.paymentQueueSelected}>
                      <div className={s.iconTile}><Package size={19} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>{item.disputeId}</strong>
                        <p>
                          Via PayPal · {item.reason}
                          {item.amount ? ` · $${item.amount}` : ""}
                          {item.orderId ? ` · order ${item.orderId}` : ""}
                        </p>
                        <div className={s.agentCaptureCard}>
                          <p className={s.agentCaptureBanner}>Buyer claim (PayPal forwarded)</p>
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
                        <p className={s.summaryNote}>After you accept, Buyer screen shows Refund received.</p>
                      </div>
                      <span className={s.draftBadge}>FROM PAYPAL</span>
                    </li>
                  ))}
                </ul>
              )}
              {needsRaise.length > 0 && (
                <p className={s.tableNote}>
                  {needsRaise.length} case(s) opened by Buyer but not yet raised to PayPal — they appear here after raise.
                </p>
              )}
            </div>
          )}
        </div>

        <ClosedNest
          open={closedOpen}
          setOpen={setClosedOpen}
          items={closedItems}
          emptyHint="After you accept, cases land here — Buyer sees Refund received."
          buyerView={false}
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
            <UserRound size={18} aria-hidden />
            {demoRole === "owner" ? "Supervisor" : "Buyer"} · My disputes
          </h3>
          <p className={s.description}>
            Start from <strong>Recently captured → Raise dispute</strong> on any completed order.
            PayPal notifies the Seller desk. When they accept, you see <strong>Refund received</strong>.
          </p>
        </div>
        <div className={s.reviewActions}>
          <button type="button" className={s.secondary} disabled={busy} onClick={() => void refresh()}>Refresh</button>
        </div>
      </div>

      {activeRefund && (
        <div className={s.agentCaptureCard} style={{ marginBottom: 12 }} role="status">
          <p className={s.agentCaptureBanner}>PayPal refund payment</p>
          <dl className={s.summaryList}>
            <div><dt>Type</dt><dd>REFUND (back to buyer)</dd></div>
            <div><dt>Status</dt><dd>COMPLETED</dd></div>
            <div><dt>Dispute</dt><dd>{activeRefund.disputeId}</dd></div>
            {activeRefund.amount && <div><dt>Amount</dt><dd>${activeRefund.amount} USD</dd></div>}
            {activeRefund.orderId && <div><dt>Order</dt><dd>{activeRefund.orderId}</dd></div>}
            {activeRefund.acceptApprovedBy && <div><dt>Accepted by</dt><dd>{activeRefund.acceptApprovedBy}</dd></div>}
          </dl>
          <p className={s.description} style={{ margin: 0 }}>
            Seller accepted on the Seller desk — this is the PayPal refund for this case.
          </p>
        </div>
      )}

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
                  <strong>Raised to PayPal</strong>
                  <span className={s.pending}>
                    {inboundPhase === "waiting" && "Filing…"}
                    {(inboundPhase === "received" || inboundPhase === "reading") && "Case open"}
                    {(inboundPhase === "done" || raisedToPaypal || (inboundPhase === "idle" && caseText)) && "Raised"}
                    {inboundPhase === "idle" && !caseText && !raisedToPaypal && "—"}
                  </span>
                </div>
                {inboundPhase === "waiting" && (
                  <p className={s.description}>Filing claim with PayPal (~4s)…</p>
                )}
                {!caseVisible && inboundPhase !== "waiting" && (
                  <p className={s.tableNote}>Use <strong>Recently captured → Raise with PayPal</strong>.</p>
                )}
                {(capturedClaim || activeOpen) && (
                  <div className={s.agentCaptureCard} style={{ marginTop: 10 }}>
                    <p className={s.agentCaptureBanner}>Your case</p>
                    <dl className={s.summaryList}>
                      <div><dt>Dispute</dt><dd>{capturedClaim?.disputeId ?? activeOpen?.disputeId}</dd></div>
                      <div><dt>Reason</dt><dd>{capturedClaim?.reason ?? activeOpen?.reason}</dd></div>
                      {capturedClaim?.supplierId && <div><dt>Seller</dt><dd>{capturedClaim.supplierId}</dd></div>}
                      {(capturedClaim?.amount ?? activeOpen?.amount) && (
                        <div><dt>Amount</dt><dd>${capturedClaim?.amount ?? activeOpen?.amount}</dd></div>
                      )}
                    </dl>
                  </div>
                )}
              </div>

              <div className={`${s.disputeStep} ${waitingOnSeller ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>2</span>
                  <strong>Waiting on Seller</strong>
                  <span className={s.pending}>
                    {waitingOnSeller ? "Pending Seller accept" : raisedToPaypal ? "Sent" : activeOpen ? "Needs raise" : "—"}
                  </span>
                </div>
                {activeOpen ? (
                  <>
                    {activeOpen.agentDraft ? (
                      <p className={s.description} style={{ margin: 0 }}>
                        PayPal notified the Seller desk. Claim details stay on the <strong>Seller</strong> page — not here.
                        Switch to Seller desk to Accept.
                      </p>
                    ) : (
                      <>
                        <p className={s.tableNote}>Confirm raise so PayPal notifies the Seller.</p>
                        <div className={s.reviewActions}>
                          <button
                            type="button"
                            className={s.primary}
                            disabled={busy}
                            onClick={() => void raiseToPaypal(activeOpen.disputeId)}
                          >
                            Raise with PayPal <ArrowRight size={15} />
                          </button>
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <p className={s.tableNote}>Raise a case from Recently captured first.</p>
                )}
              </div>

              <div className={`${s.disputeStep} ${activeRefund ? s.disputeStepActive : ""}`}>
                <div className={s.disputeStepHead}>
                  <span className={s.stepNumber}>3</span>
                  <strong>Refund received</strong>
                  <span className={s.pending}>{activeRefund ? "Yes" : "Pending"}</span>
                </div>
                {activeRefund ? (
                  <div className={s.agentCaptureCard}>
                    <p className={s.agentCaptureBanner}>PayPal refund payment · COMPLETED</p>
                    <p className={s.description} style={{ margin: 0 }}>
                      {activeRefund.disputeId}
                      {activeRefund.amount ? ` · $${activeRefund.amount}` : ""}
                      {activeRefund.acceptApprovedBy ? ` · ${activeRefund.acceptApprovedBy}` : ""}
                    </p>
                  </div>
                ) : (
                  <p className={s.tableNote}>
                    Stays <strong>Pending</strong> until the Seller accepts this claim on the Seller desk.
                  </p>
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
                          <p>{buyerStatusLabel(item)}</p>
                          <button type="button" className={s.textButton} onClick={() => setSelected(item.disputeId)}>
                            Select <ArrowRight size={14} />
                          </button>
                        </div>
                        <span className={s.draftBadge}>{item.agentDraft ? "RAISED" : "OPEN"}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {openItems.length === 0 && inboundPhase === "idle" && !caseText && !activeRefund && (
              <div className={s.empty}>
                <span className={s.emptyIcon}><UserRound size={26} /></span>
                <h3>No open disputes</h3>
                <p>After capture: Satisfied / Leave open / Raise with PayPal.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <ClosedNest
        open={closedOpen}
        setOpen={setClosedOpen}
        items={closedItems}
        emptyHint="Past PayPal refunds appear here after Seller accepts."
        buyerView
      />

      {isBuyerSide && (
        <p className={s.tableNote} style={{ marginTop: 10 }}>
          Supervisor does not accept disputes — only Seller does, after PayPal sends the claim.
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
  buyerView,
}: {
  open: boolean;
  setOpen: (fn: (v: boolean) => boolean) => void;
  items: LocalDispute[];
  emptyHint: string;
  buyerView: boolean;
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
        <span>{buyerView ? "Refund received" : "Closed"}</span>
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
                    <summary>
                      {item.disputeId} · {buyerView ? "Refund received" : item.status}
                    </summary>
                    <p>
                      {item.reason}
                      {item.amount ? ` · $${item.amount}` : ""}
                    </p>
                    {item.agentDraft && <p><strong>Claim:</strong> {item.agentDraft}</p>}
                    {item.acceptApprovedBy && <p>Accepted by {item.acceptApprovedBy}</p>}
                  </details>
                  <span className={s.draftBadge}>
                    {buyerView ? "REFUND RECEIVED" : item.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
