/**
 * Pure helpers for the Portfolio Reports page: currency formatter,
 * health grader, date-range filter, CSV export, print.
 */

/**
 * Compact currency formatter — switches to "$12.3M" / "$456K" above
 * the $1K threshold. Kept separate from the shared formatters because
 * this one's tight shorthand is specific to KPI cards and table cells
 * that can't fit "$12,345,678.00".
 */
export const formatCurrency = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
};

/**
 * Project health based on actual-vs-budget variance.
 *   actual ≤ budget         → "good"
 *   variance 0–5% over      → "watch"
 *   variance > 5% over      → "risk"
 *   no budget at all        → "neutral"
 */
export const computeHealth = (budget, actual) => {
  if (!budget || budget <= 0) return "neutral";
  const var_pct = ((actual - budget) / budget) * 100;
  if (var_pct <= 0) return "good";
  if (var_pct <= 5) return "watch";
  return "risk";
};

/**
 * True if `dateStr` is inside the selected range. "all" is an escape
 * hatch and returns true unconditionally (and also true when the row
 * has no date). Used by the weekly / quarterly / ytd toggles.
 */
export function isInDateRange(dateStr, range) {
  if (range === "all" || !dateStr) return true;
  const d = new Date(dateStr);
  const now = new Date();
  if (range === "month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (range === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const qStart = new Date(now.getFullYear(), q * 3, 1);
    return d >= qStart && d <= now;
  }
  if (range === "ytd") {
    return d.getFullYear() === now.getFullYear() && d <= now;
  }
  return true;
}

export function exportReportCSV(rows, portfolioValue, openRFICount, pendingCOCount, budgetVar) {
  const headers = ["Project #", "Project Name", "Phase", "Health", "Budget", "Actual", "Variance", "Var %", "Open RFIs", "Open COs", "WP Progress %"];
  const csvRows = rows.map((r) => [
    r.number, r.name, r.phase, r.health,
    r.budget.toFixed(2), r.actual.toFixed(2), r.variance.toFixed(2),
    r.var_pct.toFixed(1) + "%", r.openRFIs, r.openCOs, r.wpPct.toFixed(0) + "%",
  ]);

  const summaryRows = [
    [], ["PORTFOLIO SUMMARY"],
    ["Total Value",      formatCurrency(portfolioValue)],
    ["Open RFIs",        openRFICount],
    ["Pending COs",      pendingCOCount],
    ["Budget Variance",  formatCurrency(budgetVar)],
    ["Generated",        new Date().toLocaleString()],
  ];

  const csv = [...[headers], ...csvRows, ...summaryRows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `portfolio_report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printReport() {
  window.print();
}
