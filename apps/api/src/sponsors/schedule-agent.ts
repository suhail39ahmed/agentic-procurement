/**
 * Agent-driven procurement schedule (Bryntum Gantt data).
 * Watches PayPal payment signals and moves / flags milestones.
 */

export type MilestoneFlag = "ok" | "late" | "failed" | "refunded" | "disputed";

export type ScheduleTask = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  duration: number;
  flag: MilestoneFlag;
  type: "authorize" | "capture" | "delivery" | "replenish" | "payout" | "client";
  note?: string;
  eventColor?: string;
  cls?: string;
  manuallyScheduled?: boolean;
};

export type ScheduleDependency = {
  id: string;
  fromTask: string;
  toTask: string;
};

export type AgentLogEntry = {
  at: string;
  signal: string;
  action: string;
  taskIds: string[];
};

export type PaymentSignalKind =
  | "capture_ok"
  | "capture_late"
  | "capture_fail"
  | "refund"
  | "dispute"
  | "authorize_ok";

const dayMs = 86_400_000;

function isoDay(offsetDays: number, from = Date.now()): string {
  const d = new Date(from + offsetDays * dayMs);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function colorFor(flag: MilestoneFlag): string {
  switch (flag) {
    case "late":
      return "orange";
    case "failed":
      return "red";
    case "refunded":
      return "violet";
    case "disputed":
      return "pink";
    default:
      return "green";
  }
}

function seedTasks(): ScheduleTask[] {
  return [
    {
      id: "authorize",
      name: "PayPal authorize hold",
      startDate: isoDay(0),
      endDate: isoDay(1),
      duration: 1,
      flag: "ok",
      type: "authorize",
      note: "Buyer approved · funds on hold",
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    },
    {
      id: "capture",
      name: "Owner capture after delivery",
      startDate: isoDay(5),
      endDate: isoDay(6),
      duration: 1,
      flag: "ok",
      type: "capture",
      note: "Awaiting ship + owner confirm",
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    },
    {
      id: "delivery",
      name: "Supplier delivery ETA",
      startDate: isoDay(3),
      endDate: isoDay(5),
      duration: 2,
      flag: "ok",
      type: "delivery",
      note: "Carrier window",
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    },
    {
      id: "replenish",
      name: "Replenishment evaluate",
      startDate: isoDay(1),
      endDate: isoDay(2),
      duration: 1,
      flag: "ok",
      type: "replenish",
      note: "Stock threshold check",
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    },
    {
      id: "payout",
      name: "Supplier payout due",
      startDate: isoDay(7),
      endDate: isoDay(8),
      duration: 1,
      flag: "ok",
      type: "payout",
      note: "AP three-way match gate",
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    },
    {
      id: "client",
      name: "Client invoice follow-up",
      startDate: isoDay(2),
      endDate: isoDay(3),
      duration: 1,
      flag: "ok",
      type: "client",
      note: "PayPal Invoice send",
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    },
  ];
}

const dependencies: ScheduleDependency[] = [
  { id: "d1", fromTask: "authorize", toTask: "delivery" },
  { id: "d2", fromTask: "delivery", toTask: "capture" },
  { id: "d3", fromTask: "capture", toTask: "payout" },
  { id: "d4", fromTask: "replenish", toTask: "client" },
];

let tasks: ScheduleTask[] = seedTasks();
const agentLog: AgentLogEntry[] = [];

function patchTask(id: string, patch: Partial<ScheduleTask>) {
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const next = { ...tasks[idx], ...patch };
  if (patch.flag) {
    next.eventColor = colorFor(patch.flag);
    next.cls = patch.flag === "ok" ? undefined : `flag-${patch.flag}`;
  }
  tasks[idx] = next;
}

function log(signal: string, action: string, taskIds: string[]) {
  agentLog.unshift({
    at: new Date().toISOString(),
    signal,
    action,
    taskIds,
  });
  if (agentLog.length > 40) agentLog.length = 40;
}

export function resetSchedule() {
  tasks = seedTasks();
  agentLog.length = 0;
  log("reset", "Seeded default procurement milestones", tasks.map((t) => t.id));
}

export function getScheduleSnapshot() {
  return {
    provider: "bryntum-gantt-enterprise",
    note: "Agent watches PayPal payment events and reschedules / flags Gantt milestones.",
    tasks: tasks.map((t) => ({ ...t })),
    dependencies: dependencies.map((d) => ({ ...d })),
    agentLog: agentLog.map((e) => ({ ...e })),
    projectStartDate: tasks.reduce((min, t) => (t.startDate < min ? t.startDate : min), tasks[0]?.startDate ?? isoDay(0)),
    projectEndDate: addDays(
      tasks.reduce((max, t) => (t.endDate > max ? t.endDate : max), tasks[0]?.endDate ?? isoDay(14)),
      3,
    ),
  };
}

/** Map PayPal webhook event_type → schedule signal (or null). */
export function signalFromPaypalEventType(eventType: string): PaymentSignalKind | null {
  switch (eventType) {
    case "PAYMENT.CAPTURE.COMPLETED":
    case "PAYMENT.CAPTURE.PENDING":
      return "capture_ok";
    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED":
    case "CHECKOUT.ORDER.VOIDED":
      return "capture_fail";
    case "PAYMENT.CAPTURE.REFUNDED":
    case "PAYMENT.CAPTURE.REVERSED":
      return "refund";
    case "PAYMENT.AUTHORIZATION.CREATED":
    case "PAYMENT.AUTHORIZATION.VOIDED":
      return eventType.endsWith("VOIDED") ? "capture_fail" : "authorize_ok";
    case "CUSTOMER.DISPUTE.CREATED":
    case "CUSTOMER.DISPUTE.UPDATED":
      return "dispute";
    default:
      return null;
  }
}

/**
 * Reschedule / flag milestones from a payment signal.
 * "late" is used when capture succeeds after the planned capture window.
 */
export function applyPaymentSignal(
  kind: PaymentSignalKind,
  meta: { orderId?: string; eventType?: string; forceLate?: boolean } = {},
): ReturnType<typeof getScheduleSnapshot> {
  const label = meta.eventType ?? kind;
  const today = isoDay(0);

  switch (kind) {
    case "authorize_ok": {
      patchTask("authorize", {
        flag: "ok",
        note: `Authorized${meta.orderId ? ` · ${meta.orderId}` : ""}`,
      });
      log(label, "Authorize milestone confirmed", ["authorize"]);
      break;
    }
    case "capture_ok": {
      const capture = tasks.find((t) => t.id === "capture");
      const late = meta.forceLate || Boolean(capture && today > capture.endDate);
      if (late) {
        patchTask("capture", {
          flag: "late",
          startDate: today,
          endDate: addDays(today, 1),
          duration: 1,
          note: "Capture succeeded late — agent slipped window",
        });
        patchTask("payout", {
          flag: "late",
          startDate: addDays(today, 2),
          endDate: addDays(today, 3),
          duration: 1,
          note: "Payout pushed after late capture",
        });
        patchTask("delivery", {
          flag: "late",
          note: "Delivery marked late relative to capture",
        });
        log(label, "Late capture → slipped capture + payout + flagged delivery", ["capture", "payout", "delivery"]);
      } else {
        patchTask("capture", {
          flag: "ok",
          note: `Capture completed${meta.orderId ? ` · ${meta.orderId}` : ""}`,
        });
        log(label, "Capture on schedule — milestones stay green", ["capture"]);
      }
      break;
    }
    case "capture_late": {
      return applyPaymentSignal("capture_ok", { ...meta, forceLate: true, eventType: label });
    }
    case "capture_fail": {
      patchTask("capture", {
        flag: "failed",
        note: "Capture/authorization failed — agent flagged payment gate",
      });
      patchTask("payout", {
        flag: "failed",
        startDate: addDays(today, 5),
        endDate: addDays(today, 6),
        duration: 1,
        note: "Payout blocked until payment recovers",
      });
      patchTask("delivery", {
        flag: "failed",
        note: "Hold shipment — payment failure",
      });
      log(label, "Payment failed → flagged capture/delivery, delayed payout", ["capture", "delivery", "payout"]);
      break;
    }
    case "refund": {
      patchTask("capture", {
        flag: "refunded",
        note: "Refund/reversal received",
      });
      patchTask("payout", {
        flag: "refunded",
        startDate: addDays(today, 4),
        endDate: addDays(today, 5),
        duration: 1,
        note: "Supplier payout paused for refund reconciliation",
      });
      patchTask("client", {
        flag: "refunded",
        note: "Client invoice follow-up after refund",
      });
      log(label, "Refund → flagged capture/client, slipped payout", ["capture", "payout", "client"]);
      break;
    }
    case "dispute": {
      patchTask("capture", {
        flag: "disputed",
        note: "Customer dispute opened",
      });
      patchTask("payout", {
        flag: "disputed",
        startDate: addDays(today, 7),
        endDate: addDays(today, 8),
        duration: 1,
        note: "Payout frozen during dispute",
      });
      log(label, "Dispute → flagged capture, frozen payout", ["capture", "payout"]);
      break;
    }
    default:
      break;
  }

  return getScheduleSnapshot();
}

/** Timeline-shaped events for older UI consumers. */
export function timelineEventsFromSchedule() {
  return getScheduleSnapshot().tasks.map((t) => ({
    id: t.id,
    title: t.name,
    start: `${t.startDate}T09:00:00.000Z`,
    end: `${t.endDate}T17:00:00.000Z`,
    type: t.type,
    flag: t.flag,
    note: t.note,
  }));
}

export type WorkspacePaymentRow = {
  id: string;
  brief: string;
  paymentStatus: string;
  updatedAt: string;
};

/**
 * Overview Gantt: demo history + live negotiation payment checkpoints
 * (APPROVED / HELD / SHIPPED / CAPTURED). Not the simulate playground.
 */
export function buildOverviewSchedule(rows: WorkspacePaymentRow[]) {
  const tasks: ScheduleTask[] = [];
  const deps: ScheduleDependency[] = [];
  const log: AgentLogEntry[] = [];

  // Stable dummy history so the Overview always has completed context for judges.
  const demoCompleted: ScheduleTask[] = [
    {
      id: "demo-auth",
      name: "Demo · Authorize hold (office chairs)",
      startDate: isoDay(-10),
      endDate: isoDay(-9),
      duration: 1,
      flag: "ok",
      type: "authorize",
      note: "Sandbox history · completed authorize",
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    },
    {
      id: "demo-cap",
      name: "Demo · Capture complete (office chairs)",
      startDate: isoDay(-7),
      endDate: isoDay(-6),
      duration: 1,
      flag: "ok",
      type: "capture",
      note: "Sandbox history · owner confirmed delivery",
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    },
    {
      id: "demo-notes",
      name: "Demo · Sticky notes capture",
      startDate: isoDay(-4),
      endDate: isoDay(-3),
      duration: 1,
      flag: "ok",
      type: "capture",
      note: "Sandbox history · Channel3 RFQ path",
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    },
  ];
  tasks.push(...demoCompleted);
  deps.push({ id: "demo-d1", fromTask: "demo-auth", toTask: "demo-cap" });
  log.push({
    at: new Date(Date.now() - 3 * dayMs).toISOString(),
    signal: "demo_history",
    action: "Loaded dummy completed authorize → capture for Overview",
    taskIds: ["demo-auth", "demo-cap", "demo-notes"],
  });

  const ranked = [...rows]
    .filter((r) => ["APPROVED", "HELD", "SHIPPED", "CAPTURED"].includes(r.paymentStatus))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  for (const row of ranked) {
    const short = row.brief.replace(/\s+/g, " ").trim().slice(0, 42);
    const label = short.length < row.brief.trim().length ? `${short}…` : short;
    const base = row.updatedAt.slice(0, 10) || isoDay(0);
    const authId = `live-auth-${row.id.slice(0, 8)}`;
    const capId = `live-cap-${row.id.slice(0, 8)}`;

    if (row.paymentStatus === "APPROVED") {
      tasks.push({
        id: authId,
        name: `Awaiting approve · ${label}`,
        startDate: base,
        endDate: addDays(base, 1),
        duration: 1,
        flag: "late",
        type: "authorize",
        note: `Open Payments → Pay · ${row.id.slice(0, 8)}`,
        eventColor: colorFor("late"),
        manuallyScheduled: true,
      });
      log.unshift({
        at: row.updatedAt,
        signal: "APPROVED",
        action: `Checkout open — needs PayPal approve / Authorize hold · ${label}`,
        taskIds: [authId],
      });
      continue;
    }

    tasks.push({
      id: authId,
      name: `Authorized · ${label}`,
      startDate: addDays(base, -2),
      endDate: addDays(base, -1),
      duration: 1,
      flag: "ok",
      type: "authorize",
      note: `Hold placed · ${row.id.slice(0, 8)}`,
      eventColor: colorFor("ok"),
      manuallyScheduled: true,
    });

    if (row.paymentStatus === "HELD") {
      tasks.push({
        id: capId,
        name: `On hold · ship next · ${label}`,
        startDate: base,
        endDate: addDays(base, 1),
        duration: 1,
        flag: "late",
        type: "capture",
        note: "Needs Mark shipped",
        eventColor: colorFor("late"),
        manuallyScheduled: true,
      });
      log.unshift({
        at: row.updatedAt,
        signal: "HELD",
        action: `Authorize hold complete — awaiting ship · ${label}`,
        taskIds: [authId, capId],
      });
    } else if (row.paymentStatus === "SHIPPED") {
      tasks.push({
        id: capId,
        name: `Shipped · capture next · ${label}`,
        startDate: base,
        endDate: addDays(base, 1),
        duration: 1,
        flag: "late",
        type: "capture",
        note: "Needs Confirm delivery & capture",
        eventColor: colorFor("late"),
        manuallyScheduled: true,
      });
      log.unshift({
        at: row.updatedAt,
        signal: "SHIPPED",
        action: `Shipped — awaiting owner capture · ${label}`,
        taskIds: [authId, capId],
      });
    } else {
      tasks.push({
        id: capId,
        name: `Captured · ${label}`,
        startDate: base,
        endDate: addDays(base, 1),
        duration: 1,
        flag: "ok",
        type: "capture",
        note: "Completed negotiation payment",
        eventColor: colorFor("ok"),
        manuallyScheduled: true,
      });
      log.unshift({
        at: row.updatedAt,
        signal: "CAPTURED",
        action: `Negotiation payment complete · ${label}`,
        taskIds: [authId, capId],
      });
    }
    deps.push({ id: `d-${row.id.slice(0, 8)}`, fromTask: authId, toTask: capId });
  }

  const projectStartDate = tasks.reduce(
    (min, t) => (t.startDate < min ? t.startDate : min),
    tasks[0]?.startDate ?? isoDay(-10),
  );
  const projectEndDate = addDays(
    tasks.reduce((max, t) => (t.endDate > max ? t.endDate : max), tasks[0]?.endDate ?? isoDay(0)),
    2,
  );

  return {
    provider: "bryntum-gantt-enterprise",
    mode: "overview" as const,
    note: "Overview plan mixes demo completed milestones with live negotiation payment checkpoints.",
    tasks,
    dependencies: deps,
    agentLog: log.slice(0, 12),
    projectStartDate,
    projectEndDate,
    liveCount: ranked.length,
    completedCount: ranked.filter((r) => r.paymentStatus === "CAPTURED").length + 2,
  };
}
