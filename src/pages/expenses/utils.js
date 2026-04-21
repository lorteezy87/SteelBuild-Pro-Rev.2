/**
 * Pure helpers for the Expenses page — CSV export, red-flag alert
 * computation, safe-number coercion.
 */

export const safeNum = (v) => Number(v) || 0;

/**
 * Red-flag alerts bubbled to the top of the page when something needs
 * attention: budget overrun, vendor concentration, stale unpaid
 * invoices.
 */
export function buildRedFlagAlerts({ totalCommitted, totalBudget, topVendors, activeExpenses, formatCurrencyShort }) {
  const alerts = [];
  const now = new Date();

  if (totalCommitted > totalBudget && totalBudget > 0) {
    alerts.push({
      key: "budget-overrun",
      severity: "red",
      text: `BUDGET EXCEEDED by ${formatCurrencyShort(totalCommitted - totalBudget)}`,
    });
  }

  if (topVendors.length > 0 && totalCommitted > 0) {
    const topVendor = topVendors[0];
    const vendorPct = Math.round((topVendor.total / totalCommitted) * 100);
    if (vendorPct > 40) {
      alerts.push({
        key: "vendor-concentration",
        severity: "amber",
        text: `VENDOR CONCENTRATION: ${topVendor.vendor} accounts for ${vendorPct}% of spend`,
      });
    }
  }

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const staleCount = activeExpenses.filter(
    (e) =>
      (e.payment_status === "Unpaid" || e.payment_status === "Pending Approval") &&
      e.expense_date &&
      new Date(e.expense_date) < thirtyDaysAgo
  ).length;
  if (staleCount > 0) {
    alerts.push({
      key: "stale-invoices",
      severity: "amber",
      text: `${staleCount} invoice${staleCount > 1 ? "s" : ""} unpaid for 30+ days`,
    });
  }

  return alerts;
}

/** CSV export for the filtered expense list. */
export function exportExpensesCSV(filtered, projectName) {
  const headers = [
    "Expense #", "Date", "Description", "Type", "Cost Code", "Cost Code Name",
    "Amount", "Quantity", "Unit", "Payment Status", "Vendor", "Invoice #",
    "Work Package", "SOV Item", "Submitted By", "Notes",
  ];
  const rows = filtered.map((e) => [
    e.expense_number, e.expense_date, e.description, e.expense_type,
    e.cost_code, e.cost_code_name, e.amount, e.quantity, e.unit,
    e.payment_status, e.vendor, e.invoice_number, e.work_package_name,
    e.sov_line_item_name, e.submitted_by, e.notes,
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${c ?? ""}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectName || "Project"}_Expenses_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
