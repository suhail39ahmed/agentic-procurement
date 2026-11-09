"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight, ArrowUpRight, Bot, Check, ChevronDown, ChevronRight,
  CreditCard, FileText, Layers3, LayoutDashboard, LogOut,
  Maximize2, Menu, Minimize2, Package, PackageSearch, Plus,
  RefreshCw, Search, Send, ShieldCheck, Sparkles, UserRound, Wallet, X,
} from "lucide-react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule, ModuleRegistry, themeQuartz,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
} from "ag-grid-community";
import s from "./dashboard.module.css";
import Link from "next/link";
import { StretchPanel } from "./StretchPanel";
import { PayablesPanel } from "./PayablesPanel";
import { DisputePanel } from "./DisputePanel";
import { SponsorsPanel } from "./SponsorsPanel";
import { OverviewSchedulePanel } from "./OverviewSchedulePanel";
import { PayPalApproveButtons, paypalOrderIdFromApproveUrl } from "./PayPalApproveButtons";
import {
  DEMO_ACCOUNTS,
  clearDemoSession,
  demoRoleHeaders,
  isOwnerRole,
  readDemoSession,
  writeDemoSession,
  type DemoRole,
  type DemoSession,
} from "../lib/demo-auth";

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

type PendingApprovalSummary = {
  approvalId: string;
  orderTotal: number;
  unitPrice: number;
  supplierId: string;
  reasons: string[];
  threshold: number;
  status: "PENDING";
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
  pendingApproval?: PendingApprovalSummary | null;
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
  paypalOrderId?: string;
  approveUrl?: string;
  amount?: string;
  supplierId?: string;
  lastStatus?: string;
} | null {
  if (!result || typeof result !== "object") return null;
  const checkout = (result as { checkout?: unknown }).checkout;
  if (!checkout || typeof checkout !== "object") return null;
  const c = checkout as Partial<{
    orderId: string;
    paypalOrderId: string;
    approveUrl: string;
    amount: string;
    supplierId: string;
    lastStatus: string;
  }>;
  if (!c.orderId) return null;
  return {
    orderId: c.orderId,
    paypalOrderId: c.paypalOrderId,
    approveUrl: c.approveUrl,
    amount: c.amount,
    supplierId: c.supplierId,
    lastStatus: c.lastStatus,
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
    brief: "12 ergonomic desk chairs. Prefer durable mesh backs and 5-year warranty.",
    priority: "price",
    quantity: "12",
    maxUnitPrice: "180.00",
    currency: "USD",
    neededByDays: "30",
  },
  {
    brief: "8 standing desks — speed priority for office expansion.",
    priority: "speed",
    quantity: "8",
    maxUnitPrice: "220.00",
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

/** Compact theme so ~4 negotiation rows fit before the grid scrolls. */
const negotiationGridTheme = themeQuartz.withParams({
  accentColor: "#0070e0",
  backgroundColor: "#ffffff",
  foregroundColor: "#142c52",
  headerBackgroundColor: "#f5f8fd",
  borderColor: "#e5ebf4",
  fontFamily: "inherit",
  fontSize: 13,
  rowHeight: 48,
  headerHeight: 40,
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
    paypalOrderId?: string | null;
    approveUrl?: string | null;
    amount?: string;
    supplierId?: string;
    authorizationId?: string;
    captureId?: string;
    tracking?: { carrier: string; number: string };
  } | null>(null);
  const [pendingOwnerApproval, setPendingOwnerApproval] = useState<{
    negotiationId: string;
    approvalId: string;
    orderTotal: number;
    unitPrice: number;
    supplierId: string;
    reasons: string[];
    threshold: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [offerSearch, setOfferSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState(paypalBoot.notice);
  const [demoSession, setDemoSession] = useState<DemoSession | null>(null);
  const [demoAuthReady, setDemoAuthReady] = useState(false);
  const [loginUser, setLoginUser] = useState("buyer");
  const [loginPass, setLoginPass] = useState("buyer");
  const [loginError, setLoginError] = useState("");
  const [needsAttentionOpen, setNeedsAttentionOpen] = useState(true);
  const [recentCapturedOpen, setRecentCapturedOpen] = useState(true);
  const [expandedNeedsId, setExpandedNeedsId] = useState<string | null>(null);
  const [resumeBusyId, setResumeBusyId] = useState<string | null>(null);
  const paymentActionRef = useRef<HTMLDivElement | null>(null);
  const supervisorApprovalRef = useRef<HTMLDivElement | null>(null);
  const [expandedCapturedId, setExpandedCapturedId] = useState<string | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<{
    id: string;
    brief: string;
    orderId?: string;
    amount?: string;
    supplierId?: string;
    status?: string;
    authorizationId?: string;
    captureId?: string;
    tracking?: { carrier: string; number: string };
  } | null>(null);
  const [capturedPreviewBusy, setCapturedPreviewBusy] = useState(false);
  const [shipmentEmailText, setShipmentEmailText] = useState("");
  const [shipmentParsed, setShipmentParsed] = useState<{
    carrier: string;
    number: string;
    confidence: string;
    matchedBy: string;
  } | null>(null);
  const [shipEmailBusy, setShipEmailBusy] = useState(false);
  /** Demo inbox after PayPal hold: waiting → seller email → auto-parse → SHIPPED */
  const [shipDemoPhase, setShipDemoPhase] = useState<"idle" | "waiting" | "received" | "applying" | "done">("idle");
  const shipDemoTokenRef = useRef(0);
  const [channel3Busy, setChannel3Busy] = useState(false);
  const [channel3Query, setChannel3Query] = useState("office sticky notes pack");
  const [channel3Products, setChannel3Products] = useState<Array<{
    title: string;
    price?: number;
    currency?: string;
    retailer?: string;
    productId?: string;
  }>>([]);
  const [channel3Selected, setChannel3Selected] = useState("");
  const [payablesSeed, setPayablesSeed] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState("");
  const [streamLines, setStreamLines] = useState<StreamLine[]>([]);
  const [streamStatus, setStreamStatus] = useState("");
  const [boundStreamKey, setBoundStreamKey] = useState("");
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
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
  const activeNegotiation = negotiations.find((item) => item.id === activeNegotiationId) ?? null;
  const succeededNegotiations = negotiations.filter((item) => item.status === "SUCCEEDED");

  const allFeedRows = useMemo<FeedRow[]>(() => {
    return negotiations.map((item) => {
      const payment = item.id === activeNegotiationId && activeOrder?.status
        ? activeOrder.status
        : item.id === pendingOwnerApproval?.negotiationId
          ? "PENDING_APPROVAL"
          : item.paymentStatus
            ?? (item.pendingApproval ? "PENDING_APPROVAL" : null)
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
  }, [negotiations, activeNegotiationId, activeOrder, pendingOwnerApproval]);

  const feedRows = useMemo<FeedRow[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allFeedRows;
    return allFeedRows.filter((row) =>
      [row.brief, row.status, row.priority, row.payment, String(row.quantity)]
        .join(" ")
        .toLowerCase()
        .includes(q));
  }, [allFeedRows, search]);

  // Metric cards must match grid Payment column across all negotiations, not only activeOrder.
  const heldCount = allFeedRows.filter((row) => row.payment === "HELD" || row.payment === "SHIPPED").length;
  const capturedCount = allFeedRows.filter((row) => row.payment === "CAPTURED").length;

  /** Multi-user payment inbox: pending Supervisor approval + anything past checkout not finished. */
  const paymentNeedsAttention = useMemo(
    () => allFeedRows.filter((row) =>
      row.payment === "PENDING_APPROVAL"
      || row.payment === "APPROVED"
      || row.payment === "HELD"
      || row.payment === "SHIPPED"),
    [allFeedRows],
  );
  const paymentRecentCaptured = useMemo(
    () => allFeedRows.filter((row) => row.payment === "CAPTURED").slice(0, 5),
    [allFeedRows],
  );

  function nextPaymentStepLabel(payment: string): string {
    if (payment === "PENDING_APPROVAL") return "Needs Supervisor approval before PayPal";
    if (payment === "APPROVED") return "Needs PayPal approve → Authorize hold";
    if (payment === "HELD") return "Waiting for seller shipment email";
    if (payment === "SHIPPED") return "Confirm delivery & capture (Buyer or Supervisor)";
    if (payment === "CAPTURED") return "Complete";
    return payment;
  }

  function openPendingSupervisorApproval(negotiationId: string, pending: PendingApprovalSummary) {
    setView("Payments & orders");
    setNeedsAttentionOpen(true);
    setExpandedNeedsId(negotiationId);
    setActiveNegotiationId(negotiationId);
    activeIdRef.current = negotiationId;
    setActiveOrder(null);
    setPendingOwnerApproval({
      negotiationId,
      approvalId: pending.approvalId,
      orderTotal: pending.orderTotal,
      unitPrice: pending.unitPrice,
      supplierId: pending.supplierId,
      reasons: pending.reasons ?? ["Above approval threshold"],
      threshold: pending.threshold ?? 20,
    });
    setNotice(
      `Supervisor approval required — $${pending.orderTotal.toFixed(2)} is above $${pending.threshold}. Switch to Supervisor, then Approve.`,
    );
    requestAnimationFrame(() => {
      supervisorApprovalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function toggleCapturedPreview(row: { id: string; brief: string; payment: string; maxUnitPrice: number }) {
    if (expandedCapturedId === row.id) {
      setExpandedCapturedId(null);
      setCapturedPreview(null);
      return;
    }
    // Captured details live only in the nested View panel — drop the duplicate order box below.
    setActiveOrder(null);
    setRecentCapturedOpen(true);
    setExpandedCapturedId(row.id);
    setCapturedPreviewBusy(true);
    setCapturedPreview({
      id: row.id,
      brief: row.brief,
      amount: money.format(row.maxUnitPrice),
      status: "CAPTURED",
    });
    try {
      const detail = await loadNegotiationDetail(row.id);
      const saved = detail ? checkoutFromResult(detail.result) : null;
      if (!saved?.orderId) {
        setCapturedPreview({
          id: row.id,
          brief: row.brief,
          status: "CAPTURED",
          amount: money.format(row.maxUnitPrice),
        });
        return;
      }
      const response = await fetch(`/api/orders/${encodeURIComponent(saved.orderId)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as {
        id?: string;
        status?: string;
        amount?: number | string;
        supplierId?: string;
        authorizationId?: string;
        captureId?: string;
        tracking?: { carrier: string; number: string };
      };
      setCapturedPreview({
        id: row.id,
        brief: detail?.brief ?? row.brief,
        orderId: payload.id ?? saved.orderId,
        status: payload.status ?? "CAPTURED",
        amount: payload.amount != null ? String(payload.amount) : saved.amount,
        supplierId: payload.supplierId ?? saved.supplierId,
        authorizationId: payload.authorizationId,
        captureId: payload.captureId,
        tracking: payload.tracking,
      });
    } finally {
      setCapturedPreviewBusy(false);
    }
  }

  async function openNegotiationOffers(id: string) {
    setActiveNegotiationId(id);
    activeIdRef.current = id;
    const detail = await loadNegotiationDetail(id);
    if (detail) {
      applyNegotiationResult(detail);
      setView("Supplier offers");
    }
  }

  /** Resume PayPal lifecycle for a negotiation that already has checkout (APPROVED → HELD → SHIPPED → CAPTURED). */
  async function resumePayment(id: string, payment: string) {
    if (payment === "PENDING_APPROVAL") {
      const listed = negotiations.find((item) => item.id === id)?.pendingApproval;
      if (listed) {
        openPendingSupervisorApproval(id, listed);
        return;
      }
    }
    setView("Payments & orders");
    setNeedsAttentionOpen(true);
    setExpandedCapturedId(null);
    setCapturedPreview(null);
    setActiveOrder(null);
    setShipmentParsed(null);
    setActiveNegotiationId(id);
    activeIdRef.current = id;
    setResumeBusyId(id);
    setExpandedNeedsId(id);
    setNotice("Loading payment checkpoint…");
    try {
      const detail = await loadNegotiationDetail(id);
      if (!detail) {
        setNotice("Could not load that negotiation — try Refresh.");
        return;
      }
      applyNegotiationResult(detail, { hydrateCheckout: false });
      const resultObj = detail.result && typeof detail.result === "object"
        ? detail.result as Record<string, unknown>
        : null;
      const pendingRaw = resultObj?.pendingOwnerApproval && typeof resultObj.pendingOwnerApproval === "object"
        ? resultObj.pendingOwnerApproval as PendingApprovalSummary & { status?: string }
        : null;
      if (payment === "PENDING_APPROVAL" || pendingRaw?.status === "PENDING") {
        if (pendingRaw?.approvalId) {
          openPendingSupervisorApproval(id, {
            approvalId: pendingRaw.approvalId,
            orderTotal: Number(pendingRaw.orderTotal),
            unitPrice: Number(pendingRaw.unitPrice),
            supplierId: pendingRaw.supplierId,
            reasons: Array.isArray(pendingRaw.reasons) ? pendingRaw.reasons : ["Above approval threshold"],
            threshold: Number(pendingRaw.threshold ?? 20),
            status: "PENDING",
          });
          return;
        }
      }
      const saved = checkoutFromResult(detail.result);
      if (!saved) {
        setNotice("No checkout on this request yet — open Offers and use Checkout winning offer first.");
        setView("Supplier offers");
        setExpandedNeedsId(null);
        return;
      }
      if (payment === "CAPTURED") {
        setExpandedNeedsId(null);
        await toggleCapturedPreview({
          id: detail.id,
          brief: detail.brief,
          payment: "CAPTURED",
          maxUnitPrice: detail.maxUnitPrice,
        });
        setNotice("Opened capture details in Recently captured.");
        return;
      }
      // Prefer the queue payment status so Open hold stays HELD even if order GET is stale.
      await hydrateOrder(saved.orderId, {
        ...saved,
        lastStatus: payment || saved.lastStatus,
      });
      requestAnimationFrame(() => {
        paymentActionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      if (payment === "APPROVED") {
        setNotice("Pay opened — use Pay with PayPal (Buyer or Supervisor), then Authorize hold if needed.");
      } else if (payment === "HELD") {
        setNotice("Hold opened — seller shipment email arrives in ~2s, then auto-moves to SHIPPED.");
        void runSellerShipEmailDemo({
          orderId: saved.orderId,
          supplierId: saved.supplierId,
        });
      } else if (payment === "SHIPPED") {
        setNotice("Ready to capture — Buyer or Supervisor can Confirm delivery & capture.");
      } else {
        setNotice("Opened Payments for this request.");
      }
    } finally {
      setResumeBusyId(null);
    }
  }

  async function startOrRetryNegotiation(id: string) {
    const response = await fetch(`/api/negotiations/${encodeURIComponent(id)}/start`, { method: "POST" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      setNotice(payload.error ?? `Start failed (${response.status}).`);
      return;
    }
    setActiveNegotiationId(id);
    activeIdRef.current = id;
    setNotice("Negotiation start accepted.");
    await loadNegotiations();
  }

  function paymentActionLabel(payment: string): string | null {
    if (payment === "PENDING_APPROVAL") return "Review approval";
    if (payment === "APPROVED") return "Pay";
    if (payment === "HELD") return "Open hold";
    if (payment === "SHIPPED") return "Confirm";
    if (payment === "CAPTURED") return "View";
    return null;
  }

  const negotiationColumns: ColDef<FeedRow>[] = [
    { field: "brief", headerName: "Request", flex: 2, minWidth: 200 },
    { field: "status", headerName: "Status", minWidth: 110, maxWidth: 130 },
    { field: "payment", headerName: "Payment", minWidth: 100, maxWidth: 120 },
    { field: "priority", headerName: "Priority", minWidth: 100, maxWidth: 120 },
    { field: "quantity", headerName: "Qty", minWidth: 70, maxWidth: 80 },
    {
      field: "maxUnitPrice",
      headerName: "Max unit",
      minWidth: 100,
      maxWidth: 120,
      valueFormatter: ({ value }) =>
        typeof value === "number" ? money.format(value) : "—",
    },
    {
      headerName: "Actions",
      colId: "actions",
      minWidth: 210,
      maxWidth: 260,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams<FeedRow>) => {
        const row = params.data;
        if (!row) return null;
        const payLabel = paymentActionLabel(row.payment);
        return (
          <div className={s.gridActions}>
            <button
              type="button"
              className={s.textButton}
              onClick={() => void openNegotiationOffers(row.id)}
            >
              Offers
            </button>
            {payLabel && (
              <button
                type="button"
                className={s.textButton}
                title="Open Payments & orders at the next checkpoint for this request"
                onClick={() => void resumePayment(row.id, row.payment)}
              >
                {payLabel}
              </button>
            )}
            {(row.status === "QUEUED" || row.status === "FAILED") && (
              <button
                type="button"
                className={s.textButton}
                onClick={() => void startOrRetryNegotiation(row.id)}
              >
                Start
              </button>
            )}
          </div>
        );
      },
    },
  ];

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

  async function loadNegotiationDetail(id: string) {
    const response = await fetch(`/api/negotiations/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as NegotiationRecord;
  }

  async function hydrateOrder(
    orderId: string,
    fallback?: {
      paypalOrderId?: string;
      approveUrl?: string;
      amount?: string;
      supplierId?: string;
      lastStatus?: string;
    },
  ) {
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { cache: "no-store" });
      if (!response.ok) {
        setActiveOrder({
          orderId,
          status: fallback?.lastStatus ?? "APPROVED",
          paypalOrderId: fallback?.paypalOrderId ?? paypalOrderIdFromApproveUrl(fallback?.approveUrl),
          approveUrl: fallback?.approveUrl,
          amount: fallback?.amount,
          supplierId: fallback?.supplierId,
        });
        return;
      }
      const payload = await response.json() as {
        id?: string;
        status?: string;
        paypalOrderId?: string | null;
        approveUrl?: string | null;
        amount?: number | string;
        supplierId?: string;
        authorizationId?: string;
        captureId?: string;
        tracking?: { carrier: string; number: string };
      };
      const approveUrl = payload.approveUrl ?? fallback?.approveUrl;
      const liveStatus = payload.status ?? "APPROVED";
      const preferred = fallback?.lastStatus;
      const advanced = new Set(["HELD", "SHIPPED", "CAPTURED"]);
      // Queue payment can be ahead of /api/orders — keep HELD/SHIPPED when live still says APPROVED.
      const status = preferred && advanced.has(preferred) && !advanced.has(liveStatus)
        ? preferred
        : (payload.status ?? preferred ?? "APPROVED");
      setActiveOrder({
        orderId: payload.id ?? orderId,
        status,
        paypalOrderId: payload.paypalOrderId
          ?? fallback?.paypalOrderId
          ?? paypalOrderIdFromApproveUrl(approveUrl),
        approveUrl,
        amount: payload.amount != null ? String(payload.amount) : fallback?.amount,
        supplierId: payload.supplierId ?? fallback?.supplierId,
        authorizationId: payload.authorizationId,
        captureId: payload.captureId,
        tracking: payload.tracking,
      });
    } catch {
      setActiveOrder({
        orderId,
        status: fallback?.lastStatus ?? "APPROVED",
        paypalOrderId: fallback?.paypalOrderId ?? paypalOrderIdFromApproveUrl(fallback?.approveUrl),
        approveUrl: fallback?.approveUrl,
        amount: fallback?.amount,
        supplierId: fallback?.supplierId,
      });
    }
  }

  function applyNegotiationResult(detail: NegotiationRecord, options?: { hydrateCheckout?: boolean }) {
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
      if (saved && options?.hydrateCheckout !== false) {
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

  async function loadNegotiations(retry = true) {
    try {
      const response = await fetch("/api/negotiations", { cache: "no-store" });
      if (!response.ok) {
        if (retry && (response.status === 502 || response.status === 503 || response.status >= 500)) {
          setNegotiationsError("API waking up — retrying…");
          window.setTimeout(() => {
            void loadNegotiations(false);
          }, 4_000);
          return;
        }
        setNegotiationsError(
          response.status === 503
            ? "API configuration missing on the web server."
            : `Could not load negotiations (${response.status}).`,
        );
        return;
      }
      const data = await response.json() as { items?: NegotiationRecord[] };
      const items = Array.isArray(data.items) ? data.items : [];
      setNegotiations(items.slice(0, 20));
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
    // Restore demo role after mount so SSR HTML matches (avoids hydration mismatch).
    const existing = readDemoSession();
    queueMicrotask(() => {
      if (existing) {
        setDemoSession(existing);
        setLoginUser(existing.role === "owner" ? "supervisor" : "buyer");
        setLoginPass(existing.role === "owner" ? "supervisor" : "buyer");
      }
      setDemoAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!demoSession) return;
    void loadNegotiations();
    if (paypalBoot.clearQuery) {
      window.history.replaceState({}, "", "/");
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      eventSourceRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoSession?.role]);

  const demoRole: DemoRole | null = demoSession?.role ?? null;
  const isOwner = isOwnerRole(demoRole);

  function signInAs(role: DemoRole) {
    const account = DEMO_ACCOUNTS[role];
    const session: DemoSession = {
      role: account.role,
      name: account.name,
      signedInAt: new Date().toISOString(),
    };
    writeDemoSession(session);
    setDemoSession(session);
    setLoginError("");
    setNotice(`Signed in as ${account.name}.`);
  }

  function submitDemoLogin(event: FormEvent) {
    event.preventDefault();
    const user = loginUser.trim().toLowerCase();
    const pass = loginPass.trim();
    const buyerOk = user === DEMO_ACCOUNTS.buyer.username && pass === DEMO_ACCOUNTS.buyer.password;
    const supervisorUser = user === DEMO_ACCOUNTS.owner.username || user === "owner";
    const supervisorPass = pass === DEMO_ACCOUNTS.owner.password || pass === "owner";
    const ownerOk = supervisorUser && supervisorPass;
    if (buyerOk) {
      signInAs("buyer");
      return;
    }
    if (ownerOk) {
      signInAs("owner");
      return;
    }
    setLoginError("Use buyer/buyer or supervisor/supervisor for this sandbox demo.");
  }

  function signOutDemo() {
    clearDemoSession();
    setDemoSession(null);
    setPendingOwnerApproval(null);
    setActiveOrder(null);
    setNotice("Signed out. Pick Buyer or Supervisor to continue the demo.");
  }

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
      const eligible = offers.filter((o) => o.withinBudget && o.meetsDeadline);
      const context = [
        activeNegotiationId ? `negotiation=${activeNegotiationId}` : "",
        offers.length
          ? `offers=${offers.map((o) => `${o.supplier}:$${o.unitPrice}/${o.leadTimeDays}d/score=${o.score.toFixed(2)}/${o.withinBudget && o.meetsDeadline ? "eligible" : "ineligible"}`).join(", ")}`
          : "offers=none",
        eligible[0] ? `best_eligible=${eligible[0].supplier}` : "best_eligible=none",
        activeOrder ? `order=${activeOrder.orderId}:${activeOrder.status}` : "",
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
      // Scroll only the chat panel — never the page (scrollIntoView was jumping to top).
      requestAnimationFrame(() => {
        const log = chatLogRef.current;
        if (log) log.scrollTop = log.scrollHeight;
      });
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
    const validated = validateFields(demo);
    setView("Overview");
    setMobileOpen(false);
    setFields(demo);
    setFieldErrors({});
    if (!validated.draft) {
      setComposerMode("compose");
      setPendingDraft(null);
      setNotice("Demo request needs edits before review.");
      requestAnimationFrame(() => briefRef.current?.focus());
      return;
    }
    setPendingDraft(validated.draft);
    setComposerMode("review");
    setNotice("Demo request ready — click Queue negotiation to start buyer/seller agents.");
    requestAnimationFrame(() => reviewHeadingRef.current?.focus());
  }

  /** Search Channel3 catalog and show product + price rows to pick from. */
  async function searchChannel3Catalog(queryOverride?: string) {
    const query = (queryOverride ?? channel3Query).trim();
    if (!query || channel3Busy) return;
    setChannel3Busy(true);
    setChannel3Products([]);
    setChannel3Selected("");
    try {
      const response = await fetch("/api/sponsors/channel3/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, maxPrice: 250 }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        note?: string;
        configured?: boolean;
        products?: Array<{
          title: string;
          price?: number;
          currency?: string;
          retailer?: string;
          productId?: string;
        }>;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Channel3 search failed.");
        return;
      }
      if (!payload.configured) {
        setNotice(payload.note ?? "CHANNEL3_API_KEY not set on the API.");
        return;
      }
      const products = Array.isArray(payload.products) ? payload.products : [];
      setChannel3Products(products);
      if (products.length) setChannel3Selected("0");
      setNotice(
        products.length
          ? `${payload.note ?? "Channel3 live results"} · pick one, then Use market price → Review.`
          : (payload.note ?? "No Channel3 products matched — try another query."),
      );
    } finally {
      setChannel3Busy(false);
    }
  }

  /**
   * Channel3 utilization: live catalog search (not Postgres) → product title + market price
   * become the RFQ ceiling sellers must match/beat. Queue later persists that RFQ in Postgres.
   */
  function applyChannel3Product(product: {
    title: string;
    price?: number;
    retailer?: string;
  }) {
    const unit = product.price != null && Number.isFinite(product.price)
      ? Math.min(product.price, 250)
      : 25;
    const retailer = product.retailer ? ` from ${product.retailer}` : "";
    const next = {
      brief: `Supply 1× "${product.title}"${retailer}. Match or beat Channel3 market unit price ≤ $${unit.toFixed(2)} USD. Prefer in-stock; ship within 30 days.`.slice(0, 500),
      priority: "balanced" as const,
      quantity: "1",
      maxUnitPrice: unit.toFixed(2),
      currency: "USD" as const,
      neededByDays: "30",
    };
    setFields(next);
    const result = validateFields(next);
    setFieldErrors(result.errors);
    if (result.draft) {
      setPendingDraft(result.draft);
      setComposerMode("review");
      setNotice(
        `Channel3 market price $${unit.toFixed(2)} is your RFQ ceiling. Confirm below, then Queue — sellers compete to match or beat it.`,
      );
      requestAnimationFrame(() => reviewHeadingRef.current?.focus());
      return;
    }
    setComposerMode("compose");
    setPendingDraft(null);
    setNotice("Catalog product loaded — fix highlighted fields, then Review draft.");
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
    setNotice("Seeding demo: queueing sample negotiation…");
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
    setNotice("Checking policy and creating checkout…");
    try {
      const response = await fetch(`/api/negotiations/${encodeURIComponent(activeNegotiationId)}/checkout`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        orderId?: string;
        status?: string;
        paypalOrderId?: string;
        approveUrl?: string;
        amount?: string;
        supplierId?: string;
        needsOwnerApproval?: boolean;
        note?: string;
        policy?: string;
        approval?: {
          approvalId: string;
          orderTotal: number;
          unitPrice: number;
          supplierId: string;
          reasons: string[];
          threshold: number;
        };
      };
      if (!response.ok && response.status !== 202) {
        setNotice(payload.error ?? `Checkout failed (${response.status}).`);
        return;
      }
      if (payload.needsOwnerApproval && payload.approval) {
        const approvalId = payload.approval.approvalId;
        const orderTotal = Number(payload.approval.orderTotal);
        const threshold = Number(payload.approval.threshold ?? 20);
        setPendingOwnerApproval({
          negotiationId: activeNegotiationId,
          approvalId,
          orderTotal,
          unitPrice: Number(payload.approval.unitPrice),
          supplierId: payload.approval.supplierId,
          reasons: Array.isArray(payload.approval.reasons) ? payload.approval.reasons : ["Above approval threshold"],
          threshold,
        });
        setActiveOrder(null);
        setNeedsAttentionOpen(true);
        setExpandedNeedsId(activeNegotiationId);
        setNotice(
          payload.note
            ?? `Supervisor approval required — $${orderTotal.toFixed(2)} is above $${threshold}. Switch to Supervisor, then Approve.`,
        );
        setView("Payments & orders");
        void loadNegotiations();
        requestAnimationFrame(() => {
          supervisorApprovalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }
      if (payload.needsOwnerApproval) {
        setNotice("Supervisor approval required, but approval details were missing — try Checkout again.");
        setView("Payments & orders");
        return;
      }
      setPendingOwnerApproval(null);
      setActiveOrder({
        orderId: payload.orderId ?? "",
        status: payload.status ?? "APPROVED",
        paypalOrderId: payload.paypalOrderId ?? paypalOrderIdFromApproveUrl(payload.approveUrl),
        approveUrl: payload.approveUrl,
        amount: payload.amount,
        supplierId: payload.supplierId,
      });
      setNotice(
        payload.policy === "ALLOW"
          ? "Auto-allowed (≤ threshold). Use Pay with PayPal as the sandbox buyer — hold follows approve."
          : "Checkout created. Use Pay with PayPal (popup) as the sandbox buyer, then we authorize the hold.",
      );
      setView("Payments & orders");
    } catch {
      setNotice("Checkout failed. Check API/PayPal sandbox configuration.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function decideOwnerCheckout(approve: boolean) {
    if (!pendingOwnerApproval || orderBusy) return;
    setOrderBusy(true);
    setNotice(approve ? "Recording Supervisor approval…" : "Recording Supervisor denial…");
    try {
      if (!isOwner) {
        setNotice("Switch to Supervisor login (supervisor / supervisor) to approve or deny this spend.");
        return;
      }
      const response = await fetch(
        `/api/negotiations/${encodeURIComponent(pendingOwnerApproval.negotiationId)}/checkout/owner-decide`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...demoRoleHeaders(demoRole) },
          body: JSON.stringify({ approve }),
        },
      );
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        denied?: boolean;
        note?: string;
        orderId?: string;
        status?: string;
        paypalOrderId?: string;
        approveUrl?: string;
        amount?: string;
        supplierId?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? `Supervisor decision failed (${response.status}).`);
        return;
      }
      if (payload.denied) {
        setPendingOwnerApproval(null);
        setExpandedNeedsId(null);
        setNotice(payload.note ?? "Supervisor denied — no PayPal checkout.");
        void loadNegotiations();
        return;
      }
      setPendingOwnerApproval(null);
      setActiveOrder({
        orderId: payload.orderId ?? "",
        status: payload.status ?? "APPROVED",
        paypalOrderId: payload.paypalOrderId ?? paypalOrderIdFromApproveUrl(payload.approveUrl),
        approveUrl: payload.approveUrl,
        amount: payload.amount,
        supplierId: payload.supplierId,
      });
      setNeedsAttentionOpen(true);
      setExpandedNeedsId(pendingOwnerApproval.negotiationId);
      setNotice("Supervisor approved. Use Pay with PayPal as the sandbox buyer — hold follows approve.");
      setView("Payments & orders");
      void loadNegotiations();
    } catch {
      setNotice("Supervisor decision failed.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function authorizeHold(orderIdOverride?: string, authorizationIdFromPaypal?: string) {
    const orderId = orderIdOverride ?? activeOrder?.orderId;
    if (!orderId) return;
    if (activeOrder?.status === "HELD" && activeOrder.orderId === orderId) {
      setNotice("Funds already on hold — waiting for seller shipment email…");
      await loadNegotiations();
      void runSellerShipEmailDemo({
        orderId,
        supplierId: activeOrder.supplierId,
      });
      return;
    }
    setOrderBusy(true);
    setNotice(authorizationIdFromPaypal
      ? "PayPal authorized in popup — saving funds on hold…"
      : "Authorizing PayPal hold…");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/authorize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          authorizationIdFromPaypal ? { authorizationId: authorizationIdFromPaypal } : {},
        ),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        status?: string;
        authorizationId?: string;
        amount?: string;
        paypalOrderId?: string;
        approveUrl?: string;
        supplierId?: string;
        reuse?: boolean;
      };
      if (!response.ok) {
        if (response.status === 409 && /now HELD|already/i.test(payload.error ?? "")) {
          await hydrateOrder(orderId);
          await loadNegotiations();
          setNotice("Funds already on hold — waiting for seller shipment email…");
          void runSellerShipEmailDemo({
            orderId,
            supplierId: payload.supplierId ?? activeOrder?.supplierId,
          });
          return;
        }
        setNotice(payload.error ?? `Authorize failed (${response.status}). Approve with the PayPal popup first, then retry Authorize hold.`);
        return;
      }
      setActiveOrder(current => current && current.orderId === orderId ? {
        ...current,
        status: payload.status ?? "HELD",
        authorizationId: payload.authorizationId,
        amount: payload.amount ?? current.amount,
        supplierId: payload.supplierId ?? current.supplierId,
      } : {
        orderId,
        status: payload.status ?? "HELD",
        authorizationId: payload.authorizationId,
        amount: payload.amount,
        supplierId: payload.supplierId,
      });
      await loadNegotiations();
      setNotice("Funds on hold (HELD). Waiting for the winning seller to email shipment details…");
      void runSellerShipEmailDemo({
        orderId,
        supplierId: payload.supplierId ?? activeOrder?.supplierId,
      });
    } catch {
      setNotice("Authorize failed.");
    } finally {
      setOrderBusy(false);
    }
  }

  async function runSellerShipEmailDemo(opts: { orderId: string; supplierId?: string | null }) {
    const orderId = opts.orderId?.trim();
    if (!orderId) return;
    const token = ++shipDemoTokenRef.current;
    setShipEmailBusy(true);
    setShipDemoPhase("waiting");
    setShipmentEmailText("");
    setShipmentParsed(null);
    setNotice("Funds on hold — waiting for seller shipment email…");
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (token !== shipDemoTokenRef.current) return;

      const supplierId = (opts.supplierId ?? "seller").trim() || "seller";
      const qs = new URLSearchParams({ supplierId, orderId });
      const sampleRes = await fetch(`/api/shipment-email/sample?${qs.toString()}`, { cache: "no-store" });
      const sample = await sampleRes.json().catch(() => ({})) as { text?: string; error?: string };
      if (!sampleRes.ok || !sample.text) {
        setShipDemoPhase("idle");
        setNotice(sample.error ?? "Seller shipment email did not arrive — retry Open hold.");
        return;
      }
      if (token !== shipDemoTokenRef.current) return;
      setShipmentEmailText(sample.text);
      setShipDemoPhase("received");
      setNotice(`Email received from ${supplierId} — reading tracking…`);

      const parseRes = await fetch("/api/shipment-email/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: sample.text }),
      });
      const parsedPayload = await parseRes.json().catch(() => ({})) as {
        error?: string;
        parsed?: { carrier: string; number: string; confidence: string; matchedBy: string };
      };
      if (!parseRes.ok || !parsedPayload.parsed) {
        setShipDemoPhase("received");
        setNotice(parsedPayload.error ?? "Could not read tracking from seller email.");
        return;
      }
      if (token !== shipDemoTokenRef.current) return;
      setShipmentParsed(parsedPayload.parsed);
      setShipDemoPhase("applying");
      setNotice(`Tracking ${parsedPayload.parsed.carrier} ${parsedPayload.parsed.number} — marking SHIPPED…`);

      const shipRes = await fetch(`/api/orders/${encodeURIComponent(orderId)}/seller-shipped`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "email-bridge",
          carrier: parsedPayload.parsed.carrier,
          number: parsedPayload.parsed.number,
        }),
      });
      const shipPayload = await shipRes.json().catch(() => ({})) as {
        error?: string;
        status?: string;
        tracking?: { carrier: string; number: string };
        note?: string;
      };
      if (!shipRes.ok) {
        setShipDemoPhase("received");
        setNotice(shipPayload.error ?? `Ship notice failed (${shipRes.status}).`);
        return;
      }
      if (token !== shipDemoTokenRef.current) return;
      setActiveOrder((current) => current && current.orderId === orderId ? {
        ...current,
        status: shipPayload.status ?? "SHIPPED",
        tracking: shipPayload.tracking,
      } : current);
      setShipDemoPhase("done");
      await loadNegotiations();
      setNotice(
        shipPayload.note
        ?? "Seller email applied — SHIPPED. Confirm delivery & capture when ready (Buyer or Supervisor).",
      );
    } catch {
      if (token === shipDemoTokenRef.current) {
        setShipDemoPhase("idle");
        setNotice("Seller email demo failed — open the hold row again to retry.");
      }
    } finally {
      if (token === shipDemoTokenRef.current) setShipEmailBusy(false);
    }
  }

  async function confirmDeliveryCapture() {
    if (!activeOrder?.orderId || orderBusy) return;
    setOrderBusy(true);
    setNotice("Confirming delivery and capturing funds…");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(activeOrder.orderId)}/confirm-delivery`, {
        method: "POST",
        headers: { ...demoRoleHeaders(demoRole) },
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
      const capturedId = activeNegotiationId;
      const capturedBrief = negotiations.find((n) => n.id === capturedId)?.brief
        ?? activeOrder.supplierId
        ?? "Captured order";
      const capturedMax = negotiations.find((n) => n.id === capturedId)?.maxUnitPrice ?? Number(payload.amount ?? activeOrder.amount ?? 0);
      setActiveOrder(null);
      setNotice("Delivery confirmed. Payment captured — details under Recently captured.");
      await loadNegotiations();
      if (capturedId) {
        setRecentCapturedOpen(true);
        await toggleCapturedPreview({
          id: capturedId,
          brief: capturedBrief,
          payment: "CAPTURED",
          maxUnitPrice: Number.isFinite(capturedMax) && capturedMax > 0 ? capturedMax : 1,
        });
      }
    } catch {
      setNotice("Capture failed.");
    } finally {
      setOrderBusy(false);
    }
  }

  if (!demoAuthReady) {
    return <div className={s.app}><p className={s.description} style={{ padding: 40 }}>Loading workspace…</p></div>;
  }

  if (!demoSession) {
    return (
      <div className={s.app}>
        <main className={s.loginShell}>
          <section className={s.loginCard}>
            <div className={s.inlineTitle}>
              <span className={s.brandIcon}><Layers3 size={22} /></span>
              <div>
                <h1>ProcureAI demo login</h1>
                <p className={s.description}>
                  Same workspace for both. Only difference: Supervisor approval (over $20) and capture.
                </p>
              </div>
            </div>
            <div className={s.loginRoleGrid}>
              <button type="button" className={s.trackCard} onClick={() => signInAs("buyer")}>
                <span className={s.iconTile}><UserRound size={20} /></span>
                <h3>Buyer</h3>
                <p>{DEMO_ACCOUNTS.buyer.blurb}</p>
                <span className={s.trackCta}>
                  <span className={s.trackRadio} aria-hidden />
                  <ArrowRight size={14} aria-hidden />
                  Continue as Buyer
                </span>
              </button>
              <button type="button" className={s.trackCard} onClick={() => signInAs("owner")}>
                <span className={s.iconTile}><ShieldCheck size={20} /></span>
                <h3>Supervisor</h3>
                <p>{DEMO_ACCOUNTS.owner.blurb}</p>
                <span className={s.trackCta}>
                  <span className={s.trackRadio} aria-hidden />
                  <ArrowRight size={14} aria-hidden />
                  Continue as Supervisor
                </span>
              </button>
            </div>
            <form className={s.loginForm} onSubmit={submitDemoLogin}>
              <p className={s.description}>Or sign in with demo credentials</p>
              <div className={s.fieldGrid}>
                <div className={s.field}>
                  <label htmlFor="demo-user">Username</label>
                  <input id="demo-user" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} autoComplete="username" />
                </div>
                <div className={s.field}>
                  <label htmlFor="demo-pass">Password</label>
                  <input id="demo-pass" type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} autoComplete="current-password" />
                </div>
              </div>
              {loginError && <p className={s.fieldError} role="alert">{loginError}</p>}
              <div className={s.reviewActions}>
                <button type="submit" className={s.primary}>Sign in</button>
              </div>
              <p className={s.tableNote}>buyer / buyer · supervisor / supervisor</p>
            </form>
          </section>
        </main>
      </div>
    );
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
          <span className={s.avatar}>{isOwner ? "S" : "B"}</span>
          <div>
            {demoSession.name}
            <small>{isOwner ? "Supervisor session" : "Buyer session"}</small>
          </div>
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
          <div className={s.profile}>
            <span className={s.avatar}>{isOwner ? "S" : "B"}</span>
            <div>
              {isOwner ? "Supervisor" : "Buyer"}
              <small>{isOwner ? "Full path + over-$20 approve" : "Full path; Supervisor for over-$20 approve"}</small>
            </div>
            <button type="button" className={s.textButton} title="Sign out of demo role" onClick={signOutDemo}>
              <LogOut size={15} />
            </button>
          </div>
          <div className={s.roleSwitch}>
            <button
              type="button"
              className={isOwner ? s.secondary : s.primary}
              disabled={!isOwner}
              onClick={() => signInAs("buyer")}
            >
              Buyer
            </button>
            <button
              type="button"
              className={isOwner ? s.primary : s.secondary}
              disabled={isOwner}
              onClick={() => signInAs("owner")}
            >
              Supervisor
            </button>
          </div>
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
                    ? "Extract supplier invoices, three-way match, payout, client invoice, disputes."
                    : "Marketplace negotiate → approve → authorize → capture. Payables extend the same control plane."}
              </p>
            </div>
            <div className={s.headingActions}>
              <label className={s.previewPill}>
                <input
                  type="radio"
                  name="ui-preview"
                  value="preview"
                  checked
                  onChange={() => undefined}
                  aria-label="UI preview"
                />
                UI preview
              </label>
              <div className={s.reviewActions}>
                <button
                  type="button"
                  className={s.secondary}
                  title="Fill the composer with a sample procurement brief"
                  onClick={loadDemoRequest}
                >
                  Load demo request
                </button>
                <button
                  className={s.primary}
                  title="Start a new sourcing brief on the Overview composer"
                  onClick={newRequest}
                >
                  <Plus size={18} /> New request
                </button>
              </div>
            </div>
          </section>

          <div className={s.stackStrip} aria-label="Built with">
            <span className={s.stackLabel}>Core</span>
            <span className={`${s.stackLogo} ${s.stackLogoCore}`} title="PayPal sandbox Orders AUTHORIZE + Agent Toolkit/MCP">PayPal</span>
            <span className={`${s.stackLogo} ${s.stackLogoCore}`} title="Hosted on Render · Workflows SDK">Render</span>
            <span className={`${s.stackLogo} ${s.stackLogoCore}`} title="AG Grid Community · live applyTransaction + SSE">AG Grid</span>
            <span className={s.stackLabel}>Partners</span>
            <span className={s.stackLogo} title="Channel3 catalog enrich (set CHANNEL3_API_KEY)">Channel3</span>
            <span className={s.stackLogo} title="Bryntum-category schedule timeline">Bryntum</span>
            <span className={s.stackLogo} title="KERNEL page fetch for invoices">KERNEL</span>
          </div>

          {view === "Overview" && (
            <div className={s.previewNotice}>
              <ShieldCheck size={17} />
              <p>
                Dual track on Overview only: <strong>Negotiate</strong> (marketplace RFQs) and <strong>Payables</strong> (AP invoices).
                They are separate flows — Requests stays marketplace-only; open the Payables tab for extract → match → payout.
              </p>
            </div>
          )}
          {(view === "Requests" || view === "Supplier offers" || view === "Payments & orders") && (
            <div className={s.previewNotice}>
              <ShieldCheck size={17} />
              <p>
                Marketplace track — negotiate → approve → authorize → capture. Payables (invoices/payouts) live under the Payables tab, not here.
              </p>
            </div>
          )}
          {view === "Payables" && (
            <div className={s.previewNotice}>
              <ShieldCheck size={17} />
              <p>
                Payables track — extract supplier invoices, three-way match, payout, client invoice. Separate from marketplace Requests.
              </p>
            </div>
          )}

          {view === "Overview" && (
            <section className={s.trackLaunch} aria-label="Choose a demo track">
              <button
                type="button"
                className={s.trackCard}
                onClick={() => void seedDemoWorkspace()}
                disabled={queueBusy}
                title="Queue a sample negotiation"
              >
                <span className={s.iconTile}><Sparkles size={20} /></span>
                <h3>1 · Agent marketplace</h3>
                <p>Buyer AI negotiates with seller AIs, ranks offers in AG Grid, then PayPal authorize → capture.</p>
                <ul className={s.trackSteps}>
                  <li><ArrowRight size={12} aria-hidden /> Seed or compose a request</li>
                  <li><ArrowRight size={12} aria-hidden /> Watch live SSE + Supplier offers</li>
                  <li><ArrowRight size={12} aria-hidden /> Checkout → approve → authorize → ship → capture</li>
                </ul>
                <span className={s.trackCta}>
                  <span className={s.trackRadio} aria-hidden />
                  <ArrowRight size={14} aria-hidden />
                  {queueBusy ? "Seeding…" : "Start negotiation demo"}
                </span>
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
                  <li><ArrowRight size={12} aria-hidden /> Extract the $1.50 sample invoice</li>
                  <li><ArrowRight size={12} aria-hidden /> Match PO + receipt → payout</li>
                  <li><ArrowRight size={12} aria-hidden /> Create client invoice + simulate dispute</li>
                </ul>
                <span className={s.trackCta}>
                  <span className={s.trackRadio} aria-hidden />
                  <ArrowRight size={14} aria-hidden />
                  Open Payables
                </span>
              </button>
            </section>
          )}

          {view !== "Payables" && view !== "Automation" && (
            <section className={s.metrics} aria-label="Workspace summary">
              {(
                view === "Overview"
                  ? [
                      { label: "Negotiations", value: String(negotiations.length), detail: negotiationsError ? "API unreachable" : "Marketplace track", icon: Sparkles, target: "Requests" as View },
                      { label: "Funds on hold", value: String(heldCount), detail: heldCount ? "Authorized, not captured" : "After PayPal approve", icon: ShieldCheck, target: "Payments & orders" as View },
                      { label: "Captured", value: String(capturedCount), detail: capturedCount ? "Supervisor confirmed delivery" : "Confirm after ship", icon: CreditCard, target: "Payments & orders" as View },
                      { label: "Payables", value: "AP", detail: "Open AP tab · extract · match · payout", icon: Wallet, target: "Payables" as View },
                    ]
                  : [
                      { label: "Negotiations", value: String(negotiations.length), detail: negotiationsError ? "API unreachable" : "Marketplace track", icon: Sparkles, target: "Requests" as View },
                      { label: "Funds on hold", value: String(heldCount), detail: heldCount ? "Authorized, not captured" : "After PayPal approve", icon: ShieldCheck, target: "Payments & orders" as View },
                      { label: "Captured", value: String(capturedCount), detail: capturedCount ? "Supervisor confirmed delivery" : "Confirm after ship", icon: CreditCard, target: "Payments & orders" as View },
                    ]
              ).map(({ label, value, detail, icon: Icon, target }) => (
                <button className={s.metric} key={label} onClick={() => navigate(target)}>
                  <span className={s.metricTop}><span>{label}</span><Icon size={18} /></span>
                  <strong>{value}</strong><span className={s.metricBottom}>{detail}<ArrowUpRight size={14} /></span>
                </button>
              ))}
            </section>
          )}

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
                  ? "Channel3 looks up a live market product + price; that price becomes the RFQ ceiling sellers must beat. Or write your own brief. Queue stores the RFQ in Postgres and starts seller negotiation."
                  : "This draft uses the Channel3 market ceiling (or your typed budget). Queue negotiation is what sellers receive — that RFQ is saved in Postgres."}
              </p>

              {composerMode === "compose" ? (
                <form onSubmit={reviewDraft} className={s.briefForm} noValidate>
                  <div className={s.channel3Box}>
                    <label htmlFor={`${formId}-channel3`}>1 · Market lookup (Channel3 live API)</label>
                    <p className={s.description}>
                      Not stored in our database — each search hits Channel3. Pick a product; we use its title + price as the seller ceiling, then open Review.
                    </p>
                    <div className={s.budgetRow}>
                      <input
                        id={`${formId}-channel3`}
                        value={channel3Query}
                        onChange={(event) => setChannel3Query(event.target.value)}
                        placeholder="office sticky notes pack"
                        disabled={channel3Busy}
                      />
                      <button
                        type="button"
                        className={s.secondary}
                        disabled={channel3Busy || !channel3Query.trim()}
                        title="Search Channel3 live catalog"
                        onClick={() => void searchChannel3Catalog()}
                      >
                        <PackageSearch size={15} /> {channel3Busy ? "Searching…" : "Search"}
                      </button>
                    </div>
                    {channel3Products.length > 0 && (
                      <div className={s.channel3Pick}>
                        <div className={s.field}>
                          <label htmlFor={`${formId}-channel3-pick`}>Pick product (name · price · retailer)</label>
                          <select
                            id={`${formId}-channel3-pick`}
                            value={channel3Selected}
                            onChange={(event) => setChannel3Selected(event.target.value)}
                          >
                            {channel3Products.map((product, index) => {
                              const priceLabel = product.price != null && Number.isFinite(product.price)
                                ? `$${Number(product.price).toFixed(2)}`
                                : "price pending";
                              const retail = product.retailer ? ` · ${product.retailer}` : "";
                              return (
                                <option key={product.productId ?? `${product.title}-${index}`} value={String(index)}>
                                  {product.title.slice(0, 52)}{product.title.length > 52 ? "…" : ""} — {priceLabel}{retail}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <button
                          type="button"
                          className={s.primary}
                          disabled={channel3Selected === ""}
                          title="Set RFQ ceiling from Channel3 market price and open Review"
                          onClick={() => {
                            const product = channel3Products[Number(channel3Selected)];
                            if (product) applyChannel3Product(product);
                          }}
                        >
                          Use market price → Review
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={s.formDivider} role="separator">or write your own brief</div>

                  <label htmlFor={`${formId}-brief`}>2 · Procurement brief (what sellers see)</label>
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
                <span className={s.pending}>
                  {chatBusy ? "Thinking…" : chatError ? "Not connected" : "Ready"}
                </span>
              </div>
              <div className={s.assistantBody}>
                {chatMessages.length === 0 ? (
                  <div className={s.assistantEmpty}>
                    <div className={s.orb}><Bot size={31} /></div>
                    <h3>Less back-and-forth.<br />More informed decisions.</h3>
                    <p>Ask about briefs, supplier trade-offs, or the authorize → capture payment path.</p>
                    <div className={s.assistantSteps}>
                      {["Review your requirements", "Compare negotiated offers", "Approve on your terms"].map(text =>
                        <div key={text}><Check size={13} /><span>{text}</span></div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={s.chatLog} aria-live="polite" ref={chatLogRef}>
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

          {view === "Overview" && (
            <OverviewSchedulePanel setNotice={setNotice} />
          )}

          {(view === "Overview" || view === "Requests") && <>
            <section className={s.card}>
              <div className={s.sectionHeader}>
                <div>
                  <h2>Negotiations</h2>
                  <p className={s.description}>
                    ~4 rows visible, scroll for more. Offers → suppliers. Pay / Ship / Capture resumes that order’s next payment step.
                  </p>
                </div>
                <div className={s.tableActions}>
                  <label className={s.search}>
                    <Search size={16} />
                    <input
                      aria-label="Search negotiations"
                      placeholder="Filter negotiations"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </label>
                  <button type="button" className={s.secondary} onClick={() => void loadNegotiations()}>Refresh</button>
                </div>
              </div>
              {negotiationsError && <p className={s.fieldError} role="alert">{negotiationsError}</p>}
              <div className={`${s.grid} ${s.gridCompact}`}>
                <AgGridReact<FeedRow>
                  theme={negotiationGridTheme}
                  columnDefs={negotiationColumns}
                  defaultColDef={{ flex: 1, sortable: true, filter: false, resizable: true }}
                  onGridReady={(event) => {
                    feedGridApi.current = event.api;
                    syncGridRows(event.api, feedRows, (row) => row.id);
                  }}
                  getRowId={(params) => params.data.id}
                  overlayNoRowsTemplate="<span>No negotiations yet. Queue a request from Overview.</span>"
                />
              </div>
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
                onKernelInvoiceText={(text) => {
                  setPayablesSeed(text);
                  setView("Payables");
                  setNotice("KERNEL page text loaded in Payables — click Extract invoice.");
                }}
              />
            </>
          )}

          {view === "Payables" && (
            <PayablesPanel
              key={payablesSeed ? `seed-${payablesSeed.slice(0, 48)}` : "sample"}
              setNotice={setNotice}
              seedText={payablesSeed}
            />
          )}

          {(view === "Overview" || view === "Payments & orders") && <section className={`${s.card} ${s.paymentCard}`}>
            <div className={s.sectionHeader}>
              <div className={s.inlineTitle}><span className={s.paymentIcon}><CreditCard size={22} /></span><div><h2>Payments, with clear checkpoints</h2><p className={s.description}>Sandbox PayPal authorize → seller email → SHIPPED → Confirm capture.</p></div></div>
              <span className={s.pending}>{activeOrder?.status ?? "No order yet"}</span>
            </div>
            <p className={s.flowCaption}>Live sandbox lifecycle · AI never captures by itself</p>
            <ol className={s.paymentFlow}>
              {[
                { title: "Supervisor approval", detail: "Required when total > $20; ≤$20 auto-allows", active: Boolean(activeOrder) || Boolean(pendingOwnerApproval) },
                { title: "Funds held", detail: "Authorized, not captured", active: activeOrder?.status === "HELD" || activeOrder?.status === "SHIPPED" || activeOrder?.status === "CAPTURED" },
                { title: "Seller ships", detail: "Carrier and tracking recorded", active: activeOrder?.status === "SHIPPED" || activeOrder?.status === "CAPTURED" },
                { title: "Confirm delivery", detail: "Buyer or Supervisor captures", active: activeOrder?.status === "CAPTURED" },
              ].map((step, index) => <li key={step.title}>
                <span className={s.stepNumber}>{index + 1}</span>
                <div><strong>{step.title}</strong><small>{step.detail}{step.active ? " · done/current" : ""}</small></div>
              </li>)}
            </ol>

            {view === "Payments & orders" && pendingOwnerApproval && (
              <div className={`${s.reviewPanel} ${s.paymentQueueSelected}`} ref={supervisorApprovalRef}>
                <div className={s.sectionHeader}>
                  <div>
                    <h3>Supervisor approval required</h3>
                    <p className={s.description}>
                      Checkout paused. Order total ${pendingOwnerApproval.orderTotal.toFixed(2)} is above the ${pendingOwnerApproval.threshold} auto-allow threshold.
                      Switch to Supervisor, then Approve — PayPal is not created until then.
                    </p>
                  </div>
                  <span className={s.pending}>PENDING</span>
                </div>
                <p className={s.status} role="status">{notice}</p>
                <dl className={s.summaryList}>
                  <div><dt>Supplier</dt><dd>{pendingOwnerApproval.supplierId}</dd></div>
                  <div><dt>Unit price</dt><dd>${pendingOwnerApproval.unitPrice.toFixed(2)}</dd></div>
                  <div><dt>Order total</dt><dd>${pendingOwnerApproval.orderTotal.toFixed(2)} USD</dd></div>
                  <div><dt>Policy</dt><dd>{(pendingOwnerApproval.reasons ?? []).join("; ") || "Above approval threshold"}</dd></div>
                </dl>
                {!isOwner && (
                  <p className={s.summaryNote}>
                    You are signed in as <strong>Buyer</strong>. Use the sidebar <strong>Supervisor</strong> switch (or supervisor / supervisor), then Approve.
                  </p>
                )}
                <div className={s.reviewActions}>
                  {!isOwner && (
                    <button type="button" className={s.secondary} onClick={() => signInAs("owner")}>
                      Switch to Supervisor
                    </button>
                  )}
                  <button type="button" className={s.secondary} disabled={orderBusy || !isOwner} onClick={() => void decideOwnerCheckout(false)}>
                    Deny
                  </button>
                  <button type="button" className={s.primary} disabled={orderBusy || !isOwner} onClick={() => void decideOwnerCheckout(true)}>
                    Approve as Supervisor <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {view === "Payments & orders" && (
              <div className={s.paymentInbox}>
                <div className={s.sectionHeader}>
                  <div>
                    <h3>Payment queues</h3>
                    <p className={s.description}>
                      Pay / Open hold / Confirm expand under that row. Buyer and Supervisor share the path; only over-$20 spend approve (and dispute accept) need Supervisor.
                    </p>
                  </div>
                  <button type="button" className={s.secondary} onClick={() => void loadNegotiations()}>Refresh</button>
                </div>

                <div className={s.paymentNest}>
                  <button
                    type="button"
                    className={s.paymentNestToggle}
                    aria-expanded={needsAttentionOpen}
                    onClick={() => setNeedsAttentionOpen((open) => !open)}
                  >
                    {needsAttentionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>Needs attention</span>
                    <em>{paymentNeedsAttention.length}</em>
                  </button>
                  {needsAttentionOpen && (
                    <div className={s.paymentNestBody}>
                      <p className={s.description}>
                        PENDING_APPROVAL → Supervisor Approve · APPROVED → PayPal · HELD → seller email → SHIPPED → capture
                      </p>
                      {paymentNeedsAttention.length > 0 ? (
                        <ul className={s.paymentQueueOpen}>
                          {paymentNeedsAttention.map((row) => {
                            const payLabel = paymentActionLabel(row.payment) ?? "Open";
                            const expanded = expandedNeedsId === row.id;
                            const busy = resumeBusyId === row.id;
                            return (
                              <li key={row.id} className={`${s.paymentQueueStack} ${expanded ? s.paymentQueueSelected : ""}`}>
                                <div className={s.paymentQueueRow}>
                                  <div>
                                    <strong>{row.brief.slice(0, 88)}{row.brief.length > 88 ? "…" : ""}</strong>
                                    <p>{row.payment} · {nextPaymentStepLabel(row.payment)} · max {money.format(row.maxUnitPrice)}</p>
                                  </div>
                                  <div className={s.gridActions}>
                                    <span className={s.draftBadge}>{row.payment}</span>
                                    <button
                                      type="button"
                                      className={s.primary}
                                      disabled={orderBusy || busy}
                                      aria-expanded={expanded}
                                      onClick={() => {
                                        if (expanded && activeNegotiationId === row.id) {
                                          setExpandedNeedsId(null);
                                          return;
                                        }
                                        void resumePayment(row.id, row.payment);
                                      }}
                                    >
                                      {busy ? "Opening…" : expanded ? "Hide" : payLabel}
                                    </button>
                                  </div>
                                </div>
                                {expanded && (
                                  <div className={s.paymentInlineWindow} ref={activeNegotiationId === row.id ? paymentActionRef : undefined}>
                                    <div className={s.paymentInlineWindowHead}>
                                      <strong>
                                        {row.payment === "PENDING_APPROVAL" && "Pending Supervisor approval"}
                                        {row.payment === "APPROVED" && "PayPal approve → Authorize hold"}
                                        {row.payment === "HELD" && "Seller shipment email (auto)"}
                                        {row.payment === "SHIPPED" && "Confirm delivery & capture"}
                                      </strong>
                                      <button type="button" className={s.textButton} onClick={() => setExpandedNeedsId(null)}>
                                        Close
                                      </button>
                                    </div>
                                    {row.payment === "PENDING_APPROVAL" && activeNegotiationId === row.id && pendingOwnerApproval?.negotiationId === row.id ? (
                                      <div className={s.paymentInlineDetail}>
                                        <p className={s.description}>
                                          Order total ${pendingOwnerApproval.orderTotal.toFixed(2)} is above the ${pendingOwnerApproval.threshold} threshold.
                                          Switch role to Supervisor, then use <strong>Approve</strong> in the panel above to create the PayPal order.
                                        </p>
                                        <div className={s.gridActions}>
                                          <button
                                            type="button"
                                            className={s.secondary}
                                            onClick={() => {
                                              supervisorApprovalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                                            }}
                                          >
                                            Jump to approval panel
                                          </button>
                                        </div>
                                      </div>
                                    ) : activeNegotiationId === row.id && activeOrder && activeOrder.status !== "CAPTURED" ? (
                                      <>
                                        <dl className={s.summaryList}>
                                          <div><dt>Order</dt><dd>{activeOrder.orderId}</dd></div>
                                          <div><dt>Status</dt><dd>{activeOrder.status}</dd></div>
                                          {activeOrder.amount && <div><dt>Amount</dt><dd>${activeOrder.amount} USD</dd></div>}
                                          {activeOrder.supplierId && <div><dt>Supplier</dt><dd>{activeOrder.supplierId}</dd></div>}
                                          {activeOrder.authorizationId && <div><dt>Authorization</dt><dd>{activeOrder.authorizationId}</dd></div>}
                                          {activeOrder.tracking && <div><dt>Tracking</dt><dd>{activeOrder.tracking.carrier} {activeOrder.tracking.number}</dd></div>}
                                        </dl>
                                        {activeOrder.status === "APPROVED" && (activeOrder.paypalOrderId || activeOrder.approveUrl) && (
                                          <div className={s.paypalApproveBlock}>
                                            {activeOrder.paypalOrderId && (
                                              <PayPalApproveButtons
                                                paypalOrderId={activeOrder.paypalOrderId}
                                                onApproved={async (authorizationId) => {
                                                  setNotice(authorizationId
                                                    ? "PayPal hold authorized in popup — syncing…"
                                                    : "PayPal approved — authorizing hold on server…");
                                                  await authorizeHold(activeOrder.orderId, authorizationId);
                                                }}
                                                onCancel={() => setNotice("PayPal popup cancelled — approve again when ready.")}
                                                onError={(message) => setNotice(message)}
                                              />
                                            )}
                                            {activeOrder.approveUrl && (
                                              <p className={s.summaryNote}>
                                                Fallback — open as sandbox buyer:{" "}
                                                <a href={activeOrder.approveUrl} target="_blank" rel="noreferrer">Approve on PayPal</a>
                                                , then <strong>Authorize hold</strong>.
                                              </p>
                                            )}
                                          </div>
                                        )}
                                        {activeOrder.status === "APPROVED" && !activeOrder.paypalOrderId && !activeOrder.approveUrl && (
                                          <p className={s.summaryNote}>Missing PayPal approve link — re-checkout this offer from Supplier offers.</p>
                                        )}
                                        <div className={s.reviewActions}>
                                          {activeOrder.status === "APPROVED" && (
                                            <button
                                              type="button"
                                              className={s.secondary}
                                              disabled={orderBusy}
                                              onClick={() => void authorizeHold()}
                                            >
                                              Authorize hold
                                            </button>
                                          )}
                                          {activeOrder.status === "HELD" && (
                                            <div className={s.shipmentEmailBlock}>
                                              <p className={s.summaryNote}>
                                                <strong>HELD</strong> — winning seller sends a shipment email (~2s), we read tracking, then move to <strong>SHIPPED</strong>.
                                              </p>
                                              <div className={s.shipInbox}>
                                                <div className={s.shipInboxHead}>
                                                  <strong>Inbox</strong>
                                                  <span className={s.pending}>
                                                    {shipDemoPhase === "waiting" && "Waiting for email…"}
                                                    {shipDemoPhase === "received" && "Email received"}
                                                    {shipDemoPhase === "applying" && "Applying tracking…"}
                                                    {shipDemoPhase === "done" && "Applied"}
                                                    {(shipDemoPhase === "idle" || !shipDemoPhase) && (shipEmailBusy ? "Working…" : "Ready")}
                                                  </span>
                                                </div>
                                                {shipDemoPhase === "waiting" && (
                                                  <p className={s.description}>Listening for fulfillment mail from {activeOrder.supplierId ?? "winning seller"}…</p>
                                                )}
                                                {shipmentEmailText ? (
                                                  <pre className={s.shipInboxBody} aria-live="polite">{shipmentEmailText}</pre>
                                                ) : (
                                                  <p className={s.tableNote}>No seller email yet.</p>
                                                )}
                                                {shipmentParsed && (
                                                  <dl className={s.summaryList}>
                                                    <div><dt>Carrier</dt><dd>{shipmentParsed.carrier}</dd></div>
                                                    <div><dt>Tracking</dt><dd>{shipmentParsed.number}</dd></div>
                                                    <div><dt>Match</dt><dd>{shipmentParsed.matchedBy} · {shipmentParsed.confidence}</dd></div>
                                                  </dl>
                                                )}
                                              </div>
                                              <div className={s.reviewActions} style={{ flexWrap: "wrap" }}>
                                                <button
                                                  type="button"
                                                  className={s.secondary}
                                                  disabled={shipEmailBusy || orderBusy}
                                                  onClick={() => void runSellerShipEmailDemo({
                                                    orderId: activeOrder.orderId,
                                                    supplierId: activeOrder.supplierId,
                                                  })}
                                                >
                                                  {shipEmailBusy ? "Receiving…" : "Replay seller email"}
                                                </button>
                                              </div>
                                            </div>
                                          )}
                                          {activeOrder.status === "SHIPPED" && (
                                            <>
                                              <p className={s.summaryNote} style={{ flexBasis: "100%", margin: "0 0 4px" }}>
                                                Supplier reported <strong>SHIPPED</strong>
                                                {activeOrder.tracking ? ` (${activeOrder.tracking.carrier} ${activeOrder.tracking.number})` : ""}.
                                                Buyer or Supervisor can capture.
                                              </p>
                                              <button type="button" className={s.primary} disabled={orderBusy} onClick={() => void confirmDeliveryCapture()}>
                                                Confirm delivery & capture
                                              </button>
                                            </>
                                          )}
                                        </div>
                                      </>
                                    ) : (
                                      <p className={s.tableNote}>{busy ? "Loading checkout…" : "Could not open this order — click the button again or Refresh."}</p>
                                    )}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className={s.tableNote}>Nothing pending — no APPROVED / HELD / SHIPPED checkouts right now.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className={s.paymentNest}>
                  <button
                    type="button"
                    className={s.paymentNestToggle}
                    aria-expanded={recentCapturedOpen}
                    onClick={() => setRecentCapturedOpen((open) => !open)}
                  >
                    {recentCapturedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>Recently captured</span>
                    <em>{paymentRecentCaptured.length}</em>
                  </button>
                  {recentCapturedOpen && (
                    <div className={s.paymentNestBody}>
                      {paymentRecentCaptured.length > 0 ? (
                        <ul className={s.paymentQueueOpen}>
                          {paymentRecentCaptured.map((row) => {
                            const expanded = expandedCapturedId === row.id;
                            return (
                              <li key={row.id} className={`${s.paymentQueueStack} ${expanded ? s.paymentQueueSelected : ""}`}>
                                <div className={s.paymentQueueRow}>
                                  <div>
                                    <strong>{row.brief.slice(0, 88)}{row.brief.length > 88 ? "…" : ""}</strong>
                                    <p>CAPTURED · max {money.format(row.maxUnitPrice)}</p>
                                  </div>
                                  <button
                                    type="button"
                                    className={s.textButton}
                                    aria-expanded={expanded}
                                    onClick={() => void toggleCapturedPreview(row)}
                                  >
                                    {expanded ? "Collapse" : "View"}
                                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </button>
                                </div>
                                {expanded && (
                                  <div className={s.paymentInlineWindow}>
                                    <div className={s.paymentInlineWindowHead}>
                                      <strong>Capture details</strong>
                                      <button
                                        type="button"
                                        className={s.textButton}
                                        onClick={() => {
                                          setExpandedCapturedId(null);
                                          setCapturedPreview(null);
                                        }}
                                      >
                                        Close
                                      </button>
                                    </div>
                                    {capturedPreviewBusy && capturedPreview?.id === row.id && (
                                      <p className={s.description}>Loading capture details…</p>
                                    )}
                                    {capturedPreview?.id === row.id && (
                                      <dl className={s.summaryList}>
                                        <div><dt>Brief</dt><dd>{capturedPreview.brief}</dd></div>
                                        <div><dt>Status</dt><dd>{capturedPreview.status ?? "CAPTURED"}</dd></div>
                                        {capturedPreview.orderId && <div><dt>Order</dt><dd>{capturedPreview.orderId}</dd></div>}
                                        {capturedPreview.amount && <div><dt>Amount</dt><dd>${capturedPreview.amount} USD</dd></div>}
                                        {capturedPreview.supplierId && <div><dt>Supplier</dt><dd>{capturedPreview.supplierId}</dd></div>}
                                        {capturedPreview.authorizationId && <div><dt>Authorization</dt><dd>{capturedPreview.authorizationId}</dd></div>}
                                        {capturedPreview.tracking && (
                                          <div>
                                            <dt>Tracking</dt>
                                            <dd>{capturedPreview.tracking.carrier} {capturedPreview.tracking.number}</dd>
                                          </div>
                                        )}
                                        {capturedPreview.captureId && <div><dt>Capture</dt><dd>{capturedPreview.captureId}</dd></div>}
                                      </dl>
                                    )}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className={s.tableNote}>No captured orders yet.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {view === "Payments & orders" && !activeOrder && !pendingOwnerApproval && paymentNeedsAttention.length === 0 && <div className={s.empty}>
              <span className={s.emptyIcon}><Package size={26} /></span><h3>No open payment work</h3>
              <p>Checkout a winning offer from Supplier offers, or open an APPROVED / HELD row under Needs attention.</p>
            </div>}
            {view === "Payments & orders" && (
              <DisputePanel setNotice={setNotice} demoRole={demoRole} />
            )}
            <div className={s.paymentFoot}><ShieldCheck size={16} /><span>AI recommendations do not authorize or capture payments.</span></div>
          </section>}

          <footer className={s.footer}>
            <span>ProcureAI · PayPal · Render · AG Grid · Channel3 · Bryntum · KERNEL</span>
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
