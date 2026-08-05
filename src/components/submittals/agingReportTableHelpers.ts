export function td(
  align: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    padding: "6px 10px",
    textAlign: align,
    color: "var(--text-primary)",
    fontVariantNumeric: "tabular-nums",
    ...extra,
  };
}

export function stuckColor(days: number): string {
  if (days >= 30) return "var(--status-error)";
  if (days >= 14) return "var(--status-warning)";
  return "var(--text-primary)";
}

export const AGING_THRESHOLDS = [3, 7, 14, 30] as const;

export const AGING_COLUMNS = [
  { key: "number", label: "Number", align: "left" },
  { key: "title", label: "Title", align: "left" },
  { key: "status", label: "Status", align: "left" },
  { key: "bic", label: "BIC", align: "left" },
  { key: "daysStuck", label: "Days Stuck", align: "right" },
  { key: "lastActivityIso", label: "Last Activity", align: "right" },
] as const;

