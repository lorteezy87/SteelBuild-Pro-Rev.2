/**
 * Workload — count of in-progress schedule_tasks per assignee.
 *
 * Bar chart + table. Designed for spotting overloaded resources at
 * a glance. Mirrors WhosDoingWhat but in a numerical / tabular form.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import ReportShell from "./ReportShell";
import ReportTable from "./ReportTable";
import { exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

export default function Workload() {
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => entities.ScheduleTask.list(),
  });

  const rows = useMemo(() => {
    const m = {};
    const ensure = (name) => {
      if (!m[name]) m[name] = { name, inProgress: 0, notStarted: 0, delayed: 0, total: 0 };
      return m[name];
    };
    tasks.forEach((t) => {
      const name = (t.assigned_to || "").trim();
      if (!name) return;
      const r = ensure(name);
      if (t.status === "In Progress") r.inProgress += 1;
      if (t.status === "Not Started") r.notStarted += 1;
      if (t.status === "Delayed") r.delayed += 1;
      if (t.status !== "Complete" && t.status !== "Cancelled") r.total += 1;
    });
    return Object.values(m).sort((a, b) => b.inProgress - a.inProgress);
  }, [tasks]);

  const maxLoad = Math.max(1, ...rows.map((r) => r.inProgress));

  const tableColumns = [
    { key: "name", label: "Assignee", width: "minmax(180px, 2fr)", render: (r) => <span style={{ ...body, color: "var(--text-primary)", fontWeight: 600 }}>{r.name}</span> },
    { key: "inProgress", label: "In Progress", width: "120px", align: "right", render: (r) => <span style={{ ...mono, color: "var(--accent)", fontWeight: 700 }}>{r.inProgress}</span> },
    { key: "notStarted", label: "Not Started", width: "120px", align: "right", render: (r) => <span style={{ ...mono, color: "var(--text-secondary)" }}>{r.notStarted}</span> },
    { key: "delayed", label: "Delayed", width: "100px", align: "right", render: (r) => <span style={{ ...mono, color: r.delayed ? "var(--status-error)" : "var(--text-muted)" }}>{r.delayed}</span> },
    { key: "total", label: "Open Total", width: "110px", align: "right", render: (r) => <span style={{ ...mono, color: "var(--text-primary)", fontWeight: 700 }}>{r.total}</span> },
  ];

  const tableRows = rows.map((r) => ({ id: r.name, ...r }));

  return (
    <ReportShell
      title="Workload"
      count={rows.length}
      unit=" · ASSIGNEES"
      subtitle="In-progress schedule tasks per person — sorted descending. Use to spot overload."
      onExportCSV={() => exportTableCSV({
        filename: "workload",
        columns: tableColumns,
        rows: tableRows,
        summary: { "Assignees": rows.length, "Generated": new Date().toLocaleString() },
      })}
    >
      <div style={{ ...CARD }}>
        <div style={CARD_TITLE}>In-Progress Load</div>
        {rows.length === 0 ? (
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "32px 0", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            No assignees with active work.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.slice(0, 12).map((r) => (
              <div key={r.name} style={{ display: "grid", gridTemplateColumns: "180px 1fr 60px", gap: 12, alignItems: "center" }}>
                <div style={{ ...body, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                <div style={{ height: 10, background: "var(--bg-surface-low)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(r.inProgress / maxLoad) * 100}%`, background: r.inProgress > 5 ? "var(--status-warning)" : "var(--accent)" }} />
                </div>
                <div style={{ ...mono, fontSize: 11, color: "var(--text-primary)", textAlign: "right", fontWeight: 700 }}>{r.inProgress}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ReportTable
        columns={tableColumns}
        rows={tableRows}
        initialSort={{ key: "inProgress", dir: "desc" }}
        emptyText="No active work to balance."
        minWidth={900}
      />
    </ReportShell>
  );
}
