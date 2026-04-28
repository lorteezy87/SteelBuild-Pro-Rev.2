/**
 * Weekly Cost Categories — expenses grouped by ISO-week × cost_code,
 * last 12 weeks. Stacked bar chart by week + cross-tab table below.
 *
 * Spec called for `cost_code_id`, but the expenses schema actually
 * stores `cost_code` (free-text/code) and `cost_code_name` (display
 * label). We group by cost_code_name when present, falling back to
 * cost_code, and finally to "Uncategorised".
 */

import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ReportShell from "./ReportShell";
import { formatCurrencyFull, formatCurrency, exportTableCSV } from "./utils";
import { mono, body, CARD, CARD_TITLE } from "./constants";

// Stable color palette for cost categories — picked to avoid purple/pink
// per CLAUDE.md, drawn from the existing CSS var palette.
const CATEGORY_COLORS = [
  "var(--accent)",
  "var(--status-success)",
  "var(--status-warning)",
  "var(--status-info)",
  "var(--status-error)",
  "var(--phase-fab)",
  "var(--phase-detailing)",
  "var(--phase-erection)",
  "var(--phase-closeout)",
  "var(--text-secondary)",
];

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
  const keys = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i * 7);
    keys.push(isoWeekKey(d));
  }
  // De-dup in case of timezone weirdness
  return Array.from(new Set(keys));
}

export default function WeeklyCostCategories() {
  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => base44.entities.Expense.list(),
  });

  const weekKeys = useMemo(() => lastNWeekKeys(12), []);

  // Aggregate matrix[week][category] = total
  const { matrix, categories, weeklyTotals } = useMemo(() => {
    const m = {};
    weekKeys.forEach((k) => { m[k] = {}; });
    const cats = new Set();
    for (const e of expenses) {
      const dateSrc = e.expense_date || e.invoice_date || e.payment_date;
      if (!dateSrc) continue;
      const wk = isoWeekKey(new Date(dateSrc));
      if (!(wk in m)) continue;
      const cat = e.cost_code_name || e.cost_code || "Uncategorised";
      const amt = Number(e.amount) || 0;
      if (e.payment_status === "Voided") continue;
      m[wk][cat] = (m[wk][cat] || 0) + amt;
      cats.add(cat);
    }
    const catList = Array.from(cats).sort();
    const totals = Object.fromEntries(weekKeys.map((k) => [k, catList.reduce((s, c) => s + (m[k][c] || 0), 0)]));
    return { matrix: m, categories: catList, weeklyTotals: totals };
  }, [expenses, weekKeys]);

  const colorFor = (cat) => CATEGORY_COLORS[categories.indexOf(cat) % CATEGORY_COLORS.length] || "var(--text-muted)";

  const maxWeekly = Math.max(1, ...Object.values(weeklyTotals));
  const grandTotal = Object.values(weeklyTotals).reduce((s, v) => s + v, 0);

  const tableRows = weekKeys.map((k) => {
    const ws = isoWeekStart(k);
    return {
      id: k,
      weekKey: k,
      weekLabel: `${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      total: weeklyTotals[k] || 0,
      ...categories.reduce((acc, c) => ({ ...acc, [c]: matrix[k][c] || 0 }), {}),
    };
  });

  const tableColumns = [
    { key: "weekLabel", label: "Week" },
    ...categories.map((c) => ({ key: c, label: c, csvValue: (r) => (r[c] || 0).toFixed(2) })),
    { key: "total", label: "Total", csvValue: (r) => r.total.toFixed(2) },
  ];

  return (
    <ReportShell
      title="Weekly Cost Categories"
      count={categories.length}
      unit=" · CATEGORIES"
      subtitle={`${formatCurrencyFull(grandTotal)} of expenses across the last ${weekKeys.length} weeks.`}
      onExportCSV={() => exportTableCSV({
        filename: "weekly_cost_categories",
        columns: tableColumns,
        rows: tableRows,
        summary: { "Grand Total": formatCurrencyFull(grandTotal), "Categories": categories.length, "Generated": new Date().toLocaleString() },
      })}
    >
      {/* Stacked bar chart */}
      <div style={{ ...CARD }}>
        <div style={CARD_TITLE}>Weekly Spend by Category</div>
        {grandTotal === 0 ? (
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", padding: "32px 0", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            No expenses logged in the last 12 weeks.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, paddingBottom: 28, position: "relative", borderBottom: "1px solid var(--divider)" }}>
              {weekKeys.map((wk) => {
                const total = weeklyTotals[wk] || 0;
                const ws = isoWeekStart(wk);
                const heightPct = (total / maxWeekly) * 100;
                return (
                  <div key={wk} style={{ flex: 1, minWidth: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative", height: "100%" }}>
                    <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", maxWidth: 28, margin: "0 auto" }}>
                      <div title={`${formatCurrencyFull(total)}`} style={{ width: "100%", height: `${heightPct}%`, background: "var(--bg-surface-low)", borderRadius: "3px 3px 0 0", display: "flex", flexDirection: "column-reverse", overflow: "hidden", border: "1px solid var(--divider)" }}>
                        {categories.map((c) => {
                          const v = matrix[wk][c] || 0;
                          if (!v) return null;
                          const segPct = (v / total) * 100;
                          return <div key={c} style={{ width: "100%", height: `${segPct}%`, background: colorFor(c) }} />;
                        })}
                      </div>
                    </div>
                    <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", whiteSpace: "nowrap", position: "absolute", bottom: -22 }}>
                      {ws.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 8 }}>
              {categories.map((c) => (
                <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: colorFor(c) }} />
                  <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{c}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cross-tab table */}
      <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
        <div style={{ ...CARD_TITLE, padding: "16px 20px", margin: 0 }}>Week × Category</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ background: "var(--bg-surface-low)", borderTop: "1px solid var(--divider)" }}>
                <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, position: "sticky", left: 0, background: "var(--bg-surface-low)" }}>Week of</th>
                {categories.map((c) => (
                  <th key={c} style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>{c}</th>
                ))}
                <th style={{ ...mono, fontSize: 9, color: "var(--text-muted)", padding: "10px 14px", textAlign: "right", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.weekKey} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td style={{ ...body, padding: "10px 14px", color: "var(--text-primary)", fontWeight: 600 }}>{r.weekLabel}</td>
                  {categories.map((c) => (
                    <td key={c} style={{ ...mono, padding: "10px 14px", textAlign: "right", color: r[c] ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {r[c] ? formatCurrency(r[c]) : "—"}
                    </td>
                  ))}
                  <td style={{ ...mono, padding: "10px 14px", textAlign: "right", color: "var(--text-primary)", fontWeight: 700 }}>{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
