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
