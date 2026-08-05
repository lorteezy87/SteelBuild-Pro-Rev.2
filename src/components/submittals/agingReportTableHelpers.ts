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
