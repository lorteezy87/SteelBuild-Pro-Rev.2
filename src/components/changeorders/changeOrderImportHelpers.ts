
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

export const monoStyle = { fontFamily: "var(--font-mono)" } as const;
export const displayStyle = {
  fontFamily: "'Space Grotesk', var(--font-display)",
} as const;
export const AI_ACCENT = "var(--ai-accent, #22D3EE)";

export const IMPORT_BTN_PRIMARY: Record<string, string | number> = {
  padding: "8px 22px",
  background: AI_ACCENT,
  color: "var(--on-accent)",
  border: "none",
  borderRadius: 2,
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};

export const IMPORT_BTN_GHOST: Record<string, string | number> = {
  padding: "8px 18px",
  background: "transparent",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--text-muted)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  cursor: "pointer",
};
