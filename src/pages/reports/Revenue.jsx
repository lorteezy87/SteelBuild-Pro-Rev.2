/**
 * Revenue — billed revenue by month, last 12 months.
 *
 * Source: sov_items. For each Certified pay-app row, the month's
 * billing is the period delta — scheduled_value × (current_pct −
 * previous_pct) / 100 — bucketed on `period_to` (or `submitted_date`
 * when period_to is missing). Drafts and uncertified rows are skipped
 * so the same line item isn't counted twice when both a Draft and a
 * Certified row exist for the same period.
 *
 * Pre-fix this page summed `scheduled_value × current_pct / 100` over
 * EVERY row (Draft + Certified across all apps), which double/triple-
 * counted billings. See `certifiedPeriodDeltas` in projectMetrics.js
 * for the math and the model assumptions.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { certifiedPeriodDeltas } from "@/pages/dashboard/projectMetrics";
import ReportShell from "./ReportShell";
import { LineChartSVG } from "./charts";
import { formatCurrencyFull, exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";
import {
  lastNMonthKeys,
  bucketMonthlyBilled,
  buildRevenueHistorySeries,
  sumSeriesValues,
  peakSeriesPoint,
} from "./revenueForecastHelpers";

export default function Revenue() {
  const { data: sov = [] } = useQuery({
    queryKey: ["sov-items"],
    queryFn: () => entities.SOVItem.list(),
  });

  const monthKeys = useMemo(() => lastNMonthKeys(12), []);

  // Period delta over Certified rows only — see projectMetrics.js.
  // Bucket on period_to (the application's billing period close), or
  // submitted_date when period_to is missing.
  const monthlyBilled = useMemo(
    () => bucketMonthlyBilled(certifiedPeriodDeltas(sov), monthKeys),
    [sov, monthKeys],
  );

  const data = useMemo(
    () => buildRevenueHistorySeries(monthKeys, monthlyBilled),
    [monthKeys, monthlyBilled],
  );

  const total = useMemo(() => sumSeriesValues(data), [data]);
  const peak = useMemo(() => peakSeriesPoint(data), [data]);
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
        <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse" }}>
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
