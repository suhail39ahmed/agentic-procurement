"use client";

import { useMemo } from "react";
import { BryntumGantt } from "@bryntum/gantt-react-enterprise";
import type { BryntumGanttProps } from "@bryntum/gantt-react-enterprise";
import "@bryntum/core-enterprise/fontawesome/css/fontawesome.css";
import "@bryntum/core-enterprise/fontawesome/css/solid.css";
import "@bryntum/gantt-enterprise/gantt.css";
import "@bryntum/gantt-enterprise/svalbard-light.css";

export type GanttTaskRow = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  duration: number;
  flag?: string;
  note?: string;
  eventColor?: string;
  cls?: string;
  manuallyScheduled?: boolean;
};

export type GanttDependency = {
  id: string;
  fromTask: string;
  toTask: string;
};

function registerLicense() {
  const key =
    process.env.NEXT_PUBLIC_BRYNTUM_LICENSE_KEY
    || process.env.VITE_BRYNTUM_LICENSE_KEY
    || "";
  const g = globalThis as typeof globalThis & { bryntum?: { licenseKey?: string } };
  g.bryntum ??= {};
  if (key.trim()) g.bryntum.licenseKey = key.trim();
}

registerLicense();

export function BryntumGanttPanel({
  tasks,
  dependencies,
  projectStartDate,
  projectEndDate,
}: {
  tasks: GanttTaskRow[];
  dependencies: GanttDependency[];
  projectStartDate?: string;
  projectEndDate?: string;
}) {
  const ganttProps = useMemo((): BryntumGanttProps => {
    registerLicense();
    const start = projectStartDate ?? tasks[0]?.startDate ?? new Date().toISOString().slice(0, 10);
    const end = projectEndDate
      ?? tasks.reduce((max, t) => (t.endDate > max ? t.endDate : max), start);
    return {
      startDate: start,
      endDate: end,
      viewPreset: "weekAndDayLetter",
      barMargin: 8,
      rowHeight: 42,
      columns: [
        { type: "name", field: "name", width: 220, text: "Milestone" },
        { type: "startdate", width: 110 },
        { type: "enddate", width: 110 },
      ],
      project: {
        autoSetConstraints: true,
        tasksData: tasks.map((t) => ({
          id: t.id,
          name: t.flag && t.flag !== "ok" ? `${t.name} [${t.flag}]` : t.name,
          startDate: t.startDate,
          endDate: t.endDate,
          duration: t.duration,
          manuallyScheduled: t.manuallyScheduled ?? true,
          cls: t.cls,
          eventColor: t.eventColor,
          note: t.note,
        })),
        dependenciesData: dependencies.map((d) => ({
          id: d.id,
          fromTask: d.fromTask,
          toTask: d.toTask,
        })),
      },
    };
  }, [tasks, dependencies, projectStartDate, projectEndDate]);

  if (tasks.length === 0) {
    return <p className="bryntum-gantt-fallback">Waiting for schedule tasks…</p>;
  }

  return (
    <div className="bryntum-gantt-host" style={{ height: 420, width: "100%" }}>
      <BryntumGantt key={tasks.map((t) => `${t.id}:${t.startDate}:${t.flag}`).join("|")} {...ganttProps} />
    </div>
  );
}
