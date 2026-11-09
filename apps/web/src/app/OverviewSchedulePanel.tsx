"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import s from "./dashboard.module.css";
import type { GanttDependency, GanttTaskRow } from "./BryntumGanttPanel";

const BryntumGanttPanel = dynamic(
  () => import("./BryntumGanttPanel").then((m) => m.BryntumGanttPanel),
  { ssr: false, loading: () => <p className={s.description}>Loading Bryntum Gantt…</p> },
);

type OverviewSchedule = {
  note?: string;
  tasks?: GanttTaskRow[];
  dependencies?: GanttDependency[];
  projectStartDate?: string;
  projectEndDate?: string;
  liveCount?: number;
  completedCount?: number;
  error?: string;
};

export function OverviewSchedulePanel({ setNotice }: { setNotice: (value: string) => void }) {
  const [schedule, setSchedule] = useState<OverviewSchedule | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/sponsors/schedule/overview", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as OverviewSchedule;
      if (!response.ok) {
        setNotice(payload.error ?? "Could not load overview schedule.");
        return;
      }
      setSchedule(payload);
    } finally {
      setBusy(false);
    }
  }, [setNotice]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const tasks = schedule?.tasks ?? [];
  const dependencies = schedule?.dependencies ?? [];

  return (
    <section className={`${s.card} ${s.stretchCard}`} style={{ gridColumn: "1 / -1" }}>
      <div className={s.sectionHeader}>
        <div className={s.inlineTitle}>
          <span className={s.iconTile}><CalendarDays size={20} /></span>
          <div>
            <h2>Payment plan · live checkouts</h2>
            <p className={s.description}>
              {schedule?.note ?? "Authorize → capture checkpoints from real negotiations."}
              {" "}Status dots: green = done, orange = needs action, blue = on hold.
              {schedule?.liveCount != null ? ` · ${schedule.liveCount} open · ${schedule.completedCount ?? 0} captured` : ""}
            </p>
          </div>
        </div>
        <button type="button" className={s.secondary} disabled={busy} title="Reload workspace schedule" onClick={() => void load()}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className={s.tableNote}>
          No payment checkpoints yet. After Checkout → Authorize hold (and capture), bars appear here from live negotiations.
        </p>
      ) : (
        <BryntumGanttPanel
          tasks={tasks}
          dependencies={dependencies}
          projectStartDate={schedule?.projectStartDate}
          projectEndDate={schedule?.projectEndDate}
        />
      )}
    </section>
  );
}
