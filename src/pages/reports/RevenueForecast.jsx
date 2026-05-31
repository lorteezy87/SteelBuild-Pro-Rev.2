/**
 * Revenue Forecast — last 12 months historical billed plus 6-month
 * forecast extrapolated from the trailing-3-month average burn rate.
 *
 * Forecast points render as dashed segments via LineChartSVG's
 * `forecast: true` flag. Rough but honest: a single linear projection
 * off recent burn, no seasonality, no ML.
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { certifiedPeriodDeltas } from "@/pages/dashboard/projectMetrics";
import ReportShell from "./ReportShell";
import { LineChartSVG } from "./charts";
import { formatCurrencyFull, exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";
import { formatLocalDate } from "@/utils/dates";

function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return formatLocalDate(y, m - 1, 1, "en-US", { month: "short", year: "2-digit" });
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
function nextNMonthKeys(n) {
  const out = [];
  const now = new Date();
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push(monthKey(d));
  }
  return out;
}

export default function RevenueForecast() {
  const { data: sov = [] } = useQuery({
    queryKey: ["sov-items"],
    queryFn: () => entities.SOVItem.list(),
  });

  const histKeys = useMemo(() => lastNMonthKeys(12), []);
  const fcastKeys = useMemo(() => nextNMonthKeys(6), []);

  const monthlyBilled = useMemo(() => {
    const buckets = Object.fromEntries(histKeys.map((k) => [k, 0]));
    // Period delta over Certified rows only — same approach as
    // Revenue.jsx so the forecast baseline matches the trend chart.
    for (const d of certifiedPeriodDeltas(sov)) {
      const dateSrc = d.periodTo || d.submittedDate;
      if (!dateSrc) continue;
      const k = monthKey(dateSrc);
      if (k in buckets) buckets[k] += d.delta;
    }
    return buckets;
  }, [sov, histKeys]);

  // Trailing 3-month average for forecast
  const trailing3 = useMemo(() => {
    const last3 = histKeys.slice(-3);
    const sum = last3.reduce((s, k) => s + (monthlyBilled[k] || 0), 0);
    return last3.length ? sum / last3.length : 0;
  }, [histKeys, monthlyBilled]);

  const data = useMemo(() => {
    const hist = histKeys.map((k) => ({ label: monthLabel(k), monthKey: k, value: monthlyBilled[k] || 0, forecast: false }));
    const fcast = fcastKeys.map((k) => ({ label: monthLabel(k), monthKey: k, value: trailing3, forecast: true }));
    return [...hist, ...fcast];
  }, [histKeys, fcastKeys, monthlyBilled, trailing3]);

  const histTotal = histKeys.reduce((s, k) => s + (monthlyBilled[k] || 0), 0);
  const fcastTotal = trailing3 * fcastKeys.length;

  const tableRows = data.map((r, i) => ({ id: r.monthKey, idx: i, ...r }));
  const tableColumns = [
    { key: "label", label: "Month" },
    { key: "value", label: "Billed", csvValue: (r) => r.value.toFixed(2) },
    { key: "forecast", label: "Forecast?", csvValue: (r) => (r.forecast ? "Yes" : "") },
  ];

  return (
    <ReportShell
      title="Revenue Forecast"
      count={6}
      unit=" · MONTHS AHEAD"
      subtitle="Trailing-3-month average projected forward 6 months. Solid line = historical, dashed = forecast."
      onExportCSV={() => exportTableCSV({
        filename: "revenue_forecast",
        columns: tableColumns,
        rows: tableRows,
        summary: {
          "12-Month Historical": formatCurrencyFull(histTotal),
          "6-Month Forecast": formatCurrencyFull(fcastTotal),
          "Trailing-3 Avg": formatCurrencyFull(trailing3),
          "Generated": new Date().toLocaleString(),
        },
      })}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>12-mo historical</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>{formatCurrencyFull(histTotal)}</div>
        </div>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>6-mo forecast</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--accent)", marginTop: 6 }}>{formatCurrencyFull(fcastTotal)}</div>
        </div>
        <div style={{ ...CARD }}>
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 }}>Trailing-3 avg</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginTop: 6 }}>{formatCurrencyFull(trailing3)}</div>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>per month</div>
        </div>
      </div>

      <div style={{ ...CARD }}>
        <div style={CARD_TITLE}>Historical + Forecast</div>
        {histTotal === 0 && fcastTotal === 0 ? (
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "32px 0", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Not enough data to forecast.
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
              <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.monthKey} style={{ borderTop: "1px solid var(--divider)" }}>
                <td style={{ ...body, padding: "10px 14px", color: "var(--text-primary)" }}>{r.label}</td>
                <td style={{ ...mono, padding: "10px 14px", textAlign: "right", color: r.value ? "var(--text-primary)" : "var(--text-muted)" }}>{r.value ? formatCurrencyFull(r.value) : "—"}</td>
                <td style={{ ...mono, padding: "10px 14px", textAlign: "right", color: r.forecast ? "var(--accent)" : "var(--text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{r.forecast ? "Forecast" : "Historical"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportShell>
  );
}
