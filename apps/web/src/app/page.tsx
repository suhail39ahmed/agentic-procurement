"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight, ArrowUpRight, Bot, Check, ChevronRight,
  CreditCard, FileText, Layers3, LayoutDashboard,
  Maximize2, Menu, Minimize2, Package, Plus,
  RefreshCw, Search, Send, ShieldCheck, Sparkles, Wallet, X,
} from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule, ModuleRegistry, themeQuartz,
  type ColDef,
  type GridApi,
} from "ag-grid-community";
import s from "./dashboard.module.css";
import Link from "next/link";
import { StretchPanel } from "./StretchPanel";
import { PayablesPanel } from "./PayablesPanel";
import { DisputePanel } from "./DisputePanel";
import { SponsorsPanel } from "./SponsorsPanel";

ModuleRegistry.registerModules([AllCommunityModule]);

type View = "Overview" | "Requests" | "Supplier offers" | "Payments & orders" | "Automation" | "Payables";
type Priority = "price" | "speed" | "balanced";
type Currency = "USD" | "SGD" | "INR";
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
  hasCheckout?: boolean;
  paymentStatus?: string | null;
};

type StreamLine = {
  id: string;
  text: string;
};

type FieldErrors = Partial<Record<keyof RequestFields, string>>;

type Offer = {
  supplier: string;
  unitPrice: number;
  leadTimeDays: number;
  score: number;
  withinBudget: boolean;
  meetsDeadline: boolean;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function offersFromResult(result: unknown): Offer[] {
  if (!result || typeof result !== "object") return [];
  const ranking = (result as { ranking?: unknown }).ranking;
  if (!Array.isArray(ranking)) return [];
  return ranking.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as {
      score?: unknown;
      withinBudget?: unknown;
      meetsDeadline?: unknown;
      offer?: { from?: unknown; unitPrice?: unknown; leadTimeDays?: unknown };
    };
    if (!row.offer || typeof row.offer !== "object") return [];
    const supplier = typeof row.offer.from === "string" ? row.offer.from : null;
    const unitPrice = typeof row.offer.unitPrice === "number" ? row.offer.unitPrice : null;
    const leadTimeDays = typeof row.offer.leadTimeDays === "number" ? row.offer.leadTimeDays : null;
    const score = typeof row.score === "number" ? row.score : 0;
    if (!supplier || unitPrice === null || leadTimeDays === null) return [];
    return [{
      supplier,
      unitPrice,
      leadTimeDays,
      score: Math.round(score * 1000) / 1000,
      withinBudget: row.withinBudget === true,
      meetsDeadline: row.meetsDeadline === true,
    }];
  });
}

function checkoutFromResult(result: unknown): {
  orderId: string;
  approveUrl?: string;
  amount?: string;
  supplierId?: string;
} | null {
  if (!result || typeof result !== "object") return null;
  const checkout = (result as { checkout?: unknown }).checkout;
  if (!checkout || typeof checkout !== "object") return null;
  const c = checkout as Partial<{
    orderId: string;
    approveUrl: string;
    amount: string;
    supplierId: string;
  }>;
  if (!c.orderId) return null;
  return {
    orderId: c.orderId,
    approveUrl: c.approveUrl,
    amount: c.amount,
    supplierId: c.supplierId,
  };
}

const navigation = [
  { name: "Overview" as const, icon: LayoutDashboard },
  { name: "Requests" as const, icon: FileText },
  { name: "Supplier offers" as const, icon: Layers3 },
  { name: "Payments & orders" as const, icon: CreditCard },
  { name: "Payables" as const, icon: Wallet },
  { name: "Automation" as const, icon: RefreshCw },
];

const priorities: { value: Priority; label: string; detail: string }[] = [
  { value: "price", label: "Lowest cost", detail: "Prefer stronger unit price" },
  { value: "speed", label: "Fastest delivery", detail: "Prefer shorter lead time" },
  { value: "balanced", label: "Balanced", detail: "Trade off price and speed" },
];

const examples: RequestFields[] = [
  {
    brief: "1 demo micro pack for sandbox smoke (≤$2). Prefer durable packaging.",
    priority: "price",
    quantity: "1",
    maxUnitPrice: "2.00",
    currency: "USD",
    neededByDays: "14",
  },
  {
    brief: "1 express mini pack — speed priority, sandbox demo budget.",
    priority: "speed",
    quantity: "1",
    maxUnitPrice: "1.95",
    currency: "USD",
    neededByDays: "7",
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
  { field: "supplier", headerName: "Supplier", minWidth: 160 },
  {
    field: "unitPrice", headerName: "Unit price", minWidth: 130,
    valueFormatter: ({ value }) =>
      typeof value === "number" ? money.format(value) : "—",
  },
  { field: "leadTimeDays", headerName: "Delivery · days", minWidth: 140 },
  {
    field: "score", headerName: "Match score", minWidth: 120,
    valueFormatter: ({ value }) =>
      typeof value === "number" ? value.toFixed(3) : "—",
  },
  {
    headerName: "Eligible",
    minWidth: 120,
    valueGetter: ({ data }) =>
      data?.withinBudget && data?.meetsDeadline ? "Yes" : "No",
  },
];

type FeedRow = {
  id: string;
  brief: string;
  status: string;
  priority: string;
  quantity: number;
  maxUnitPrice: number;
  payment: string;
};

const feedColumns: ColDef<FeedRow>[] = [
  { field: "brief", headerName: "Request", flex: 2, minWidth: 220 },
  { field: "status", headerName: "Negotiation", minWidth: 130 },
  { field: "payment", headerName: "Payment", minWidth: 120 },
  { field: "priority", headerName: "Priority", minWidth: 110 },
  { field: "quantity", headerName: "Qty", minWidth: 80 },
  {
    field: "maxUnitPrice", headerName: "Max unit", minWidth: 120,
    valueFormatter: ({ value }) =>
      typeof value === "number" ? money.format(value) : "—",
  },
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

function syncGridRows<T extends { id?: string; supplier?: string }>(
  api: GridApi<T> | undefined,
  rows: T[],
  keyOf: (row: T) => string,
) {
  if (!api) return;
  const nextByKey = new Map(rows.map((row) => [keyOf(row), row]));
  const remove: T[] = [];
  const update: T[] = [];
  const seen = new Set<string>();
  api.forEachNode((node) => {
    const data = node.data;
    if (!data) return;
    const key = keyOf(data);
    const next = nextByKey.get(key);
    if (!next) {
      remove.push(data);
      return;
    }
    seen.add(key);
    update.push(next);
  });
  const add = rows.filter((row) => !seen.has(keyOf(row)));
  api.applyTransaction({ add, update, remove });
}

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

  if (fields.currency !== "USD" && fields.currency !== "SGD" && fields.currency !== "INR") {
    errors.currency = "Choose USD, SGD, or INR.";
  }

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
      currency: fields.currency,
      neededByDays,
    },
  };
}

function readPaypalReturnBoot(): { view: View; notice: string; clearQuery: boolean } {
  if (typeof window === "undefined") {
    return { view: "Overview", notice: "", clearQuery: false };
  }
  const paypal = new URLSearchParams(window.location.search).get("paypal");
  if (paypal === "approved") {
    return {
      view: "Payments & orders",
      notice: "PayPal sandbox buyer approved. Click Authorize hold to place funds on hold.",
      clearQuery: true,
    };
  }
  if (paypal === "cancelled") {
    return {
      view: "Payments & orders",
      notice: "PayPal checkout was cancelled. Re-open the approve link to try again.",
      clearQuery: true,
    };
  }
  return { view: "Overview", notice: "", clearQuery: false };
}

export default function Dashboard() {
  const [paypalBoot] = useState(readPaypalReturnBoot);
  const [view, setView] = useState<View>(paypalBoot.view);
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
  const [notice, setNotice] = useState(paypalBoot.notice);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState("");
  const [streamLines, setStreamLines] = useState<StreamLine[]>([]);
  const [streamStatus, setStreamStatus] = useState("");
  const [boundStreamKey, setBoundStreamKey] = useState("");
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const offersGridApi = useRef<GridApi<Offer> | undefined>(undefined);
  const feedGridApi = useRef<GridApi<FeedRow> | undefined>(undefined);
  const eventSourceRef = useRef<EventSource | null>(null);
  const formId = useId();
  const eligibleOffers = useMemo(
    () => offers.filter((offer) => offer.withinBudget && offer.meetsDeadline),
    [offers],
  );
  const heldCount = activeOrder?.status === "HELD" || activeOrder?.status === "SHIPPED" ? 1 : 0;
  const capturedCount = activeOrder?.status === "CAPTURED" ? 1 : 0;
  const activeNegotiation = negotiations.find((item) => item.id === activeNegotiationId) ?? null;
  const succeededNegotiations = negotiations.filter((item) => item.status === "SUCCEEDED");
  const feedRows = useMemo<FeedRow[]>(() => {
    return negotiations.map((item) => {
      const payment = item.id === activeNegotiationId && activeOrder
        ? activeOrder.status
        : item.paymentStatus
          ?? (item.hasCheckout ? "APPROVED" : "—");
      return {
        id: item.id,
        brief: item.brief,
        status: item.status,
        priority: priorityLabel(item.priority),
        quantity: item.quantity,
        maxUnitPrice: item.maxUnitPrice,
        payment,
      };
    });
  }, [negotiations, activeNegotiationId, activeOrder]);
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

  async function hydrateOrder(
    orderId: string,
    fallback?: { approveUrl?: string; amount?: string; supplierId?: string },
  ) {
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
      if (!response.ok) {
        setActiveOrder({
          orderId,
          status: "APPROVED",
          approveUrl: fallback?.approveUrl,
          amount: fallback?.amount,
          supplierId: fallback?.supplierId,
        });
        return;
      }
      const payload = await response.json() as {
        id?: string;
        status?: string;
        approveUrl?: string | null;
        amount?: number | string;
        supplierId?: string;
        authorizationId?: string;
        captureId?: string;
        tracking?: { carrier: string; number: string };
      };
      setActiveOrder({
        orderId: payload.id ?? orderId,
        status: payload.status ?? "APPROVED",
        approveUrl: payload.approveUrl ?? fallback?.approveUrl,
        amount: payload.amount != null ? String(payload.amount) : fallback?.amount,
        supplierId: payload.supplierId ?? fallback?.supplierId,
        authorizationId: payload.authorizationId,
        captureId: payload.captureId,
        tracking: payload.tracking,
      });
    } catch {
      setActiveOrder({
        orderId,
        status: "APPROVED",
        approveUrl: fallback?.approveUrl,
        amount: fallback?.amount,
        supplierId: fallback?.supplierId,
      });
    }
  }

  function applyNegotiationResult(detail: NegotiationRecord) {
    activeIdRef.current = detail.id;
    setActiveNegotiationId(detail.id);
    if (detail.status === "SUCCEEDED") {
      const nextOffers = offersFromResult(detail.result);
      const eligible = nextOffers.filter((offer) => offer.withinBudget && offer.meetsDeadline);
      setOffers(nextOffers);
      setOffersNote(
        nextOffers.length === 0
          ? "Negotiation finished, but no ranking was returned."
          : eligible.length > 0
            ? `Live ranking for ${detail.id.slice(0, 8)}… · ${eligible.length} eligible winner(s).`
            : `Live ranking for ${detail.id.slice(0, 8)}… · no offer meets budget and deadline, so checkout is blocked.`,
      );
      const saved = checkoutFromResult(detail.result);
      if (saved) {
        void hydrateOrder(saved.orderId, saved);
      }
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
        ?? items.find(item => item.status === "RUNNING")?.id
        ?? items.find(item => item.status === "SUCCEEDED")?.id
        ?? items.find(item => item.status === "QUEUED")?.id
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
    void loadNegotiations();
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  useEffect(() => {
    void loadNegotiations();
    if (paypalBoot.clearQuery) {
      window.history.replaceState({}, "", "/");
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      eventSourceRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncGridRows(offersGridApi.current, offers, (row) => row.supplier);
  }, [offers]);

  useEffect(() => {
    syncGridRows(feedGridApi.current, feedRows, (row) => row.id);
  }, [feedRows]);

  const activeStreamStatus = activeNegotiation?.status;
  const streamSessionKey = `${activeNegotiationId ?? ""}:${activeStreamStatus ?? ""}`;
  if (boundStreamKey !== streamSessionKey) {
    setBoundStreamKey(streamSessionKey);
    setStreamLines([]);
    setStreamStatus(
      activeStreamStatus === "QUEUED"
        || activeStreamStatus === "RUNNING"
        || activeStreamStatus === "SUCCEEDED"
        ? activeStreamStatus
        : "",
    );
  }

  useEffect(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (!activeNegotiationId) return;
    if (activeStreamStatus !== "QUEUED" && activeStreamStatus !== "RUNNING" && activeStreamStatus !== "SUCCEEDED") {
      return;
    }
    const source = new EventSource(`/api/negotiations/${encodeURIComponent(activeNegotiationId)}/events`);
    eventSourceRef.current = source;
    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as {
          type?: string;
          status?: string;
          event?: {
            round?: number;
            message?: {
              type?: string;
              from?: string;
              to?: string;
              unitPrice?: number;
              leadTimeDays?: number;
              targetUnitPrice?: number;
              reason?: string;
              message?: string;
            };
          };
        };
        if (payload.type === "status" && payload.status) {
          setStreamStatus(payload.status);
          return;
        }
        if (payload.type === "done") {
          setStreamStatus(payload.status ?? "done");
          source.close();
          void loadNegotiations();
          return;
        }
        if (payload.type === "event" && payload.event?.message) {
          const m = payload.event.message;
          let text = `R${payload.event.round ?? "?"} `;
          if (m.type === "OFFER") {
            text += `${m.from ?? "seller"} OFFER $${Number(m.unitPrice ?? 0).toFixed(2)} / ${m.leadTimeDays ?? "?"}d`;
          } else if (m.type === "COUNTER") {
            text += `buyer → ${m.to ?? "seller"} COUNTER $${Number(m.targetUnitPrice ?? 0).toFixed(2)}`;
          } else if (m.type === "REJECT") {
            text += `${m.from ?? "seller"} REJECT ${m.reason ?? ""}`;
          } else {
            text += `${m.type ?? "message"}`;
          }
          setStreamLines((current) => [...current, { id: crypto.randomUUID(), text }]);
        }
      } catch {
        // ignore malformed SSE chunks
      }
    };
    source.onerror = () => {
      setStreamStatus((current) => current === "SUCCEEDED" || current === "FAILED" ? current : "reconnecting…");
    };
    return () => {
      source.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNegotiationId, activeStreamStatus]);

  async function sendAssistantMessage(event?: FormEvent) {
    event?.preventDefault();
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatBusy(true);
    setChatError("");
    setChatInput("");
    const nextHistory = [...chatMessages, { role: "user" as const, content: message }];
    setChatMessages(nextHistory);
    try {
      const context = [
        activeNegotiationId ? `Active negotiation: ${activeNegotiationId}` : "",
        offers.length
          ? `Offers: ${offers.map((o) => `${o.supplier} $${o.unitPrice}/${o.leadTimeDays}d score=${o.score} eligible=${o.withinBudget && o.meetsDeadline}`).join("; ")}`
          : "",
        activeOrder ? `Active order ${activeOrder.orderId} status ${activeOrder.status}` : "",
      ].filter(Boolean).join("\n");
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history: nextHistory.slice(0, -1), context }),
      });
      const payload = await response.json().catch(() => ({})) as { reply?: string; error?: string };
      if (!response.ok || !payload.reply) {
        setChatError(payload.error ?? `Assistant failed (${response.status}).`);
        return;
      }
      setChatMessages((current) => [...current, { role: "assistant", content: payload.reply! }]);
    } catch {
      setChatError("Assistant unreachable. Is the API running with Azure AI env vars?");
    } finally {
      setChatBusy(false);
    }
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

  function loadDemoRequest() {
    const demo = examples[0];
    setView("Overview");
    setMobileOpen(false);
    setFields(demo);
    setFieldErrors({});
    setComposerMode("compose");
    setPendingDraft(null);
    setNotice("Demo request loaded. Review draft, then Queue negotiation to run buyer/seller agents.");
    requestAnimationFrame(() => briefRef.current?.focus());
  }

  async function seedDemoWorkspace() {
    if (queueBusy) return;
    const demo = examples[0];
    const validated = validateFields(demo);
    if (!validated.draft) {
      setNotice("Demo seed failed validation.");
      return;
    }
    setView("Overview");
    setMobileOpen(false);
    setFields(demo);
    setPendingDraft(validated.draft);
    setComposerMode("review");
    setFieldErrors({});
    setStreamLines([]);
    setNotice("Seeding demo: queueing ≤$2 micro-pack negotiation…");
    setQueueBusy(true);
    try {
      const response = await fetch("/api/negotiations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brief: validated.draft.brief,
          priority: validated.draft.priority,
          quantity: validated.draft.quantity,
          maxUnitPrice: validated.draft.maxUnitPrice.toFixed(2),
          currency: validated.draft.currency,
          neededByDays: validated.draft.neededByDays,
          idempotencyKey: `demo-seed-${crypto.randomUUID()}`,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        id?: string;
        status?: string;
        error?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? `Demo seed failed (${response.status}).`);
        return;
      }
      if (payload.id) {
        activeIdRef.current = payload.id;
        setActiveNegotiationId(payload.id);
      }
      await loadNegotiations();
      resetComposer();
      setView("Supplier offers");
      setNotice("Demo seeded. Watch the live negotiation feed while offers fill in.");
    } catch {
      setNotice("Demo seed failed. Is the API reachable?");
    } finally {
      setQueueBusy(false);
    }
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
    if (eligibleOffers.length === 0) {
      setNotice("Checkout blocked: no supplier meets both budget and deadline. Raise max unit price or needed-by days, then re-queue.");
      return;
    }
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
      setNotice("Checkout created. Open the PayPal approve link as the sandbox buyer, finish Pay Now, then Authorize hold.");
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
              <p className={s.eyebrow}>PROCUREAI · AGENTIC BUYING WORKSPACE</p>
              <h1 ref={headingRef} tabIndex={-1}>
                {view === "Overview" ? <>Better buying.<br /><span>Clearer decisions.</span></>
                  : view === "Automation" ? <>Automation that<br /><span>stays under control.</span></>
                  : view === "Payables" ? <>Invoices in.<br /><span>Payouts out.</span></>
                  : view === "Supplier offers" ? <>Live offers.<br /><span>Ranked in AG Grid.</span></>
                  : view === "Payments & orders" ? <>PayPal holds.<br /><span>You capture.</span></>
                  : view === "Requests" ? <>Every request.<br /><span>One trail.</span></>
                  : view}
              </h1>
              <p className={s.subtitle}>
                {view === "Automation"
                  ? "Replenishment, FX, Slack, forecasts, sponsors — stretch + partner tools."
                  : view === "Payables"
                    ? "Extract supplier invoices, three-way match, payout, client invoice, disputes. Demo amounts ≤ $2."
                    : "Marketplace negotiate → approve → authorize → capture. Payables extend the same control plane."}
              </p>
            </div>
            <div className={s.reviewActions}>
              <button
                type="button"
                className={s.secondary}
                title="Fill the composer with the ≤$2 micro-pack demo brief"
                onClick={loadDemoRequest}
              >
                Load demo request
              </button>
              <button
                type="button"
                className={s.secondary}
                title="Queue a live ≤$2 micro-pack negotiation in one click"
                onClick={() => void seedDemoWorkspace()}
                disabled={queueBusy}
              >
                {queueBusy ? "Seeding…" : "Seed demo (1 click)"}
              </button>
              <button
                className={s.primary}
                title="Start a new sourcing brief on the Overview composer"
                onClick={newRequest}
              >
                <Plus size={18} /> New request
              </button>
            </div>
          </section>

          <div className={s.stackStrip} aria-label="Built with">
            <span className={s.stackLabel}>Core</span>
            <span className={`${s.stackLogo} ${s.stackLogoCore}`} title="PayPal sandbox Orders AUTHORIZE + Agent Toolkit/MCP">PayPal</span>
            <span className={`${s.stackLogo} ${s.stackLogoCore}`} title="Hosted on Render · Workflows SDK">Render</span>
            <span className={`${s.stackLogo} ${s.stackLogoCore}`} title="AG Grid Community · live applyTransaction + SSE">AG Grid</span>
            <span className={`${s.stackLogo} ${s.stackLogoCore}`} title="Postman collection in docs/postman">Postman</span>
            <span className={s.stackLabel}>Partners</span>
            <span className={s.stackLogo} title="Channel3 catalog enrich (set CHANNEL3_API_KEY)">Channel3</span>
            <span className={s.stackLogo} title="Bryntum-category schedule timeline">Bryntum</span>
            <span className={s.stackLogo} title="KERNEL page fetch for invoices">KERNEL</span>
            <span className={s.stackLogo} title="OpenAPI → APIMatic DX">APIMatic</span>
            <span className={s.stackLogo} title="Astropods-style agent registry">Astropods</span>
          </div>

          <div className={s.previewNotice}>
            <ShieldCheck size={17} />
            <p>
              Dual track: <strong>Negotiate</strong> (marketplace) and <strong>Payables</strong> (invoices/payouts).
              Demo spend capped at <strong>$2</strong>. Use Seed demo or open Payables for the judge path.
            </p>
          </div>

          {view === "Overview" && (
            <section className={s.trackLaunch} aria-label="Choose a demo track">
              <button
                type="button"
                className={s.trackCard}
                onClick={() => void seedDemoWorkspace()}
                disabled={queueBusy}
                title="Queue a ≤$2 micro-pack negotiation"
              >
                <span className={s.iconTile}><Sparkles size={20} /></span>
                <h3>1 · Agent marketplace</h3>
                <p>Buyer AI negotiates with seller AIs, ranks offers in AG Grid, then PayPal authorize → capture.</p>
                <ul className={s.trackSteps}>
                  <li>Seed or compose a ≤$2 request</li>
                  <li>Watch live SSE + Supplier offers</li>
                  <li>Checkout → approve → authorize → ship → capture</li>
                </ul>
                <span className={s.trackCta}>{queueBusy ? "Seeding…" : "Start negotiation demo"} <ArrowRight size={14} /></span>
              </button>
              <button
                type="button"
                className={s.trackCard}
                onClick={() => navigate("Payables")}
                title="Open invoice extract, match, payout, client invoice"
              >
                <span className={s.iconTile}><Wallet size={20} /></span>
                <h3>2 · Payables agent</h3>
                <p>Read supplier invoices, three-way match, payout suppliers, invoice clients, handle disputes.</p>
                <ul className={s.trackSteps}>
                  <li>Extract the $1.50 sample invoice</li>
                  <li>Match PO + receipt → payout</li>
                  <li>Create client invoice + simulate dispute</li>
                </ul>
                <span className={s.trackCta}>Open Payables <ArrowRight size={14} /></span>
              </button>
            </section>
          )}

          <section className={s.metrics} aria-label="Workspace summary">
            {[
              { label: "Negotiations", value: String(negotiations.length), detail: negotiationsError ? "API unreachable" : "Marketplace track", icon: Sparkles, target: "Requests" as View },
              { label: "Funds on hold", value: String(heldCount), detail: heldCount ? "Authorized, not captured" : "After PayPal approve", icon: ShieldCheck, target: "Payments & orders" as View },
              { label: "Captured", value: String(capturedCount), detail: capturedCount ? "Owner confirmed delivery" : "Confirm after ship", icon: CreditCard, target: "Payments & orders" as View },
              { label: "Payables", value: "AP", detail: "Extract · match · payout", icon: Wallet, target: "Payables" as View },
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
                            <option value="SGD">SGD</option>
                            <option value="INR">INR</option>
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
                    <button
                      type="button"
                      className={s.primary}
                      title="Persist to Postgres and start buyer/seller agents (does not approve or pay)"
                      onClick={() => void queueNegotiation()}
                      disabled={queueBusy}
                    >
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
                <span className={s.pending}>{chatBusy ? "Thinking…" : "Connected"}</span>
              </div>
              <div className={s.assistantBody}>
                {chatMessages.length === 0 ? (
                  <>
                    <div className={s.orb}><Bot size={31} /></div>
                    <h3>Less back-and-forth.<br />More informed decisions.</h3>
                    <p>Ask about briefs, supplier trade-offs, or the authorize → capture payment path.</p>
                    <div className={s.assistantSteps}>
                      {["Review your requirements", "Compare negotiated offers", "Approve on your terms"].map(text =>
                        <div key={text}><Check size={13} /><span>{text}</span></div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className={s.chatLog} aria-live="polite">
                    {chatMessages.map((turn, index) => (
                      <div key={`${turn.role}-${index}`} className={turn.role === "user" ? s.chatUser : s.chatBot}>
                        <strong>{turn.role === "user" ? "You" : "Assistant"}</strong>
                        <p>{turn.content}</p>
                      </div>
                    ))}
                  </div>
                )}
                {chatError && <p className={s.fieldError} role="alert">{chatError}</p>}
              </div>
              <form className={s.chatBar} onSubmit={(event) => void sendAssistantMessage(event)}>
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  disabled={chatBusy}
                  aria-label="Message the buying assistant"
                  placeholder={chatBusy ? "Assistant is replying…" : "Ask about budget, suppliers, or payments"}
                />
                <button type="submit" disabled={chatBusy || !chatInput.trim()} aria-label="Send assistant message">
                  <Send size={17} />
                </button>
              </form>
            </section>
          </div>}

          {(view === "Overview" || view === "Requests") && <>
            <section className={s.card}>
              <div className={s.sectionHeader}>
                <div>
                  <h2>Negotiation feed</h2>
                  <p className={s.description}>Live AG Grid rows via applyTransaction — status, payment, priority.</p>
                </div>
                <button type="button" className={s.secondary} onClick={() => void loadNegotiations()}>Refresh</button>
              </div>
              <div className={s.grid}>
                <AgGridReact<FeedRow>
                  theme={gridTheme}
                  columnDefs={feedColumns}
                  defaultColDef={{ flex: 1, sortable: true, filter: true, resizable: true }}
                  onGridReady={(event) => {
                    feedGridApi.current = event.api;
                    syncGridRows(event.api, feedRows, (row) => row.id);
                  }}
                  getRowId={(params) => params.data.id}
                  overlayNoRowsTemplate="<span>No negotiations yet. Seed demo or queue a request.</span>"
                />
              </div>
            </section>

            <section className={s.card}>
              <div className={s.sectionHeader}>
                <div>
                  <h2>Queued negotiations</h2>
                  <p className={s.description}>Durable rows from Postgres. Queue starts the negotiate run automatically.</p>
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
            <div className={s.reviewPanel}>
              <label className={s.field}>
                <span>Negotiation shown in this table</span>
                <select
                  aria-label="Select negotiation for supplier offers"
                  value={activeNegotiationId ?? ""}
                  onChange={(event) => {
                    const id = event.target.value;
                    if (!id) return;
                    setActiveNegotiationId(id);
                    activeIdRef.current = id;
                    void loadNegotiationDetail(id).then((detail) => {
                      if (detail) applyNegotiationResult(detail);
                    });
                  }}
                >
                  <option value="" disabled>Select a succeeded negotiation</option>
                  {succeededNegotiations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.brief.slice(0, 72)}{item.brief.length > 72 ? "…" : ""} · {item.status}
                    </option>
                  ))}
                </select>
              </label>
              {activeNegotiation && (
                <dl className={s.summaryList}>
                  <div><dt>Brief</dt><dd>{activeNegotiation.brief}</dd></div>
                  <div><dt>Status</dt><dd>{activeNegotiation.status}</dd></div>
                  <div><dt>Budget</dt><dd>Qty {activeNegotiation.quantity} · max {money.format(activeNegotiation.maxUnitPrice)} · within {activeNegotiation.neededByDays}d</dd></div>
                  <div><dt>Id</dt><dd>{activeNegotiation.id}</dd></div>
                </dl>
              )}
            </div>
            <div className={`${s.grid} ${expanded ? s.gridExpanded : ""}`}>
              <AgGridReact<Offer>
                theme={gridTheme}
                columnDefs={columns}
                defaultColDef={{ flex: 1, sortable: true, filter: true, resizable: true }}
                quickFilterText={offerSearch}
                onGridReady={(event) => {
                  offersGridApi.current = event.api;
                  syncGridRows(event.api, offers, (row) => row.supplier);
                }}
                getRowId={(params) => params.data.supplier}
                overlayNoRowsTemplate="<span>No connected supplier offers yet.</span>"
              />
            </div>
            <div className={s.reviewPanel} aria-live="polite">
              <div className={s.sectionHeader}>
                <div>
                  <h3>Live negotiation stream (SSE)</h3>
                  <p className={s.description}>
                    {streamStatus
                      ? `Status: ${streamStatus}`
                      : "Select or queue a negotiation to stream seller messages."}
                  </p>
                </div>
              </div>
              {streamLines.length > 0 ? (
                <div className={s.chatLog}>
                  {streamLines.map((line) => (
                    <div key={line.id} className={s.chatBot}>
                      <p>{line.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={s.tableNote}>Waiting for buyer/seller messages…</p>
              )}
            </div>
            <p className={s.tableNote}>
              AG Grid Community · applyTransaction updates · ranking from the selected negotiation.
              {eligibleOffers.length > 0
                ? ` Winning eligible offer: ${eligibleOffers[0].supplier} at ${money.format(eligibleOffers[0].unitPrice)}.`
                : " Checkout needs at least one eligible offer (budget + deadline)."}
            </p>
            <p className={s.status} role="status">{notice}</p>
            {offers.length > 0 && activeNegotiationId && (
              <div className={s.reviewActions}>
                <button
                  type="button"
                  className={s.primary}
                  disabled={orderBusy || eligibleOffers.length === 0}
                  onClick={() => void startCheckout()}
                  title={eligibleOffers.length === 0 ? "No offer meets budget and deadline — adjust the brief or wait for better quotes" : "Create a PayPal AUTHORIZE order for the winning eligible offer"}
                >
                  {orderBusy ? "Working…" : eligibleOffers.length === 0 ? "No eligible winner" : "Checkout winning offer"} <ArrowRight size={16} />
                </button>
              </div>
            )}
          </section>}

          {view === "Automation" && (
            <>
              <StretchPanel setNotice={setNotice} />
              <SponsorsPanel
                setNotice={setNotice}
                onChannel3Suggestion={(fields) => {
                  setFields({
                    brief: fields.brief,
                    priority: fields.priority,
                    quantity: fields.quantity,
                    maxUnitPrice: fields.maxUnitPrice,
                    currency: fields.currency,
                    neededByDays: fields.neededByDays,
                  });
                  setComposerMode("compose");
                  setNotice("Channel3 suggestion loaded into the Overview composer (≤$2).");
                }}
              />
            </>
          )}

          {view === "Payables" && (
            <PayablesPanel setNotice={setNotice} />
          )}

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
                    Step 1 — open this link as the sandbox buyer and click Complete Purchase:{" "}
                    <a href={activeOrder.approveUrl} target="_blank" rel="noreferrer">Approve on PayPal</a>
                    . Step 2 — return here and click Authorize hold (it fails until PayPal approval finishes).
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
            {view === "Payments & orders" && (
              <DisputePanel notice={notice} setNotice={setNotice} />
            )}
            <div className={s.paymentFoot}><ShieldCheck size={16} /><span>AI recommendations do not authorize or capture payments.</span></div>
          </section>}

          <footer className={s.footer}>
            <span>ProcureAI · PayPal · Render · AG Grid · Channel3 · Bryntum · KERNEL · APIMatic · Astropods</span>
            <span>Sandbox only · Not an official PayPal product</span>
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
