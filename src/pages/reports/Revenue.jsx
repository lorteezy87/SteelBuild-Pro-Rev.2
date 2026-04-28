/**
 * Revenue — billed revenue by month, last 12 months.
 *
 * Source: sov_items. For each row, billed = scheduled_value *
 * (current_percent_complete / 100). Allocation month = submitted_date
 * if present, else updated_at. Rows without scheduled_value are skipped.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ReportShell from "./ReportShell";
import { LineChartSVG } from "./charts";
import { formatCurrencyFull, exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function lastNMonthKeys(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

export default function Revenue() {
  const { data: sov = [] } = useQuery({
    queryKey: ["sov-items"],
    queryFn: () => base44.entities.SOVItem.list(),
  });

  const monthKeys = useMemo(() => lastNMonthKeys(12), []);

  const monthlyBilled = useMemo(() => {
    const buckets = Object.fromEntries(monthKeys.map((k) => [k, 0]));
    for (const row of sov) {
      const sv = Number(row.scheduled_value) || 0;
      const pct = Number(row.current_percent_complete) || 0;
      if (!sv || pct <= 0) continue;
      const billed = sv * (pct / 100);
      const dateSrc = row.submitted_date || row.updated_at;
      if (!dateSrc) continue;
      const k = monthKey(dateSrc);
      if (k in buckets) buckets[k] += billed;
    }
    return buckets;
  }, [sov, monthKeys]);

  const data = useMemo(() => monthKeys.map((k) => ({
    label: monthLabel(k),
    monthKey: k,
    value: monthlyBilled[k] || 0,
  })), [monthKeys, monthlyBilled]);

  const total = useMemo(() => data.reduce((s, r) => s + r.value, 0), [data]);
  const peak = useMemo(() => data.reduce((mx, r) => (r.value > mx.value ? r : mx), data[0] || { value: 0, label: "—" }), [data]);
  const avg = data.length ? total / data.length : 0;

  const tableRows = data.map((r, i) => ({ id: r.monthKey, ...r, idx: i }));
  const tableColumns = [
    { key: "label", label: "Month" },
    { key: "value", label: "Billed" },
  ];

  return (
    <ReportShell
      title="Revenue"
      count={12}
      unit=" · MONTHS"
      subtitle="Billed revenue (scheduled value × % complete) by month, last 12 months."
      onExportCSV={() => exportTableCSV({
        filename: "revenue_monthly",
        columns: tableColumns,
        rows: tableRows,
        summary: {
          "12-Month Total": formatCurrencyFull(total),
          "Average / Month": formatCurrencyFull(avg),
          "Peak Month": `${peak.label} (${formatCurrencyFull(peak.value)})`,
          "Generated": new Date().toLocaleString(),
        },
      })}
    >
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>12-month total</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>{formatCurrencyFull(total)}</div>
        </div>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>Avg / month</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>{formatCurrencyFull(avg)}</div>
        </div>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>Peak month</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--accent)", marginTop: 6 }}>{formatCurrencyFull(peak.value)}</div>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>{peak.label}</div>
        </div>
      </div>

      <div style={{ ...CARD }}>
        <div style={CARD_TITLE}>Monthly Trend</div>
        {total === 0 ? (
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "32px 0", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            No billed revenue in the last 12 months.
          </div>
        ) : (
          <LineChartSVG data={data} />
        )}
      </div>

      <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
        <div style={{ ...CARD_TITLE, padding: "16px 20px", margin: 0 }}>Monthly Detail</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg-surface-low)", borderTop: "1px solid var(--divider)" }}>
              <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Month</th>
              <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Billed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.monthKey} style={{ borderTop: "1px solid var(--divider)" }}>
                <td style={{ ...body, padding: "10px 14px", color: "var(--text-primary)" }}>{r.label}</td>
                <td style={{ ...mono, padding: "10px 14px", textAlign: "right", color: r.value ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {r.value ? formatCurrencyFull(r.value) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}
