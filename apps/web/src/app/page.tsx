"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight, ArrowUpRight, Bot, Check, ChevronRight,
  CreditCard, FileText, Layers3, LayoutDashboard,
  Maximize2, Menu, Minimize2, Package, Plus,
  Search, Send, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule, ModuleRegistry, themeQuartz,
  type ColDef,
} from "ag-grid-community";
import s from "./dashboard.module.css";
import Link from "next/link";

ModuleRegistry.registerModules([AllCommunityModule]);

type View = "Overview" | "Requests" | "Supplier offers" | "Payments & orders";
type Draft = { id: string; brief: string; at: string };
type Offer = {
  supplier: string;
  unitPrice: number;
  leadTimeDays: number;
  score: number;
};

const navigation = [
  { name: "Overview" as const, icon: LayoutDashboard },
  { name: "Requests" as const, icon: FileText },
  { name: "Supplier offers" as const, icon: Layers3 },
  { name: "Payments & orders" as const, icon: CreditCard },
];
const examples = [
  "50 ergonomic chairs, under $200 each, within 30 days",
  "Compare suppliers with delivery speed as my priority",
];
const offers: Offer[] = [];
const money = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
});
const columns: ColDef<Offer>[] = [
  { field: "supplier", headerName: "Supplier", minWidth: 180 },
  {
    field: "unitPrice", headerName: "Unit price", minWidth: 140,
    valueFormatter: ({ value }) =>
      typeof value === "number" ? money.format(value) : "—",
  },
  { field: "leadTimeDays", headerName: "Delivery · days", minWidth: 160 },
  { field: "score", headerName: "Match score", minWidth: 140 },
];
const gridTheme = themeQuartz.withParams({
  accentColor: "#0070e0",
  backgroundColor: "#ffffff",
  foregroundColor: "#142c52",
  headerBackgroundColor: "#f5f8fd",
  borderColor: "#e5ebf4",
  fontFamily: "inherit",
  fontSize: 14,
  rowHeight: 56,
  headerHeight: 48,
});

export default function Dashboard() {
  const [view, setView] = useState<View>("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [search, setSearch] = useState("");
  const [offerSearch, setOfferSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const visibleDrafts = drafts.filter(draft =>
    draft.brief.toLowerCase().includes(search.toLowerCase())
  );

  function navigate(next: View) {
    setView(next);
    setMobileOpen(false);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function newRequest() {
    setView("Overview");
    setMobileOpen(false);
    requestAnimationFrame(() => briefRef.current?.focus());
  }

  function closeMenu() {
    setMobileOpen(false);
    menuRef.current?.focus();
  }

  function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = brief.trim();
    if (!text) return;
    setDrafts(current => [{
      id: crypto.randomUUID(), brief: text,
      at: new Date().toISOString(),
    }, ...current]);
    setBrief("");
    setNotice("Draft saved for this session. No AI call, supplier contact, or payment was started.");
  }

  return (
    <div className={s.app}>
      <a className={s.skip} href="#workspace-main">Skip to workspace</a>

      <aside className={s.sidebar} aria-label="Workspace navigation">
        <Link href="/" className={s.brand}>
          <span className={s.brandIcon}><Layers3 size={23} /></span>
          <span>Procure<span className={s.brandAI}>AI</span><small>AGENTIC PROCUREMENT</small></span>
          </Link>
        <div className={s.workspace}>
          <span className={s.avatar}>S</span>
          <div>My workspace<small>Owner workspace</small></div>
          <ShieldCheck size={17} />
        </div>
        <p className={s.navLabel}>WORKSPACE</p>
        <nav className={s.nav}>
          {navigation.map(({ name, icon: Icon }) => (
            <button key={name} onClick={() => navigate(name)}
              aria-current={view === name ? "page" : undefined}>
              <Icon size={19} /><span>{name}</span>
              {name === "Requests" && drafts.length > 0 &&
                <span className={s.navCount}>{drafts.length}</span>}
            </button>
          ))}
        </nav>
        <div className={s.sidebarBottom}>
          <div className={s.safety}>
            <ShieldCheck size={23} />
            <strong>AI negotiates.<br />You stay in control.</strong>
            <p>Payment authorization and capture remain separate, guarded actions.</p>
          </div>
          <div className={s.profile}><span className={s.avatar}>S</span><div>Suhail<small>Workspace owner</small></div></div>
        </div>
      </aside>

      <main className={s.main} id="workspace-main">
        <header className={s.topbar}>
          <div className={s.breadcrumb}>
            <button ref={menuRef} className={s.mobileMenu} aria-label="Open navigation"
              aria-expanded={mobileOpen} aria-controls="mobile-navigation"
              onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
            <span>Workspace</span><ChevronRight size={14} /><strong>{view}</strong>
          </div>
          <span className={s.previewPill}><span /> UI preview</span>
        </header>

        <div className={s.content}>
          <section className={s.heading}>
            <div>
              <p className={s.eyebrow}>PROCUREMENT, WITH YOU IN CONTROL</p>
              <h1 ref={headingRef} tabIndex={-1}>
                {view === "Overview" ? <>Better buying.<br /><span>Clearer decisions.</span></> : view}
              </h1>
              <p className={s.subtitle}>From your first request to the final payment. One clear workspace.</p>
            </div>
            <button className={s.primary} onClick={newRequest}><Plus size={18} /> New request</button>
          </section>

          <div className={s.previewNotice}>
            <ShieldCheck size={17} />
            <p>Interface preview. AI, orders, and PayPal are not connected here yet. Drafts are session-only.</p>
          </div>

          <section className={s.metrics} aria-label="Workspace summary">
            {[
              { label: "Request drafts", value: String(drafts.length), detail: "In this browser session", icon: FileText, target: "Requests" as View },
              { label: "Negotiations", value: "—", detail: "Workflow connection pending", icon: Sparkles, target: "Supplier offers" as View },
              { label: "Funds on hold", value: "—", detail: "PayPal connection pending", icon: ShieldCheck, target: "Payments & orders" as View },
              { label: "Active orders", value: "—", detail: "Order connection pending", icon: Package, target: "Payments & orders" as View },
            ].map(({ label, value, detail, icon: Icon, target }) => (
              <button className={s.metric} key={label} onClick={() => navigate(target)}>
                <span className={s.metricTop}><span>{label}</span><Icon size={18} /></span>
                <strong>{value}</strong><span className={s.metricBottom}>{detail}<ArrowUpRight size={14} /></span>
              </button>
            ))}
          </section>

          {view === "Overview" && <div className={s.overviewGrid}>
            <section className={`${s.card} ${s.composer}`} aria-labelledby="brief-title">
              <div className={s.sectionHeader}>
                <span className={s.iconTile}><Sparkles size={21} /></span>
                <span className={s.label}>START WITH A NEED</span>
              </div>
              <h2 id="brief-title">What are we sourcing?</h2>
              <p className={s.description}>Tell us what you need, your budget, and when it should arrive.</p>
              <form onSubmit={saveDraft} className={s.briefForm}>
                <label htmlFor="procurement-brief">Your procurement brief</label>
                <textarea ref={briefRef} id="procurement-brief" maxLength={500}
                  value={brief} onChange={event => setBrief(event.target.value)}
                  placeholder="50 ergonomic chairs. Under $200 each. Delivered within 30 days."
                  required />
                <div className={s.formFooter}>
                  <small>{brief.length}/500</small>
                  <button className={s.primary} type="submit" disabled={!brief.trim()}>
                    Save draft <ArrowRight size={16} />
                  </button>
                </div>
              </form>
              <div className={s.suggestions}>
                <span>Try a starting point</span>
                {examples.map(text => <button key={text} onClick={() => {
                  setBrief(text); briefRef.current?.focus();
                }}><Plus size={13} />{text}</button>)}
              </div>
              <p className={s.status} role="status">{notice}</p>
            </section>

            <section className={`${s.card} ${s.assistant}`} aria-labelledby="assistant-title">
              <div className={s.sectionHeader}>
                <div className={s.inlineTitle}><Bot size={20} /><h2 id="assistant-title">Buying assistant</h2></div>
                <span className={s.pending}>Not connected</span>
              </div>
              <div className={s.assistantBody}>
                <div className={s.orb}><Bot size={31} /></div>
                <h3>Less back-and-forth.<br />More informed decisions.</h3>
                <p>Once connected, your assistant will clarify requirements and explain the trade-offs between suppliers.</p>
                <div className={s.assistantSteps}>
                  {["Review your requirements", "Compare negotiated offers", "Approve on your terms"].map(text =>
                    <div key={text}><Check size={13} /><span>{text}</span></div>
                  )}
                </div>
              </div>
              <div className={s.chatBar}>
                <input disabled aria-label="AI chat is not connected" placeholder="Connect AI to start a conversation" />
                <button disabled aria-label="Sending is unavailable until AI is connected"><Send size={17} /></button>
              </div>
            </section>
          </div>}

          {(view === "Overview" || view === "Requests") && <section className={s.card}>
            <div className={s.sectionHeader}>
              <div><h2>Request drafts</h2><p className={s.description}>A clear brief is the start of a better deal.</p></div>
              <label className={s.search}><Search size={16} /><input aria-label="Search request drafts"
                placeholder="Find a draft" value={search} onChange={event => setSearch(event.target.value)} /></label>
            </div>
            {visibleDrafts.length > 0 ? <ul className={s.draftList}>
              {visibleDrafts.map(draft => <li key={draft.id}>
                <div className={s.iconTile}><FileText size={19} /></div>
                <details className={s.draftDetail}>
                  <summary>{draft.brief}</summary>
                  <p>Created {new Date(draft.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.</p>
                  <p>Local draft only. Not submitted, negotiated, or persisted.</p>
                </details>
                <span className={s.draftBadge}>Draft</span>
                <button className={s.iconButton} aria-label={`Remove draft: ${draft.brief}`}
                  onClick={() => {
                    setDrafts(current => current.filter(item => item.id !== draft.id));
                    setNotice("Draft removed.");
                  }}><X size={16} /></button>
              </li>)}
            </ul> : <div className={s.empty}>
              <span className={s.emptyIcon}><FileText size={25} /></span>
              <h3>{search ? "No matching drafts" : "Your next request starts here"}</h3>
              <p>{search ? "Try a different search." : "Create a draft to organize your next purchase. No supplier will be contacted."}</p>
              {!search && <button className={s.textButton} onClick={newRequest}>Create a request <ArrowRight size={15} /></button>}
            </div>}
          </section>}

          {view === "Supplier offers" && <section className={s.card}>
            <div className={s.sectionHeader}>
              <div><h2>Compare with confidence</h2><p className={s.description}>Price, delivery, and fit. Real negotiation results will appear here.</p></div>
              <div className={s.tableActions}>
                <label className={s.search}><Search size={16} /><input aria-label="Search supplier offers"
                  placeholder="Search offers" value={offerSearch} onChange={event => setOfferSearch(event.target.value)} /></label>
                <button className={`${s.iconButton} ${s.tooltip}`} data-tip={expanded ? "Compact view" : "Expand comparison"}
                  aria-label={expanded ? "Compact comparison" : "Expand comparison"}
                  aria-pressed={expanded} onClick={() => setExpanded(current => !current)}>
                  {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
              </div>
            </div>
            <div className={`${s.grid} ${expanded ? s.gridExpanded : ""}`}>
              <AgGridReact<Offer> theme={gridTheme} rowData={offers} columnDefs={columns}
                defaultColDef={{ flex: 1, sortable: true, filter: true, resizable: true }}
                quickFilterText={offerSearch}
                overlayNoRowsTemplate="<span>No connected supplier offers yet.</span>" />
            </div>
            <p className={s.tableNote}>AG Grid Community · Sort and filter from column headers. No sample offers are presented as live data.</p>
          </section>}

          {(view === "Overview" || view === "Payments & orders") && <section className={`${s.card} ${s.paymentCard}`}>
            <div className={s.sectionHeader}>
              <div className={s.inlineTitle}><span className={s.paymentIcon}><CreditCard size={22} /></span><div><h2>Payments, with clear checkpoints</h2><p className={s.description}>Designed around the PayPal authorization and capture flow.</p></div></div>
              <span className={s.pending}>Integration pending</span>
            </div>
            <p className={s.flowCaption}>Planned order lifecycle · not live order status</p>
            <ol className={s.paymentFlow}>
              {[
                { title: "Owner approval", detail: "Review before authorization" },
                { title: "Funds held", detail: "Authorized, not captured" },
                { title: "Seller ships", detail: "Carrier and tracking recorded" },
                { title: "Owner confirms", detail: "Capture after delivery" },
              ].map((step, index) => <li key={step.title}>
                <span className={s.stepNumber}>{index + 1}</span>
                <div><strong>{step.title}</strong><small>{step.detail}</small></div>
              </li>)}
            </ol>
            {view === "Payments & orders" && <div className={s.empty}>
              <span className={s.emptyIcon}><Package size={26} /></span><h3>No connected order data</h3>
              <p>Orders, authorization details, and audit links will appear after backend integration. Payment actions are unavailable in this preview.</p>
            </div>}
            <div className={s.paymentFoot}><ShieldCheck size={16} /><span>AI recommendations do not authorize payments.</span></div>
          </section>}

          <footer className={s.footer}>
            <span>ProcureAI · Independent hackathon project</span>
            <span>PayPal integration planned · Not an official PayPal product</span>
          </footer>
        </div>
      </main>

      <dialog id="mobile-navigation" className={s.mobileDialog} ref={element => {
        if (!element) return;
        if (mobileOpen && !element.open) element.showModal();
        if (!mobileOpen && element.open) element.close();
      }} onCancel={event => { event.preventDefault(); closeMenu(); }}
        onClick={event => { if (event.target === event.currentTarget) closeMenu(); }}
        aria-labelledby="mobile-nav-title">
        <div className={s.mobileDialogHeader}><h2 id="mobile-nav-title">Workspace</h2><button className={s.iconButton} onClick={closeMenu} aria-label="Close navigation"><X size={20} /></button></div>
        <nav className={s.nav}>
          {navigation.map(({ name, icon: Icon }) => <button key={name}
            aria-current={view === name ? "page" : undefined} onClick={() => navigate(name)}>
            <Icon size={19} /><span>{name}</span>
          </button>)}
        </nav>
      </dialog>
    </div>
  );
}