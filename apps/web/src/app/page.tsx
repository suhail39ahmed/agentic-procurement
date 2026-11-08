"use client";

import { useId, useRef, useState, type FormEvent } from "react";
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
type Priority = "price" | "speed" | "balanced";
type Currency = "USD";
type ComposerMode = "compose" | "review";

type RequestFields = {
  brief: string;
  priority: Priority;
  quantity: string;
  maxUnitPrice: string;
  currency: Currency;
  neededByDays: string;
};

type Draft = {
  id: string;
  brief: string;
  priority: Priority;
  quantity: number;
  maxUnitPrice: number;
  currency: Currency;
  neededByDays: number;
  at: string;
};

type NegotiationRecord = {
  id: string;
  status: string;
  brief: string;
  priority: Priority;
  quantity: number;
  maxUnitPrice: number;
  currency: string;
  neededByDays: number;
  workflowRunId: string | null;
  createdAt: string;
  updatedAt: string;
  result?: unknown;
  error?: unknown;
};

type FieldErrors = Partial<Record<keyof RequestFields, string>>;

type Offer = {
  supplier: string;
  unitPrice: number;
  leadTimeDays: number;
  score: number;
};

function offersFromResult(result: unknown): Offer[] {
  if (!result || typeof result !== "object") return [];
  const ranking = (result as { ranking?: unknown }).ranking;
  if (!Array.isArray(ranking)) return [];
  return ranking.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as {
      score?: unknown;
      offer?: { from?: unknown; unitPrice?: unknown; leadTimeDays?: unknown };
    };
    if (!row.offer || typeof row.offer !== "object") return [];
    const supplier = typeof row.offer.from === "string" ? row.offer.from : null;
    const unitPrice = typeof row.offer.unitPrice === "number" ? row.offer.unitPrice : null;
    const leadTimeDays = typeof row.offer.leadTimeDays === "number" ? row.offer.leadTimeDays : null;
    const score = typeof row.score === "number" ? row.score : 0;
    if (!supplier || unitPrice === null || leadTimeDays === null) return [];
    return [{ supplier, unitPrice, leadTimeDays, score: Math.round(score * 1000) / 1000 }];
  });
}

const navigation = [
  { name: "Overview" as const, icon: LayoutDashboard },
  { name: "Requests" as const, icon: FileText },
  { name: "Supplier offers" as const, icon: Layers3 },
  { name: "Payments & orders" as const, icon: CreditCard },
];

const priorities: { value: Priority; label: string; detail: string }[] = [
  { value: "price", label: "Lowest cost", detail: "Prefer stronger unit price" },
  { value: "speed", label: "Fastest delivery", detail: "Prefer shorter lead time" },
  { value: "balanced", label: "Balanced", detail: "Trade off price and speed" },
];

const examples: RequestFields[] = [
  {
    brief: "50 ergonomic chairs for the new floor. Prefer durable mesh backs.",
    priority: "price",
    quantity: "50",
    maxUnitPrice: "200.00",
    currency: "USD",
    neededByDays: "30",
  },
  {
    brief: "Compare suppliers with delivery speed as my priority for standing desks.",
    priority: "speed",
    quantity: "12",
    maxUnitPrice: "450.00",
    currency: "USD",
    neededByDays: "14",
  },
];

const emptyFields = (): RequestFields => ({
  brief: "",
  priority: "balanced",
  quantity: "",
  maxUnitPrice: "",
  currency: "USD",
  neededByDays: "",
});

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

function priorityLabel(priority: Priority) {
  return priorities.find(item => item.value === priority)?.label ?? priority;
}

function validateFields(fields: RequestFields): { errors: FieldErrors; draft?: Omit<Draft, "id" | "at"> } {
  const errors: FieldErrors = {};
  const brief = fields.brief.trim();
  if (!brief) errors.brief = "Add a short description of what you need.";
  else if (brief.length > 500) errors.brief = "Keep the brief to 500 characters or fewer.";

  const quantity = Number(fields.quantity);
  if (!fields.quantity.trim()) errors.quantity = "Enter a quantity.";
  else if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
    errors.quantity = "Quantity must be a whole number from 1 to 10,000.";
  }

  const maxUnitPrice = Number(fields.maxUnitPrice);
  if (!fields.maxUnitPrice.trim()) errors.maxUnitPrice = "Enter a maximum unit price.";
  else if (!Number.isFinite(maxUnitPrice) || maxUnitPrice <= 0 || maxUnitPrice > 1_000_000) {
    errors.maxUnitPrice = "Unit budget must be greater than 0 and at most 1,000,000.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(fields.maxUnitPrice.trim())) {
    errors.maxUnitPrice = "Use up to two decimal places for the unit budget.";
  }

  if (fields.currency !== "USD") errors.currency = "Only USD is supported in this preview.";

  const neededByDays = Number(fields.neededByDays);
  if (!fields.neededByDays.trim()) errors.neededByDays = "Enter a delivery deadline in days.";
  else if (!Number.isInteger(neededByDays) || neededByDays < 1 || neededByDays > 365) {
    errors.neededByDays = "Deadline must be a whole number of days from 1 to 365.";
  }

  if (!priorities.some(item => item.value === fields.priority)) {
    errors.priority = "Choose a sourcing priority.";
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    draft: {
      brief,
      priority: fields.priority,
      quantity,
      maxUnitPrice: Math.round(maxUnitPrice * 100) / 100,
      currency: "USD",
      neededByDays,
    },
  };
}

export default function Dashboard() {
  const [view, setView] = useState<View>("Overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [fields, setFields] = useState<RequestFields>(emptyFields);
  const [composerMode, setComposerMode] = useState<ComposerMode>("compose");
  const [pendingDraft, setPendingDraft] = useState<Omit<Draft, "id" | "at"> | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [negotiations, setNegotiations] = useState<NegotiationRecord[]>([]);
  const [negotiationsError, setNegotiationsError] = useState("");
  const [queueBusy, setQueueBusy] = useState(false);
  const [activeNegotiationId, setActiveNegotiationId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersNote, setOffersNote] = useState("Queue a negotiation to load real supplier offers.");
  const [orderBusy, setOrderBusy] = useState(false);
  const [activeOrder, setActiveOrder] = useState<{
    orderId: string;
    status: string;
    approveUrl?: string | null;
    amount?: string;
    supplierId?: string;
    authorizationId?: string;
    captureId?: string;
    tracking?: { carrier: string; number: string };
  } | null>(null);
  const [search, setSearch] = useState("");
  const [offerSearch, setOfferSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState("");
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const formId = useId();
  const visibleDrafts = drafts.filter(draft => {
    const haystack = [
      draft.brief,
      priorityLabel(draft.priority),
      String(draft.quantity),
      draft.currency,
      String(draft.neededByDays),
    ].join(" ").toLowerCase();
    return haystack.includes(search.toLowerCase());
  });
  const visibleNegotiations = negotiations.filter(item => {
    const haystack = [
      item.brief,
      item.status,
      priorityLabel(item.priority),
      String(item.quantity),
    ].join(" ").toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  async function loadNegotiationDetail(id: string) {
    const response = await fetch(`/api/negotiations/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as NegotiationRecord;
  }

  function applyNegotiationResult(detail: NegotiationRecord) {
    activeIdRef.current = detail.id;
    setActiveNegotiationId(detail.id);
    if (detail.status === "SUCCEEDED") {
      const nextOffers = offersFromResult(detail.result);
      setOffers(nextOffers);
      setOffersNote(
        nextOffers.length > 0
          ? `Live ranking for negotiation ${detail.id.slice(0, 8)}…`
          : "Negotiation finished, but no eligible offers were returned.",
      );
      return;
    }
    if (detail.status === "FAILED") {
      setOffers([]);
      const message = detail.error && typeof detail.error === "object" && "message" in detail.error
        ? String((detail.error as { message: unknown }).message)
        : "Negotiation failed.";
      setOffersNote(message);
      return;
    }
    if (detail.status === "RUNNING" || detail.status === "QUEUED") {
      setOffersNote(`Negotiation ${detail.status.toLowerCase()}. Offers will appear when it finishes.`);
    }
  }

  async function loadNegotiations() {
    try {
      const response = await fetch("/api/negotiations", { cache: "no-store" });
      if (!response.ok) {
        setNegotiationsError(
          response.status === 503
            ? "API configuration missing on the web server."
            : `Could not load negotiations (${response.status}).`,
        );
        return;
      }
      const data = await response.json() as { items?: NegotiationRecord[] };
      const items = Array.isArray(data.items) ? data.items : [];
      setNegotiations(items);
      setNegotiationsError("");

      const focusId = activeIdRef.current
        ?? items.find(item => item.status === "RUNNING" || item.status === "QUEUED")?.id
        ?? items.find(item => item.status === "SUCCEEDED")?.id
        ?? null;

      if (focusId) {
        const detail = await loadNegotiationDetail(focusId);
        if (detail) applyNegotiationResult(detail);
      }

      const needsPoll = items.some(item => item.status === "QUEUED" || item.status === "RUNNING");
      if (needsPoll && !pollRef.current) {
        pollRef.current = setInterval(() => {
          void loadNegotiations();
        }, 5000);
      }
      if (!needsPoll && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      setNegotiationsError("Could not reach the negotiations API. Is the API running?");
    }
  }

  function updateField<K extends keyof RequestFields>(key: K, value: RequestFields[K]) {
    setFields(current => ({ ...current, [key]: value }));
    setFieldErrors(current => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function navigate(next: View) {
    setView(next);
    setMobileOpen(false);
    if (next === "Overview" || next === "Requests") {
      void loadNegotiations();
    }
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function resetComposer() {
    setFields(emptyFields());
    setPendingDraft(null);
    setFieldErrors({});
    setComposerMode("compose");
  }

  function newRequest() {
    setView("Overview");
    setMobileOpen(false);
    setComposerMode("compose");
    setPendingDraft(null);
    setFieldErrors({});
    setNotice("");
    requestAnimationFrame(() => briefRef.current?.focus());
  }

  function closeMenu() {
    setMobileOpen(false);
    menuRef.current?.focus();
  }

  function reviewDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateFields(fields);
    setFieldErrors(result.errors);
    if (!result.draft) {
      setNotice("Fix the highlighted fields before reviewing this draft.");
      requestAnimationFrame(() => briefRef.current?.focus());
      return;
    }
    setPendingDraft(result.draft);
    setComposerMode("review");
    setNotice("Review your request. Nothing has been submitted, negotiated, or paid.");
    requestAnimationFrame(() => reviewHeadingRef.current?.focus());
  }

  function saveDraft() {
    if (!pendingDraft) return;
    const fingerprint = JSON.stringify(pendingDraft);
    const duplicate = drafts.some(draft => JSON.stringify({
      brief: draft.brief,
      priority: draft.priority,
      quantity: draft.quantity,
      maxUnitPrice: draft.maxUnitPrice,
      currency: draft.currency,
      neededByDays: draft.neededByDays,
    }) === fingerprint);
    if (duplicate) {
      setNotice("This exact request draft is already saved for this session.");
      return;
    }
    setDrafts(current => [{
      id: crypto.randomUUID(),
      ...pendingDraft,
      at: new Date().toISOString(),
    }, ...current]);
    resetComposer();
    setNotice("Draft saved for this session. No AI call, supplier contact, or payment was started.");
  }

  async function queueNegotiation() {
    if (!pendingDraft || queueBusy) return;
    setQueueBusy(true);
    setNotice("Queueing negotiation to the API…");
    try {
      const response = await fetch("/api/negotiations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brief: pendingDraft.brief,
          priority: pendingDraft.priority,
          quantity: pendingDraft.quantity,
          maxUnitPrice: pendingDraft.maxUnitPrice.toFixed(2),
          currency: pendingDraft.currency,
          neededByDays: pendingDraft.neededByDays,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        id?: string;
        status?: string;
        idempotent?: boolean;
        error?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? `Queue failed (${response.status}).`);
        return;
      }
      if (payload.id) {
        activeIdRef.current = payload.id;
        setActiveNegotiationId(payload.id);
      }
      await loadNegotiations();
      resetComposer();
      setNotice(
        payload.idempotent
          ? `Existing negotiation reused (${payload.status ?? "QUEUED"}).`
          : `Negotiation queued and started (${payload.status ?? "QUEUED"}). AI is running in the background — no payment was started.`,
      );
      setView("Supplier offers");
      setOffersNote("Negotiation running. This page refreshes offers when results arrive.");
    } catch {
      setNotice("Queue failed. Check that the API is running and try again.");
    } finally {
      setQueueBusy(false);
    }
  }

  async function startCheckout() {
    if (!activeNegotiationId || orderBusy) return;
    setOrderBusy(true);
    setNotice("Creating PayPal authorize order from the winning offer…");
    try {
      const response = await fetch(`/api/negotiations/${encodeURIComponent(activeNegotiationId)}/checkout`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        orderId?: string;
        status?: string;
        approveUrl?: string;
        amount?: string;
        supplierId?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? `Checkout failed (${response.status}).`);
        return;
      }
      setActiveOrder({
        orderId: payload.orderId ?? "",
        status: payload.status ?? "APPROVED",
        approveUrl: payload.approveUrl,
        amount: payload.amount,
        supplierId: payload.supplierId,
      });
      setNotice("Checkout created. Open the PayPal approve link as the sandbox buyer, then Authorize hold.");
      setView("Payments & orders");
    } catch {
      setNotice("Checkout failed. Check API/PayPal sandbox configuration.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function authorizeHold() {
    if (!activeOrder?.orderId || orderBusy) return;
    setOrderBusy(true);
    setNotice("Authorizing PayPal hold…");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(activeOrder.orderId)}/authorize`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        status?: string;
        authorizationId?: string;
        amount?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? `Authorize failed (${response.status}). Approve the PayPal link first.`);
        return;
      }
      setActiveOrder(current => current ? {
        ...current,
        status: payload.status ?? "HELD",
        authorizationId: payload.authorizationId,
        amount: payload.amount ?? current.amount,
      } : current);
      setNotice("Funds held (authorized, not captured).");
    } catch {
      setNotice("Authorize failed.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function markOrderShipped() {
    if (!activeOrder?.orderId || orderBusy) return;
    setOrderBusy(true);
    setNotice("Recording shipment…");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(activeOrder.orderId)}/ship`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ carrier: "UPS", number: "1Z999AA10123456784" }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        status?: string;
        tracking?: { carrier: string; number: string };
      };
      if (!response.ok) {
        setNotice(payload.error ?? `Ship failed (${response.status}).`);
        return;
      }
      setActiveOrder(current => current ? {
        ...current,
        status: payload.status ?? "SHIPPED",
        tracking: payload.tracking,
      } : current);
      setNotice("Marked shipped. Confirm delivery to capture.");
    } catch {
      setNotice("Ship failed.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function confirmDeliveryCapture() {
    if (!activeOrder?.orderId || orderBusy) return;
    setOrderBusy(true);
    setNotice("Confirming delivery and capturing funds…");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(activeOrder.orderId)}/confirm-delivery`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        status?: string;
        captureId?: string;
        amount?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? `Capture failed (${response.status}).`);
        return;
      }
      setActiveOrder(current => current ? {
        ...current,
        status: payload.status ?? "CAPTURED",
        captureId: payload.captureId,
        amount: payload.amount ?? current.amount,
      } : current);
      setNotice("Delivery confirmed. Payment captured in sandbox.");
    } catch {
      setNotice("Capture failed.");
    } finally {
      setOrderBusy(false);
    }
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
            <p>
              Queue negotiation saves to Postgres and starts the real buyer/seller negotiate run in the API.
              PayPal authorize/capture stays manual and disconnected here. Local drafts remain session-only.
            </p>
          </div>

          <section className={s.metrics} aria-label="Workspace summary">
            {[
              { label: "Request drafts", value: String(drafts.length), detail: "In this browser session", icon: FileText, target: "Requests" as View },
              { label: "Negotiations", value: String(negotiations.length), detail: negotiationsError ? "API unreachable" : "Queued in database", icon: Sparkles, target: "Requests" as View },
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
                <span className={s.label}>
                  {composerMode === "compose" ? "START WITH A NEED" : "REVIEW BEFORE SAVING"}
                </span>
              </div>
              <h2 id="brief-title" ref={composerMode === "review" ? reviewHeadingRef : undefined} tabIndex={composerMode === "review" ? -1 : undefined}>
                {composerMode === "compose" ? "What are we sourcing?" : "Confirm this request draft"}
              </h2>
              <p className={s.description}>
                {composerMode === "compose"
                  ? "Set priority, quantity, budget, and deadline. Review before saving a local draft."
                  : "Edit anything that looks off. Saving keeps this draft in the browser only."}
              </p>

              {composerMode === "compose" ? (
                <form onSubmit={reviewDraft} className={s.briefForm} noValidate>
                  <label htmlFor={`${formId}-brief`}>Your procurement brief</label>
                  <textarea
                    ref={briefRef}
                    id={`${formId}-brief`}
                    maxLength={500}
                    value={fields.brief}
                    onChange={event => updateField("brief", event.target.value)}
                    placeholder="50 ergonomic chairs. Prefer durable mesh backs."
                    aria-invalid={Boolean(fieldErrors.brief)}
                    aria-describedby={fieldErrors.brief ? `${formId}-brief-error` : undefined}
                  />
                  {fieldErrors.brief && <p className={s.fieldError} id={`${formId}-brief-error`} role="alert">{fieldErrors.brief}</p>}

                  <fieldset className={s.priorityGroup} aria-describedby={fieldErrors.priority ? `${formId}-priority-error` : undefined}>
                    <legend>Sourcing priority</legend>
                    <div className={s.priorityOptions} role="radiogroup" aria-label="Sourcing priority">
                      {priorities.map(option => (
                        <label key={option.value} className={fields.priority === option.value ? s.prioritySelected : undefined}>
                          <input
                            type="radio"
                            name={`${formId}-priority`}
                            value={option.value}
                            checked={fields.priority === option.value}
                            onChange={() => updateField("priority", option.value)}
                          />
                          <strong>{option.label}</strong>
                          <span>{option.detail}</span>
                        </label>
                      ))}
                    </div>
                    {fieldErrors.priority && <p className={s.fieldError} id={`${formId}-priority-error`} role="alert">{fieldErrors.priority}</p>}
                  </fieldset>

                  <div className={s.fieldGrid}>
                    <div className={s.field}>
                      <label htmlFor={`${formId}-quantity`}>Quantity</label>
                      <input
                        id={`${formId}-quantity`}
                        inputMode="numeric"
                        value={fields.quantity}
                        onChange={event => updateField("quantity", event.target.value)}
                        placeholder="50"
                        aria-invalid={Boolean(fieldErrors.quantity)}
                        aria-describedby={fieldErrors.quantity ? `${formId}-quantity-error` : undefined}
                      />
                      {fieldErrors.quantity && <p className={s.fieldError} id={`${formId}-quantity-error`} role="alert">{fieldErrors.quantity}</p>}
                    </div>
                    <div className={s.field}>
                      <label htmlFor={`${formId}-budget`}>Max unit price</label>
                      <div className={s.budgetRow}>
                        <input
                          id={`${formId}-budget`}
                          inputMode="decimal"
                          value={fields.maxUnitPrice}
                          onChange={event => updateField("maxUnitPrice", event.target.value)}
                          placeholder="200.00"
                          aria-invalid={Boolean(fieldErrors.maxUnitPrice)}
                          aria-describedby={fieldErrors.maxUnitPrice ? `${formId}-budget-error` : undefined}
                        />
                        <label className={s.currencyField} htmlFor={`${formId}-currency`}>
                          <span className={s.srOnly}>Currency</span>
                          <select
                            id={`${formId}-currency`}
                            value={fields.currency}
                            onChange={event => updateField("currency", event.target.value as Currency)}
                            aria-invalid={Boolean(fieldErrors.currency)}
                          >
                            <option value="USD">USD</option>
                          </select>
                        </label>
                      </div>
                      {fieldErrors.maxUnitPrice && <p className={s.fieldError} id={`${formId}-budget-error`} role="alert">{fieldErrors.maxUnitPrice}</p>}
                      {fieldErrors.currency && <p className={s.fieldError} role="alert">{fieldErrors.currency}</p>}
                    </div>
                    <div className={s.field}>
                      <label htmlFor={`${formId}-deadline`}>Needed within (days)</label>
                      <input
                        id={`${formId}-deadline`}
                        inputMode="numeric"
                        value={fields.neededByDays}
                        onChange={event => updateField("neededByDays", event.target.value)}
                        placeholder="30"
                        aria-invalid={Boolean(fieldErrors.neededByDays)}
                        aria-describedby={fieldErrors.neededByDays ? `${formId}-deadline-error` : undefined}
                      />
                      {fieldErrors.neededByDays && <p className={s.fieldError} id={`${formId}-deadline-error`} role="alert">{fieldErrors.neededByDays}</p>}
                    </div>
                  </div>

                  <div className={s.formFooter}>
                    <small>{fields.brief.length}/500</small>
                    <button className={s.primary} type="submit">
                      Review draft <ArrowRight size={16} />
                    </button>
                  </div>
                </form>
              ) : pendingDraft && (
                <div className={s.reviewPanel}>
                  <dl className={s.summaryList}>
                    <div><dt>Brief</dt><dd>{pendingDraft.brief}</dd></div>
                    <div><dt>Priority</dt><dd>{priorityLabel(pendingDraft.priority)}</dd></div>
                    <div><dt>Quantity</dt><dd>{pendingDraft.quantity}</dd></div>
                    <div><dt>Max unit price</dt><dd>{money.format(pendingDraft.maxUnitPrice)} {pendingDraft.currency}</dd></div>
                    <div><dt>Needed within</dt><dd>{pendingDraft.neededByDays} days</dd></div>
                  </dl>
                  <p className={s.summaryNote}>
                    Save draft stays in this browser only. Queue negotiation persists the request and starts AI negotiation in the background — it still will not approve or pay.
                  </p>
                  <div className={s.reviewActions}>
                    <button
                      type="button"
                      className={s.secondary}
                      onClick={() => {
                        setComposerMode("compose");
                        setNotice("Edit the fields, then review again.");
                        requestAnimationFrame(() => briefRef.current?.focus());
                      }}
                    >
                      Edit request
                    </button>
                    <button type="button" className={s.secondary} onClick={saveDraft} disabled={queueBusy}>
                      Save draft
                    </button>
                    <button type="button" className={s.primary} onClick={() => void queueNegotiation()} disabled={queueBusy}>
                      {queueBusy ? "Queueing…" : "Queue negotiation"} <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {composerMode === "compose" && <div className={s.suggestions}>
                <span>Try a starting point</span>
                {examples.map(example => (
                  <button
                    key={example.brief}
                    type="button"
                    onClick={() => {
                      setFields(example);
                      setFieldErrors({});
                      setComposerMode("compose");
                      setPendingDraft(null);
                      setNotice("");
                      briefRef.current?.focus();
                    }}
                  >
                    <Plus size={13} />{example.brief}
                  </button>
                ))}
              </div>}
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

          {(view === "Overview" || view === "Requests") && <>
            <section className={s.card}>
              <div className={s.sectionHeader}>
                <div>
                  <h2>Queued negotiations</h2>
                  <p className={s.description}>Durable rows from Postgres. Workflow start is not connected yet.</p>
                </div>
                <button type="button" className={s.secondary} onClick={() => void loadNegotiations()}>Refresh</button>
              </div>
              {negotiationsError && <p className={s.fieldError} role="alert">{negotiationsError}</p>}
              {visibleNegotiations.length > 0 ? <ul className={s.draftList}>
                {visibleNegotiations.map(item => <li key={item.id}>
                  <div className={s.iconTile}><Sparkles size={19} /></div>
                  <details className={s.draftDetail}>
                    <summary>{item.brief}</summary>
                    <p>Priority: {priorityLabel(item.priority)} · Qty {item.quantity} · Max {money.format(item.maxUnitPrice)} {item.currency} · Within {item.neededByDays} days</p>
                    <p>Created {new Date(item.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.</p>
                    <p>Id {item.id}. Workflow run: {item.workflowRunId ?? "not started"}.</p>
                    <button
                      type="button"
                      className={s.textButton}
                      onClick={() => {
                        setActiveNegotiationId(item.id);
                        void loadNegotiationDetail(item.id).then(detail => {
                          if (detail) {
                            applyNegotiationResult(detail);
                            setView("Supplier offers");
                          }
                        });
                      }}
                    >
                      View offers <ArrowRight size={15} />
                    </button>
                    {(item.status === "QUEUED" || item.status === "FAILED") && (
                      <button
                        type="button"
                        className={s.textButton}
                        onClick={() => {
                          void fetch(`/api/negotiations/${encodeURIComponent(item.id)}/start`, { method: "POST" })
                            .then(async response => {
                              if (!response.ok) {
                                const payload = await response.json().catch(() => ({})) as { error?: string };
                                setNotice(payload.error ?? `Start failed (${response.status}).`);
                                return;
                              }
                              setActiveNegotiationId(item.id);
                              setNotice("Negotiation start accepted.");
                              await loadNegotiations();
                            });
                        }}
                      >
                        Start / retry <ArrowRight size={15} />
                      </button>
                    )}
                  </details>
                  <span className={s.draftBadge}>{item.status}</span>
                </li>)}
              </ul> : !negotiationsError && <div className={s.empty}>
                <span className={s.emptyIcon}><Sparkles size={25} /></span>
                <h3>{search ? "No matching negotiations" : "No queued negotiations yet"}</h3>
                <p>{search ? "Try a different search." : "Review a request and choose Queue negotiation to persist it."}</p>
              </div>}
            </section>

            <section className={s.card}>
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
                    <p>Priority: {priorityLabel(draft.priority)} · Qty {draft.quantity} · Max {money.format(draft.maxUnitPrice)} {draft.currency} · Within {draft.neededByDays} days</p>
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
            </section>
          </>}

          {view === "Supplier offers" && <section className={s.card}>
            <div className={s.sectionHeader}>
              <div>
                <h2>Compare with confidence</h2>
                <p className={s.description}>{offersNote}</p>
              </div>
              <div className={s.tableActions}>
                <button type="button" className={s.secondary} onClick={() => void loadNegotiations()}>Refresh</button>
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
            <p className={s.tableNote}>
              AG Grid Community · Rows come from persisted negotiation rankings only.
              {activeNegotiationId ? ` Active id: ${activeNegotiationId}` : ""}
            </p>
            {offers.length > 0 && activeNegotiationId && (
              <div className={s.reviewActions}>
                <button type="button" className={s.primary} disabled={orderBusy} onClick={() => void startCheckout()}>
                  {orderBusy ? "Working…" : "Checkout winning offer"} <ArrowRight size={16} />
                </button>
              </div>
            )}
          </section>}

          {(view === "Overview" || view === "Payments & orders") && <section className={`${s.card} ${s.paymentCard}`}>
            <div className={s.sectionHeader}>
              <div className={s.inlineTitle}><span className={s.paymentIcon}><CreditCard size={22} /></span><div><h2>Payments, with clear checkpoints</h2><p className={s.description}>Sandbox PayPal authorize → ship → owner confirms → capture.</p></div></div>
              <span className={s.pending}>{activeOrder?.status ?? "No order yet"}</span>
            </div>
            <p className={s.flowCaption}>Live sandbox lifecycle · AI never captures by itself</p>
            <ol className={s.paymentFlow}>
              {[
                { title: "Owner approval", detail: "Checkout issues mandate + PayPal order", active: Boolean(activeOrder) },
                { title: "Funds held", detail: "Authorized, not captured", active: activeOrder?.status === "HELD" || activeOrder?.status === "SHIPPED" || activeOrder?.status === "CAPTURED" },
                { title: "Seller ships", detail: "Carrier and tracking recorded", active: activeOrder?.status === "SHIPPED" || activeOrder?.status === "CAPTURED" },
                { title: "Owner confirms", detail: "Capture after delivery", active: activeOrder?.status === "CAPTURED" },
              ].map((step, index) => <li key={step.title}>
                <span className={s.stepNumber}>{index + 1}</span>
                <div><strong>{step.title}</strong><small>{step.detail}{step.active ? " · done/current" : ""}</small></div>
              </li>)}
            </ol>
            {view === "Payments & orders" && !activeOrder && <div className={s.empty}>
              <span className={s.emptyIcon}><Package size={26} /></span><h3>No order yet</h3>
              <p>Finish a negotiation, open Supplier offers, then Checkout winning offer.</p>
            </div>}
            {view === "Payments & orders" && activeOrder && (
              <div className={s.reviewPanel}>
                <dl className={s.summaryList}>
                  <div><dt>Order</dt><dd>{activeOrder.orderId}</dd></div>
                  <div><dt>Status</dt><dd>{activeOrder.status}</dd></div>
                  {activeOrder.amount && <div><dt>Amount</dt><dd>${activeOrder.amount} USD</dd></div>}
                  {activeOrder.supplierId && <div><dt>Supplier</dt><dd>{activeOrder.supplierId}</dd></div>}
                  {activeOrder.authorizationId && <div><dt>Authorization</dt><dd>{activeOrder.authorizationId}</dd></div>}
                  {activeOrder.tracking && <div><dt>Tracking</dt><dd>{activeOrder.tracking.carrier} {activeOrder.tracking.number}</dd></div>}
                  {activeOrder.captureId && <div><dt>Capture</dt><dd>{activeOrder.captureId}</dd></div>}
                </dl>
                {activeOrder.approveUrl && activeOrder.status === "APPROVED" && (
                  <p className={s.summaryNote}>
                    Approve as sandbox buyer:{" "}
                    <a href={activeOrder.approveUrl} target="_blank" rel="noreferrer">{activeOrder.approveUrl}</a>
                  </p>
                )}
                <div className={s.reviewActions}>
                  {activeOrder.status === "APPROVED" && (
                    <button type="button" className={s.primary} disabled={orderBusy} onClick={() => void authorizeHold()}>
                      Authorize hold
                    </button>
                  )}
                  {activeOrder.status === "HELD" && (
                    <button type="button" className={s.primary} disabled={orderBusy} onClick={() => void markOrderShipped()}>
                      Mark shipped
                    </button>
                  )}
                  {activeOrder.status === "SHIPPED" && (
                    <button type="button" className={s.primary} disabled={orderBusy} onClick={() => void confirmDeliveryCapture()}>
                      Confirm delivery & capture
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className={s.paymentFoot}><ShieldCheck size={16} /><span>AI recommendations do not authorize or capture payments.</span></div>
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
