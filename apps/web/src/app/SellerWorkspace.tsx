"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Bot, ChevronDown, ChevronRight, FileText, LogOut,
  Mail, Package, Send, ShieldCheck, Layers3, Truck, Wallet,
} from "lucide-react";
import Link from "next/link";
import s from "./dashboard.module.css";
import type { DemoSession } from "@/lib/demo-auth";
import { publishSellerApEmail } from "@/lib/seller-ap-email-bridge";

type SellerTab = "rfqs" | "agents" | "fulfillment" | "money" | "disputes";

type LocalDispute = {
  disputeId: string;
  status: string;
  reason: string;
  amount?: string;
  orderId?: string | null;
  agentDraft?: string;
  acceptApprovedBy?: string;
};

type PayoutRow = {
  id: string;
  paypalBatchId?: string;
  status: string;
  amount: number;
  currency: string;
  invoiceId?: string;
  receiver: string;
  note?: string;
  createdAt?: string;
};

type ExtractedInvoice = {
  id: string;
  vendorName?: string;
  invoiceNumber?: string;
  amount: number;
  currency: string;
  status: string;
  source?: string;
};

type SentInvoice = {
  id: string;
  to: string;
  amount: string;
  note: string;
  at: string;
  buyerReceived: boolean;
};

const SELLER_RFQS = [
  {
    id: "RFQ-1842",
    buyer: "Northwind Procurement",
    brief: "Wireless headphones · qty 40 · deliver in 12 days",
    budget: "$28.00 / unit max",
    due: "Respond in 4h",
    status: "NEW",
  },
  {
    id: "RFQ-1837",
    buyer: "Acme Facilities",
    brief: "Office sticky notes pack · qty 200 · eco paper",
    budget: "$1.20 / unit max",
    due: "Respond in 1d",
    status: "NEW",
  },
  {
    id: "RFQ-1821",
    buyer: "Harbor Labs",
    brief: "USB-C docking stations · qty 15 · 2-day ship",
    budget: "$95.00 / unit max",
    due: "Countered",
    status: "IN PLAY",
  },
] as const;

const SELLER_AGENTS = [
  {
    id: "agent-quote",
    name: "Quote agent",
    role: "Reads RFQ · drafts unit price + lead time",
    state: "Idle · last quote RFQ-1821 @ $89.50",
  },
  {
    id: "agent-negotiate",
    name: "Negotiate agent",
    role: "Counters buyer targets within margin floor",
    state: "Watching 1 open thread",
  },
  {
    id: "agent-ship",
    name: "Ship notify agent",
    role: "Emails carrier + tracking after hold",
    state: "Ready · fires ~4s after PayPal HELD",
  },
] as const;

const SELLER_FULFILLMENT = [
  {
    id: "ORD-9921",
    item: "USB-C docks × 15",
    stage: "HELD",
    detail: "Funds on hold — ship email queued",
  },
  {
    id: "ORD-9914",
    item: "Sticky notes × 200",
    stage: "SHIPPED",
    detail: "UPS 1Z999 · waiting buyer capture",
  },
  {
    id: "ORD-9902",
    item: "Headphones × 40",
    stage: "CAPTURED",
    detail: "Paid · dispute window with buyer",
  },
] as const;

function isClosed(status: string): boolean {
  const value = status.toUpperCase();
  return (
    value === "RESOLVED"
    || value === "CLOSED"
    || value === "ACCEPTED"
    || value === "REFUND_RECEIVED"
  );
}

const TAB_META: Record<SellerTab, { eyebrow: string; title: string; accent: string; line: string }> = {
  rfqs: {
    eyebrow: "SELLER · INBOUND DEMAND",
    title: "RFQs from buyers.",
    accent: "You quote.",
    line: "Buyer desks send RFQs here. Your agents quote and negotiate — preview content for the seller product.",
  },
  agents: {
    eyebrow: "SELLER · AGENT TEAM",
    title: "Your quote & ship agents.",
    accent: "Seller side only.",
    line: "Seller-side agents answer RFQs, counter offers, and notify shipment after PayPal hold. Preview — not the buy desk bots.",
  },
  fulfillment: {
    eyebrow: "SELLER · ORDERS",
    title: "Hold → ship → paid.",
    accent: "You fulfill.",
    line: "Track what you owe to ship after authorization. Buyer capture and Satisfied stay on their desk.",
  },
  money: {
    eyebrow: "SELLER · MONEY",
    title: "Invoices out. Payouts in.",
    accent: "Your cash desk.",
    line: "Send invoices to Buyer AP, see when email is received/extracted, and watch PayPal payouts land after match.",
  },
  disputes: {
    eyebrow: "SELLER · PAYPAL",
    title: "Claims from PayPal.",
    accent: "You accept or wait.",
    line: "Live path: when a Buyer raises after capture, PayPal forwards the claim here. Accept = refund the buyer.",
  },
};

/**
 * Seller product surface — separate from Buyer/Supervisor marketplace.
 * Money + Disputes are live; RFQ / Agents / Fulfillment are seller-desk previews.
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
  const [tab, setTab] = useState<SellerTab>("money");
  const [items, setItems] = useState<LocalDispute[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [buyerInbox, setBuyerInbox] = useState<ExtractedInvoice[]>([]);
  const [sentInvoices, setSentInvoices] = useState<SentInvoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(true);
  const [closedOpen, setClosedOpen] = useState(false);
  const [payoutsOpen, setPayoutsOpen] = useState(true);
  const [receivedOpen, setReceivedOpen] = useState(true);
  const [invoiceTo, setInvoiceTo] = useState("payables@procureai.demo");
  const [invoiceAmount, setInvoiceAmount] = useState("45.00");
  const [invoiceNote, setInvoiceNote] = useState("Supplier invoice — BundleBits Supply Co");

  const inbox = useMemo(
    () => items.filter((item) => !isClosed(item.status) && Boolean(item.agentDraft) && !item.acceptApprovedBy),
    [items],
  );
  const closed = useMemo(
    () => items.filter((item) => isClosed(item.status)),
    [items],
  );
  const emailReceived = useMemo(
    () => buyerInbox.filter((inv) => String(inv.source ?? "").startsWith("email:")),
    [buyerInbox],
  );

  const meta = TAB_META[tab];

  async function refreshDisputes() {
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

  async function refreshMoney() {
    const [payoutRes, invRes] = await Promise.all([
      fetch("/api/invoices/payouts", { cache: "no-store" }),
      fetch("/api/invoices/extracted", { cache: "no-store" }),
    ]);
    const payoutPayload = await payoutRes.json().catch(() => ({})) as {
      items?: PayoutRow[];
      error?: string;
    };
    const invPayload = await invRes.json().catch(() => ({})) as {
      items?: ExtractedInvoice[];
      error?: string;
    };
    if (payoutRes.ok) {
      setPayouts(Array.isArray(payoutPayload.items) ? payoutPayload.items : []);
    }
    if (invRes.ok) {
      setBuyerInbox(Array.isArray(invPayload.items) ? invPayload.items : []);
      // Mark local sent invoices as received when Buyer AP extracted an email invoice
      setSentInvoices((prev) => prev.map((row) => {
        if (row.buyerReceived) return row;
        const hit = (invPayload.items ?? []).some((inv) =>
          String(inv.source ?? "").startsWith("email:")
          && Math.abs(Number(inv.amount) - Number(row.amount)) < 0.02,
        );
        return hit ? { ...row, buyerReceived: true } : row;
      }));
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDisputes();
      void refreshMoney();
    }, 0);
    const poll = window.setInterval(() => {
      void refreshDisputes();
      void refreshMoney();
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
      setNotice(payload.toolkitNote ?? "Accepted. Buyer will see PayPal refund payment.");
      if (payload.toolkitError) {
        setNotice(`Accepted locally. Toolkit: ${payload.toolkitError}`);
      }
      setClosedOpen(true);
      await refreshDisputes();
    } finally {
      setBusy(false);
    }
  }

  async function sendSupplierInvoice() {
    setBusy(true);
    try {
      const response = await fetch("/api/invoices/paypal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-demo-role": "seller",
        },
        body: JSON.stringify({
          email: invoiceTo,
          amount: invoiceAmount,
          note: invoiceNote,
          givenName: "Buyer",
          surname: "Payables",
          send: true,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        invoiceId?: string;
        note?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Send invoice failed.");
        return;
      }
      const sent: SentInvoice = {
        id: payload.invoiceId ?? `sent-${Date.now()}`,
        to: invoiceTo,
        amount: invoiceAmount,
        note: invoiceNote,
        at: new Date().toISOString(),
        buyerReceived: false,
      };
      setSentInvoices((prev) => [sent, ...prev]);
      // Cross-tab: Buyer Payables From email picks this up and shows the supplier email.
      publishSellerApEmail({
        invoiceId: sent.id,
        to: invoiceTo,
        amount: invoiceAmount,
        note: invoiceNote,
        vendor: "BundleBits Supply Co",
        at: sent.at,
      });
      setNotice(
        `Invoice sent to ${invoiceTo} (${sent.id}). `
        + "Buyer window → Payables → From email will show it (~3s). After Match → Payout, refresh Payouts completed here.",
      );
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
            <small>Seller product · not the buy desk</small>
          </div>
          <Package size={17} />
        </div>
        <p className={s.navLabel}>SELLER</p>
        <nav className={s.nav}>
          <button type="button" aria-current={tab === "rfqs" ? "page" : undefined} onClick={() => setTab("rfqs")}>
            <FileText size={19} /><span>RFQ inbox</span>
            <span className={s.navCount}>{SELLER_RFQS.length}</span>
          </button>
          <button type="button" aria-current={tab === "agents" ? "page" : undefined} onClick={() => setTab("agents")}>
            <Bot size={19} /><span>Seller agents</span>
          </button>
          <button type="button" aria-current={tab === "fulfillment" ? "page" : undefined} onClick={() => setTab("fulfillment")}>
            <Truck size={19} /><span>Fulfillment</span>
          </button>
          <button type="button" aria-current={tab === "money" ? "page" : undefined} onClick={() => setTab("money")}>
            <Wallet size={19} /><span>Payouts &amp; invoices</span>
            {(payouts.length > 0 || emailReceived.length > 0) && (
              <span className={s.navCount}>{payouts.length + emailReceived.length}</span>
            )}
          </button>
          <button type="button" aria-current={tab === "disputes" ? "page" : undefined} onClick={() => setTab("disputes")}>
            <Package size={19} /><span>Disputes</span>
            {inbox.length > 0 && <span className={s.navCount}>{inbox.length}</span>}
          </button>
        </nav>
        <div className={s.sidebarBottom}>
          <div className={`${s.safety} ${s.sellerSafety}`}>
            <Wallet size={23} />
            <strong>Quote. Ship.<br />Invoice. Get paid.</strong>
            <p>Seller desk: RFQs → fulfill → send invoice → see payouts → handle PayPal claims.</p>
          </div>
          <div className={s.profile}>
            <span className={s.avatar}>Se</span>
            <div>
              Seller
              <small>Supplier product</small>
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
            <span>Seller desk</span>
            <ChevronRight size={14} />
            <strong>
              {tab === "rfqs" && "RFQ inbox"}
              {tab === "agents" && "Seller agents"}
              {tab === "fulfillment" && "Fulfillment"}
              {tab === "money" && "Payouts & invoices"}
              {tab === "disputes" && "Disputes"}
            </strong>
          </div>
        </header>

        <div className={s.content}>
          <section className={`${s.heading} ${s.sellerHeading}`}>
            <div>
              <p className={s.eyebrow}>PROCUREAI · {meta.eyebrow}</p>
              <h1>{meta.title}<br /><span>{meta.accent}</span></h1>
              <p className={s.lede}>{meta.line}</p>
            </div>
          </section>

          {notice && (
            <p className={s.status} role="status">{notice}</p>
          )}

          {tab === "rfqs" && (
            <section className={`${s.card} ${s.sellerCard}`}>
              <div className={s.inlineTitle}>
                <span className={`${s.paymentIcon} ${s.sellerIcon}`}><FileText size={22} /></span>
                <div>
                  <h2>Inbound RFQs</h2>
                  <p className={s.description}>Buyers publish requests; you decide which to quote. Preview rows.</p>
                </div>
                <span className={s.pending}>Preview</span>
              </div>
              <ul className={s.draftList} style={{ marginTop: 14 }}>
                {SELLER_RFQS.map((rfq) => (
                  <li key={rfq.id}>
                    <div className={s.iconTile}><FileText size={19} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{rfq.id} · {rfq.buyer}</strong>
                      <p>{rfq.brief}</p>
                      <p className={s.tableNote}>{rfq.budget} · {rfq.due}</p>
                      <div className={s.reviewActions} style={{ marginTop: 8 }}>
                        <button type="button" className={s.primary} onClick={() => setNotice(`Preview: quote agent would draft a response for ${rfq.id}.`)}>
                          Draft quote <ArrowRight size={14} />
                        </button>
                        <button type="button" className={s.secondary} onClick={() => setNotice(`Preview: ${rfq.id} declined for this demo.`)}>
                          Pass
                        </button>
                      </div>
                    </div>
                    <span className={s.draftBadge}>{rfq.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "agents" && (
            <section className={`${s.card} ${s.sellerCard}`}>
              <div className={s.inlineTitle}>
                <span className={`${s.paymentIcon} ${s.sellerIcon}`}><Bot size={22} /></span>
                <div>
                  <h2>Seller agent team</h2>
                  <p className={s.description}>Quote, counter, and ship-notify agents on your side.</p>
                </div>
                <span className={s.pending}>Preview</span>
              </div>
              <ul className={s.draftList} style={{ marginTop: 14 }}>
                {SELLER_AGENTS.map((agent) => (
                  <li key={agent.id}>
                    <div className={s.iconTile}><Bot size={19} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{agent.name}</strong>
                      <p>{agent.role}</p>
                      <p className={s.tableNote}>{agent.state}</p>
                    </div>
                    <span className={s.draftBadge}>SELLER</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "fulfillment" && (
            <section className={`${s.card} ${s.sellerCard}`}>
              <div className={s.inlineTitle}>
                <span className={`${s.paymentIcon} ${s.sellerIcon}`}><Truck size={22} /></span>
                <div>
                  <h2>Fulfillment board</h2>
                  <p className={s.description}>Ship after PayPal hold. Then invoice from Payouts &amp; invoices.</p>
                </div>
                <span className={s.pending}>Preview</span>
              </div>
              <ul className={s.draftList} style={{ marginTop: 14 }}>
                {SELLER_FULFILLMENT.map((order) => (
                  <li key={order.id}>
                    <div className={s.iconTile}><Truck size={19} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{order.id} · {order.item}</strong>
                      <p>{order.detail}</p>
                    </div>
                    <span className={s.draftBadge}>{order.stage}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tab === "money" && (
            <section className={`${s.card} ${s.sellerCard}`}>
              <div className={s.inlineTitle}>
                <span className={`${s.paymentIcon} ${s.sellerIcon}`}><Wallet size={22} /></span>
                <div>
                  <h2>Payouts &amp; invoices</h2>
                  <p className={s.description}>
                    Live seller cash desk: send invoice to Buyer AP, see email received, watch payouts complete.
                  </p>
                </div>
                <button type="button" className={s.secondary} disabled={busy} onClick={() => void refreshMoney()}>
                  Refresh
                </button>
              </div>

              <div className={s.agentCaptureCard} style={{ marginTop: 14 }}>
                <p className={s.agentCaptureBanner}>Create &amp; send (PayPal invoice)</p>
                <p className={s.description} style={{ margin: 0 }}>
                  Seller action: create a PayPal invoice and send it as email to Buyer AP.
                  Buyer window shows it under <strong>From email</strong> → Match → Payout → <strong>Payouts completed</strong> here.
                </p>
                <div className={s.fieldGrid} style={{ marginTop: 10 }}>
                  <div className={s.field}>
                    <label htmlFor="seller-inv-to">Buyer AP email</label>
                    <input id="seller-inv-to" value={invoiceTo} onChange={(e) => setInvoiceTo(e.target.value)} />
                  </div>
                  <div className={s.field}>
                    <label htmlFor="seller-inv-amt">Amount (USD)</label>
                    <input id="seller-inv-amt" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} />
                  </div>
                  <div className={s.field}>
                    <label htmlFor="seller-inv-note">Note</label>
                    <input id="seller-inv-note" value={invoiceNote} onChange={(e) => setInvoiceNote(e.target.value)} />
                  </div>
                </div>
                <div className={s.reviewActions}>
                  <button type="button" className={s.primary} disabled={busy} onClick={() => void sendSupplierInvoice()}>
                    {busy ? "Sending…" : "Create & send"} <Send size={14} />
                  </button>
                </div>
              </div>

              {sentInvoices.length > 0 && (
                <div className={s.paymentNest} style={{ marginTop: 12 }}>
                  <div className={s.paymentNestToggle} style={{ cursor: "default" }}>
                    <Mail size={16} />
                    <span>Invoices you sent</span>
                    <em>{sentInvoices.length}</em>
                  </div>
                  <div className={s.paymentNestBody}>
                    <ul className={s.draftList}>
                      {sentInvoices.map((row) => (
                        <li key={row.id}>
                          <div className={s.iconTile}><Send size={18} /></div>
                          <div>
                            <strong>{row.id}</strong>
                            <p>
                              To {row.to} · ${row.amount} · {row.note}
                            </p>
                            <p className={s.tableNote}>
                              {row.buyerReceived
                                ? "Buyer AP received email · extracted on Payables"
                                : "Sent — waiting for Buyer AP to receive / extract…"}
                            </p>
                          </div>
                          <span className={s.draftBadge}>{row.buyerReceived ? "RECEIVED" : "SENT"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className={s.paymentNest} style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className={s.paymentNestToggle}
                  aria-expanded={receivedOpen}
                  onClick={() => setReceivedOpen((v) => !v)}
                >
                  {receivedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span>Buyer AP · email received</span>
                  <em>{emailReceived.length}</em>
                </button>
                {receivedOpen && (
                  <div className={s.paymentNestBody}>
                    {emailReceived.length === 0 ? (
                      <p className={s.tableNote}>
                        After Buyer extracts your Create &amp; send email on Payables, rows appear here.
                      </p>
                    ) : (
                      <ul className={s.draftList}>
                        {emailReceived.map((inv) => (
                          <li key={inv.id} className={s.paymentQueueSelected}>
                            <div className={s.iconTile}><Mail size={18} /></div>
                            <div>
                              <strong>{inv.invoiceNumber ?? inv.id.slice(0, 8)}</strong>
                              <p>
                                {inv.vendorName ?? "Vendor"} · {inv.currency} {inv.amount.toFixed(2)} · {inv.status}
                              </p>
                              <p className={s.tableNote}>via {inv.source}</p>
                            </div>
                            <span className={s.draftBadge}>EMAIL IN</span>
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
                  aria-expanded={payoutsOpen}
                  onClick={() => setPayoutsOpen((v) => !v)}
                >
                  {payoutsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span>Payouts completed</span>
                  <em>{payouts.length}</em>
                </button>
                {payoutsOpen && (
                  <div className={s.paymentNestBody}>
                    {payouts.length === 0 ? (
                      <div className={s.empty}>
                        <span className={s.emptyIcon}><Wallet size={26} /></span>
                        <h3>No payouts yet</h3>
                        <p>When Buyer Payables runs Match → Payout, completed batches show here.</p>
                      </div>
                    ) : (
                      <ul className={s.draftList}>
                        {payouts.map((row) => (
                          <li key={row.id} className={s.paymentQueueSelected}>
                            <div className={s.iconTile}><Wallet size={18} /></div>
                            <div>
                              <strong>
                                {row.currency} {Number(row.amount).toFixed(2)} · {row.status}
                              </strong>
                              <p>
                                To {row.receiver}
                                {row.paypalBatchId ? ` · ${row.paypalBatchId}` : ""}
                                {row.invoiceId ? ` · invoice ${row.invoiceId.slice(0, 8)}` : ""}
                              </p>
                              {row.note && <p className={s.tableNote}>{row.note}</p>}
                            </div>
                            <span className={s.draftBadge}>PAID</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className={s.paymentFoot}>
                <ShieldCheck size={16} />
                <span>Live payouts + send invoice · Buyer Payables is the AP twin of this tab</span>
              </div>
            </section>
          )}

          {tab === "disputes" && (
            <section className={`${s.card} ${s.sellerCard}`}>
              <div className={s.inlineTitle}>
                <span className={`${s.paymentIcon} ${s.sellerIcon}`}><Package size={22} /></span>
                <div>
                  <h2>PayPal → Seller inbox</h2>
                  <p className={s.description}>
                    Live: <strong>Accept (refund buyer)</strong>. Buyer then sees a PayPal refund payment.
                  </p>
                </div>
                <button type="button" className={s.secondary} disabled={busy} onClick={() => void refreshDisputes()}>
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
                      <p className={s.tableNote}>Accepted claims appear here.</p>
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
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
