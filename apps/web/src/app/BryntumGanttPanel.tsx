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
  statusLabel?: string;
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

function statusColor(flag?: string, statusLabel?: string): string {
  const key = (statusLabel || flag || "ok").toLowerCase();
  if (key.includes("captured") || key === "ok") return "#16a34a";
  if (key.includes("approved") || key.includes("late") || key.includes("await")) return "#ea580c";
  if (key.includes("held") || key.includes("ship")) return "#2563eb";
  if (key.includes("fail")) return "#dc2626";
  if (key.includes("refund")) return "#7c3aed";
  if (key.includes("dispute")) return "#db2777";
  return "#64748b";
}

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
      // Must use type:"name" once — a plain name field makes Bryntum inject a second Name column.
      columns: [
        {
          text: " ",
          field: "flag",
          width: 36,
          minWidth: 36,
          sortable: false,
          filterable: false,
          align: "center",
          htmlEncode: false,
          renderer: ({ record }: { record: { get?: (f: string) => unknown; flag?: string; statusLabel?: string } }) => {
            const flag = String(record.get?.("flag") ?? record.flag ?? "");
            const statusLabel = String(record.get?.("statusLabel") ?? record.statusLabel ?? "");
            const color = statusColor(flag, statusLabel);
            return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};box-shadow:0 0 0 2px ${color}33"></span>`;
          },
        },
        { type: "name", field: "name", width: 280, text: "Milestone" },
        { type: "startdate", width: 110 },
        { type: "enddate", width: 110 },
      ],
      taskTooltipFeature: {
        template: ({ taskRecord }: { taskRecord: {
          get?: (field: string) => unknown;
          name?: string;
          statusLabel?: string;
          flag?: string;
          note?: string;
          startDate?: Date | string;
          endDate?: Date | string;
        } }) => {
          const read = (field: string) => {
            const viaGet = taskRecord.get?.(field);
            if (viaGet != null && viaGet !== "") return viaGet;
            return (taskRecord as Record<string, unknown>)[field];
          };
          const status = String(read("statusLabel") || read("flag") || "status");
          const note = String(read("note") || "No extra detail");
          const name = String(read("name") || "");
          const startRaw = read("startDate");
          const endRaw = read("endDate");
          const start = startRaw
            ? new Date(startRaw as string | Date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })
            : "—";
          const endDate = endRaw
            ? new Date(endRaw as string | Date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })
            : "—";
          return `
            <div style="padding:4px 2px;max-width:280px;line-height:1.45">
              <div style="font-weight:700;color:#0f2744;margin-bottom:4px">${status}</div>
              <div style="color:#16375f;margin-bottom:6px">${name}</div>
              <div style="color:#5b6f88;font-size:12px">${note}</div>
              <div style="color:#8090a5;font-size:11px;margin-top:6px">${start} → ${endDate}</div>
            </div>
          `;
        },
      },
      project: {
        autoSetConstraints: true,
        tasksData: tasks.map((t) => ({
          id: t.id,
          name: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
          duration: t.duration,
          manuallyScheduled: t.manuallyScheduled ?? true,
          cls: t.cls ?? (t.flag && t.flag !== "ok" ? `flag-${t.flag}` : undefined),
          eventColor: t.eventColor ?? statusColor(t.flag, t.statusLabel),
          note: t.note,
          flag: t.flag,
          statusLabel: t.statusLabel ?? t.flag ?? "ok",
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
      <style>{`
        .bryntum-gantt-host .b-tree-icon,
        .bryntum-gantt-host .b-icon-tree-leaf,
        .bryntum-gantt-host .b-icon-tree-expand,
        .bryntum-gantt-host .b-icon-tree-collapse {
          display: none !important;
        }
      `}</style>
      <BryntumGantt key={tasks.map((t) => `${t.id}:${t.startDate}:${t.flag}`).join("|")} {...ganttProps} />
    </div>
  );
}
