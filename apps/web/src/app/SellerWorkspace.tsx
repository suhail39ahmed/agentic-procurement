"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, LogOut, Package, ShieldCheck, Layers3 } from "lucide-react";
import Link from "next/link";
import s from "./dashboard.module.css";
import type { DemoSession } from "@/lib/demo-auth";

type LocalDispute = {
  disputeId: string;
  status: string;
  reason: string;
  amount?: string;
  orderId?: string | null;
  agentDraft?: string;
  acceptApprovedBy?: string;
};

function isClosed(status: string): boolean {
  const value = status.toUpperCase();
  return (
    value === "RESOLVED"
    || value === "CLOSED"
    || value === "ACCEPTED"
    || value === "REFUND_RECEIVED"
  );
}

/**
 * Seller product surface — not the Buyer/Supervisor marketplace.
 * Static: PayPal-forwarded claims only. Accept = refund buyer.
 */
export function SellerWorkspace({
  session,
  notice,
  setNotice,
  onSwitchToBuyer,
  onSwitchToSupervisor,
  onSignOut,
}: {
  session: DemoSession;
  notice: string;
  setNotice: (value: string) => void;
  onSwitchToBuyer: () => void;
  onSwitchToSupervisor: () => void;
  onSignOut: () => void;
}) {
  const [items, setItems] = useState<LocalDispute[]>([]);
  const [busy, setBusy] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(true);
  const [closedOpen, setClosedOpen] = useState(false);

  const inbox = useMemo(
    () => items.filter((item) => !isClosed(item.status) && Boolean(item.agentDraft) && !item.acceptApprovedBy),
    [items],
  );
  const closed = useMemo(
    () => items.filter((item) => isClosed(item.status)),
    [items],
  );

  async function refresh() {
    const response = await fetch("/api/disputes", { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as {
      local?: LocalDispute[];
      error?: string;
    };
    if (!response.ok) {
      setNotice(payload.error ?? `Disputes failed (${response.status}).`);
      return;
    }
    setItems(Array.isArray(payload.local) ? payload.local : []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    const poll = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept(id: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/disputes/${encodeURIComponent(id)}/accept`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-demo-role": "seller",
        },
        body: JSON.stringify({ approved: true, note: "Seller accepted PayPal dispute — refund buyer" }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        toolkitNote?: string;
        toolkitError?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Accept failed.");
        return;
      }
      setNotice(payload.toolkitNote ?? "Accepted. Buyer will see Refund received.");
      if (payload.toolkitError) {
        setNotice(`Accepted locally. Toolkit: ${payload.toolkitError}`);
      }
      setClosedOpen(true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${s.app} ${s.sellerApp}`}>
      <aside className={`${s.sidebar} ${s.sellerSidebar}`} aria-label="Seller navigation">
        <Link href="/" className={s.brand}>
          <span className={s.brandIcon}><Layers3 size={23} /></span>
          <span>Procure<span className={s.brandAI}>AI</span><small>SELLER DESK</small></span>
        </Link>
        <div className={s.workspace}>
          <span className={s.avatar}>Se</span>
          <div>
            {session.name}
            <small>Seller session · not the buy desk</small>
          </div>
          <Package size={17} />
        </div>
        <p className={s.navLabel}>SELLER</p>
        <nav className={s.nav}>
          <button type="button" aria-current="page">
            <Package size={19} /><span>Incoming disputes</span>
            {inbox.length > 0 && <span className={s.navCount}>{inbox.length}</span>}
          </button>
        </nav>
        <div className={s.sidebarBottom}>
          <div className={`${s.safety} ${s.sellerSafety}`}>
            <Package size={23} />
            <strong>You fulfill.<br />PayPal brings claims here.</strong>
            <p>No RFQ, checkout, or capture tools in this role. Accept = refund the buyer.</p>
          </div>
          <div className={s.profile}>
            <span className={s.avatar}>Se</span>
            <div>
              Seller
              <small>Dispute accept only</small>
            </div>
            <button type="button" className={s.textButton} title="Sign out" onClick={onSignOut}>
              <LogOut size={15} />
            </button>
          </div>
          <div className={s.roleSwitch}>
            <button type="button" className={s.secondary} onClick={onSwitchToBuyer}>Buyer</button>
            <button type="button" className={s.secondary} onClick={onSwitchToSupervisor}>Supervisor</button>
            <button type="button" className={s.primary} disabled>Seller</button>
          </div>
        </div>
      </aside>

      <main className={s.main} id="workspace-main">
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            <span>Seller desk</span><ChevronRight size={14} /><strong>Incoming disputes</strong>
          </div>
        </header>

        <div className={s.content}>
          <section className={`${s.heading} ${s.sellerHeading}`}>
            <div>
              <p className={s.eyebrow}>PROCUREAI · SELLER PRODUCT</p>
              <h1>Claims from PayPal.<br /><span>You accept or wait.</span></h1>
              <p className={s.lede}>
                This is not the Buyer or Supervisor workspace. You only review disputes PayPal forwards after a Buyer raises a claim on a captured order.
              </p>
            </div>
          </section>

          {notice && (
            <p className={s.status} role="status">{notice}</p>
          )}

          <section className={`${s.card} ${s.sellerCard}`}>
            <div className={s.inlineTitle}>
              <span className={`${s.paymentIcon} ${s.sellerIcon}`}><Package size={22} /></span>
              <div>
                <h2>PayPal → Seller inbox</h2>
                <p className={s.description}>
                  Static seller queue. No “open case”, no draft, no capture. Accept refunds the buyer.
                </p>
              </div>
              <button type="button" className={s.secondary} disabled={busy} onClick={() => void refresh()}>
                Refresh
              </button>
            </div>

            <div className={s.paymentNest} style={{ marginTop: 14 }}>
              <button
                type="button"
                className={s.paymentNestToggle}
                aria-expanded={inboxOpen}
                onClick={() => setInboxOpen((v) => !v)}
              >
                {inboxOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>Needs accept</span>
                <em>{inbox.length}</em>
              </button>
              {inboxOpen && (
                <div className={s.paymentNestBody}>
                  {inbox.length === 0 ? (
                    <div className={s.empty}>
                      <span className={s.emptyIcon}><Package size={26} /></span>
                      <h3>Inbox empty</h3>
                      <p>When a Buyer raises a dispute on a captured order, PayPal sends it here.</p>
                    </div>
                  ) : (
                    <ul className={s.draftList}>
                      {inbox.map((item) => (
                        <li key={item.disputeId} className={s.paymentQueueSelected}>
                          <div className={s.iconTile}><Package size={19} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong>{item.disputeId}</strong>
                            <p>
                              From PayPal · {item.reason}
                              {item.amount ? ` · $${item.amount}` : ""}
                              {item.orderId ? ` · order ${item.orderId}` : ""}
                            </p>
                            <div className={s.agentCaptureCard}>
                              <p className={s.agentCaptureBanner}>Buyer claim</p>
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
                          </div>
                          <span className={s.draftBadge}>FROM PAYPAL</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className={s.paymentNest} style={{ marginTop: 12 }}>
              <button
                type="button"
                className={s.paymentNestToggle}
                aria-expanded={closedOpen}
                onClick={() => setClosedOpen((v) => !v)}
              >
                {closedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>Accepted / closed</span>
                <em>{closed.length}</em>
              </button>
              {closedOpen && (
                <div className={s.paymentNestBody}>
                  {closed.length === 0 ? (
                    <p className={s.tableNote}>Accepted claims appear here. Buyer then sees Refund received.</p>
                  ) : (
                    <ul className={s.draftList}>
                      {closed.map((item) => (
                        <li key={item.disputeId}>
                          <div className={s.iconTile}><ShieldCheck size={19} /></div>
                          <div>
                            <strong>{item.disputeId}</strong>
                            <p>
                              {item.status}
                              {item.amount ? ` · $${item.amount}` : ""}
                              {item.acceptApprovedBy ? ` · ${item.acceptApprovedBy}` : ""}
                            </p>
                          </div>
                          <span className={s.draftBadge}>{item.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className={s.paymentFoot}>
              <ShieldCheck size={16} />
              <span>Seller product · no buy-side navigation · accept only</span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
