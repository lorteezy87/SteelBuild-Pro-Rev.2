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
import { base44 } from "@/api/base44Client";
import ReportShell from "./ReportShell";
import { exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function isoWeekStart(yearWeekKey) {
  const [y, w] = yearWeekKey.split("-W").map(Number);
  const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
  const day = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - day + 1);
  return monday;
}

function lastNWeekKeys(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i * 7);
    out.push(isoWeekKey(d));
  }
  return Array.from(new Set(out));
}

export default function WeeklyStatusReports() {
  const { data: activity = [] } = useQuery({
    queryKey: ["drawing-activity-all"],
    queryFn: () => base44.entities.DrawingActivity.list(),
  });

  const weekKeys = useMemo(() => lastNWeekKeys(8), []);

  const { matrix, eventTypes, weeklyTotals } = useMemo(() => {
    const m = {};
    weekKeys.forEach((k) => { m[k] = {}; });
    const types = new Set();
    for (const e of activity) {
      const ts = e.created_at || e.timestamp;
      if (!ts) continue;
      const wk = isoWeekKey(new Date(ts));
      if (!(wk in m)) continue;
      const t = e.event_type || "other";
      m[wk][t] = (m[wk][t] || 0) + 1;
      types.add(t);
    }
    const typeList = Array.from(types).sort();
    const totals = Object.fromEntries(weekKeys.map((k) => [k, typeList.reduce((s, t) => s + (m[k][t] || 0), 0)]));
    return { matrix: m, eventTypes: typeList, weeklyTotals: totals };
  }, [activity, weekKeys]);

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
