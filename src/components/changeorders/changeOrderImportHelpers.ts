
/** Pure display helpers for ChangeOrderImportModal. */

export function statusColor(s: unknown): string {
  switch (String(s || "").toLowerCase()) {
    case "approved":
      return "var(--status-success)";
    case "rejected":
      return "var(--status-error)";
    case "void":
      return "var(--text-muted)";
    case "draft":
      return "var(--text-muted)";
    case "submitted":
      return "var(--status-info, #3B82F6)";
    case "under review":
      return "var(--status-warning)";
    default:
      return "var(--text-muted)";
  }
}

export function formatMoney(n: unknown): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}
