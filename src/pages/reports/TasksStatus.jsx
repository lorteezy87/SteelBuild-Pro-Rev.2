/**
 * Tasks Status — counts of schedule_tasks bucketed by status, plus a
 * stacked bar chart of status × phase.
 *
 * One KPI strip across the top (Not Started / In Progress / Complete /
 * Delayed / On Hold), then a per-phase bar chart and a roll-up table.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { PHASES, PHASE_COLORS } from "@/utils/phases";
import ReportShell from "./ReportShell";
import { exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

import {
  TASK_STATUS_KEYS as STATUSES,
  TASK_STATUS_COLORS as STATUS_COLORS,
  countTasksByStatus,
  buildStatusPhaseMatrix,
  phaseTotalsFromMatrix,
  buildStatusPhaseTableRows,
} from "./tasksStatusHelpers";

export default function TasksStatus() {
  const { data: tasks = [] } = useQuery({
    queryKey: ["schedule-tasks-all"],
    queryFn: () => entities.ScheduleTask.list(),
  });

  const totals = useMemo(() => countTasksByStatus(tasks, STATUSES), [tasks]);

  // status × phase matrix
  const matrix = useMemo(
    () => buildStatusPhaseMatrix(tasks, PHASES, STATUSES),
    [tasks],
  );

  // Determine per-phase max for bar scaling
  const phaseTotals = useMemo(
    () => phaseTotalsFromMatrix(matrix, PHASES, STATUSES),
    [matrix],
  );
  const maxPhaseCount = Math.max(1, ...Object.values(phaseTotals));

  const tableRows = useMemo(
    () => buildStatusPhaseTableRows(PHASES, matrix, phaseTotals, STATUSES),
    [matrix, phaseTotals],
  );

  const tableColumns = useMemo(() => ([
    { label: "Phase", key: "phase" },
    ...STATUSES.map((s) => ({ key: s, label: s })),
    { key: "total", label: "Total" },
  ]), []);

  return (
    <ReportShell
      title="Tasks Status"
      count={tasks.length}
      unit=" · TASKS"
      subtitle="Status roll-up across every schedule task in the portfolio."
      onExportCSV={() => exportTableCSV({
        filename: "tasks_status",
        columns: tableColumns,
        rows: tableRows,
        summary: STATUSES.reduce((acc, s) => ({ ...acc, [s]: totals[s] || 0 }), { "Generated": new Date().toLocaleString() }),
      })}
    >
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        {STATUSES.map((s) => (
          <div key={s} style={{ ...CARD, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6, borderTop: `2px solid ${STATUS_COLORS[s]}` }}>
            <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>{s}</div>
            <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{totals[s] || 0}</div>
          </div>
        ))}
      </div>

      {/* Per-phase stacked bars */}
      <div style={{ ...CARD }}>
        <div style={CARD_TITLE}>Status by Phase</div>
        {tasks.length === 0 ? (
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "24px 0", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            No schedule tasks to summarise.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {PHASES.map((phase) => {
              const total = phaseTotals[phase];
              const widthPct = (total / maxPhaseCount) * 100;
              return (
                <div key={phase} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...mono, fontSize: 10, color: "var(--text-secondary)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: PHASE_COLORS[phase] }} />
                      {phase}
                    </span>
                    <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{total}</span>
                  </div>
                  <div style={{ display: "flex", height: 16, borderRadius: 4, overflow: "hidden", background: "var(--bg-surface-low)", width: `${Math.max(8, widthPct)}%`, minWidth: 60 }}>
                    {STATUSES.map((s) => {
                      const c = matrix[phase][s] || 0;
                      if (!c) return null;
                      const segPct = (c / total) * 100;
                      return (
                        <div
                          key={s}
                          title={`${s}: ${c}`}
                          style={{ width: `${segPct}%`, background: STATUS_COLORS[s] }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 6 }}>
              {STATUSES.map((s) => (
                <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[s] }} />
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{s}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cross-tab table */}
      <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
        <div style={{ ...CARD_TITLE, padding: "16px 20px 12px", margin: 0 }}>Phase × Status</div>
        <div style={{ overflowX: "auto" }}>
          <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "var(--bg-surface-low)", borderTop: "1px solid var(--divider)" }}>
                <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Phase</th>
                {STATUSES.map((s) => (
                  <th key={s} style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{s}</th>
                ))}
                <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.phase} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={{ ...body, padding: "10px 14px", color: "var(--text-primary)", fontWeight: 600 }}>{r.phase}</td>
                  {STATUSES.map((s) => (
                    <td key={s} style={{ ...mono, padding: "10px 14px", textAlign: "right", color: r[s] ? "var(--text-primary)" : "var(--text-muted)" }}>{r[s] || "—"}</td>
                  ))}
                  <td style={{ ...mono, padding: "10px 14px", textAlign: "right", color: "var(--text-primary)", fontWeight: 700 }}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
