/**
 * Weekly Status Reports — week-by-week roll-up of activity.
 *
 * Source: drawing_activity (1772+ rows, populated). The activities
 * table was inspected and is empty — switching to drawing_activity
 * gives a meaningful audit trail without inventing schema.
 *
 * Output: per-week table grouped by event_type with week-on-week
 * deltas. Last 8 ISO weeks.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import ReportShell from "./ReportShell";
import { exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

import {
  lastNWeekKeys,
  isoWeekStart,
  buildWeeklyActivityMatrix,
} from "./weeklyReportHelpers";

export default function WeeklyStatusReports() {
  const { data: activity = [] } = useQuery({
    queryKey: ["drawing-activity-all"],
    queryFn: () => entities.DrawingActivity.list(),
  });

  const weekKeys = useMemo(() => lastNWeekKeys(8), []);

  const { matrix, eventTypes, weeklyTotals } = useMemo(
    () => buildWeeklyActivityMatrix(activity, weekKeys),
    [activity, weekKeys],
  );

  const tableRows = weekKeys.map((k, i) => {
    const ws = isoWeekStart(k);
    const total = weeklyTotals[k] || 0;
    const prevTotal = i > 0 ? (weeklyTotals[weekKeys[i - 1]] || 0) : 0;
    const delta = total - prevTotal;
    return {
      id: k,
      weekKey: k,
      weekLabel: ws.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }),
      total,
      delta,
      ...eventTypes.reduce((acc, t) => ({ ...acc, [t]: matrix[k][t] || 0 }), {}),
    };
  });

  const tableColumns = [
    { key: "weekLabel", label: "Week of" },
    ...eventTypes.map((t) => ({ key: t, label: t })),
    { key: "total", label: "Total" },
    { key: "delta", label: "Δ vs prior" },
  ];

  const grandTotal = tableRows.reduce((s, r) => s + r.total, 0);

  return (
    <ReportShell
      title="Weekly Status Reports"
      count={weekKeys.length}
      unit=" · WEEKS"
      subtitle={`${grandTotal} drawing-activity events over the last ${weekKeys.length} weeks (sourced from drawing_activity — activities table is empty).`}
      onExportCSV={() => exportTableCSV({
        filename: "weekly_status_reports",
        columns: tableColumns,
        rows: tableRows,
        summary: { "Total Events": grandTotal, "Weeks": weekKeys.length, "Generated": new Date().toLocaleString() },
      })}
    >
      <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
        <div style={{ ...CARD_TITLE, padding: "16px 20px", margin: 0 }}>Activity Roll-up by Event Type</div>
        {grandTotal === 0 ? (
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "32px 0", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            No activity in the last {weekKeys.length} weeks.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ background: "var(--bg-surface-low)", borderTop: "1px solid var(--divider)" }}>
                  <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Week of</th>
                  {eventTypes.map((t) => (
                    <th key={t} style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{t}</th>
                  ))}
                  <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Total</th>
                  <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={r.weekKey} style={{ borderTop: "1px solid var(--divider)" }}>
                    <td style={{ ...body, padding: "10px 14px", color: "var(--text-primary)", fontWeight: 600 }}>{r.weekLabel}</td>
                    {eventTypes.map((t) => (
                      <td key={t} style={{ ...mono, padding: "10px 14px", textAlign: "right", color: r[t] ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {r[t] || "—"}
                      </td>
                    ))}
                    <td style={{ ...mono, padding: "10px 14px", textAlign: "right", color: "var(--text-primary)", fontWeight: 700 }}>{r.total}</td>
                    <td style={{ ...mono, padding: "10px 14px", textAlign: "right", color: i === 0 ? "var(--text-muted)" : (r.delta > 0 ? "var(--status-success)" : r.delta < 0 ? "var(--status-error)" : "var(--text-muted)") }}>
                      {i === 0 ? "—" : (r.delta > 0 ? `+${r.delta}` : r.delta)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ReportShell>
  );
}
